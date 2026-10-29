/**
 * Reading the public caption of a social video (TikTok, YouTube, Instagram) from the page a
 * browser would get. Only public data embedded in the page is read; nothing behind a login.
 */

/** Value of a JSON string literal found in a page (`"key":"…"`), decoded. */
function jsonString(html: string, key: string): string | null {
  const m = html.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.){1,20000})"`));
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return null;
  }
}

export interface SocialCaption {
  caption: string | null;
  author: string | null;
  image: string | null;
}

/** TikTok video page: the caption lives in the page's rehydration JSON. */
export function tiktokCaption(html: string): SocialCaption | null {
  const m = html.match(
    /<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]!) as {
      __DEFAULT_SCOPE__?: Record<
        string,
        {
          itemInfo?: {
            itemStruct?: {
              desc?: string;
              author?: { nickname?: string; uniqueId?: string };
              video?: { cover?: string; originCover?: string };
            };
          };
        }
      >;
    };
    const item = data.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!item) return null;
    const image = item.video?.originCover ?? item.video?.cover ?? null;
    return {
      caption: item.desc?.trim() || null,
      author: item.author?.nickname || item.author?.uniqueId || null,
      image: image && /^https:\/\//.test(image) ? image : null,
    };
  } catch {
    return null;
  }
}

/** YouTube watch page: full description (player data, or the description panel). */
export function youtubeDescription(html: string): string | null {
  const d = jsonString(html, 'shortDescription');
  if (d?.trim()) return d.trim();
  const m = html.match(
    /"attributedDescription"\s*:\s*\{\s*"content"\s*:\s*"((?:[^"\\]|\\.){1,20000})"/,
  );
  if (!m) return null;
  try {
    return (JSON.parse(`"${m[1]}"`) as string).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Instagram puts the caption in the page description, after a prefix such as
 * `12 likes, 3 comments - chef on March 2, 2024: "…"`.
 */
export function instagramCaption(description: string): string {
  const m = description.match(/^[^"“]*?:\s*["“]([\s\S]*)["”]\.?\s*$/);
  return (m ? m[1]! : description).trim();
}

const SECTION_WORDS =
  'ingr[ée]dients?|ingredientes|zutaten|ingredienti|pr[ée]paration|instructions?|[ée]tapes?|steps?|method|directions|zubereitung|preparaci[óo]n|procedimento|preparazione';

/**
 * Captions are often flattened onto one line (TikTok removes line breaks): rebuild the lines the
 * text parser expects — one per ingredient ("- 200 g de pâtes", "• 2 oignons"), one per numbered
 * step ("1. Couper…"), and section headers on their own line.
 */
export function unflattenCaption(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const flat = lines.length <= 3 && text.length > 120;
  if (!flat) return text;
  return (
    text
      // Section headers ("Ingrédients pour 2 personnes :") start a new line and end with one.
      .replace(new RegExp(`\\s*\\b(${SECTION_WORDS})\\b([^:\\n]{0,40}:)`, 'gi'), '\n$1$2\n')
      // List bullets.
      .replace(/\s+[-–•·▪✅🔸]\s*(?=\S)/gu, '\n- ')
      // Numbered steps: "1." / "2)" preceded by a space and followed by text.
      .replace(/\s+(\d{1,2})\s*[.)]\s*(?=\p{L})/gu, '\n$1. ')
      // Sign-offs are not part of the last ingredient or step.
      .replace(/\s+(bon app[ée]tit|enjoy|buen provecho|guten appetit|buon appetito)\b/giu, '\n$1')
      // Hashtags at the end go on their own line.
      .replace(/\s+(#[\p{L}\d_]+(?:\s+#[\p{L}\d_]+)*)\s*$/u, '\n$1')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join('\n')
  );
}

/**
 * A readable recipe title from a caption: its first sentence, without "Replying to @…",
 * mentions, hashtags or trailing emoji.
 */
export function captionTitle(caption: string): string | null {
  const first = unflattenCaption(caption).split('\n')[0] ?? '';
  const cleaned = first
    .replace(/^(?:r[ée]ponse [àa]|replying to|respuesta a|antwort an|risposta a)\s+@\S+\s*/iu, '')
    .replace(/[#@][\p{L}\d_.]+/gu, '')
    .trim();
  // First sentence: ends with punctuation, or with an emoji followed by a new capitalised phrase.
  const sentence = cleaned
    .split(/(?<=[.!?])\s|(?<=\p{Extended_Pictographic}\ufe0f?)\s+(?=\p{Lu})/u)[0]!
    .trim();
  // "Pâtes crémeuses (petit budget): INGRÉDIENTS…" → what comes before the colon.
  const beforeColon = (sentence || cleaned).split(/\s*[:：]\s/)[0]!;
  const out = beforeColon
    .replace(/(?:\s|\p{Extended_Pictographic}|\u200d|\ufe0f)+$/u, '')
    .replace(/[\s:.!]+$/, '')
    .trim();
  return out ? out.slice(0, 120) : null;
}
