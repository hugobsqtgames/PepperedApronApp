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

export interface Subtitles {
  /** WebVTT file of the video's subtitles (automatic speech recognition by the platform). */
  url: string;
  language: string | null;
}

export interface SocialCaption {
  caption: string | null;
  author: string | null;
  image: string | null;
  subtitles: Subtitles | null;
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
              /** The caption split in its original lines. */
              contents?: { desc?: string }[];
              author?: { nickname?: string; uniqueId?: string };
              video?: {
                cover?: string;
                originCover?: string;
                subtitleInfos?: {
                  Url?: string;
                  Format?: string;
                  LanguageCodeName?: string;
                  Source?: string;
                }[];
              };
            };
          };
        }
      >;
    };
    const item = data.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!item) return null;
    const image = item.video?.originCover ?? item.video?.cover ?? null;
    const lines = item.contents?.map((c) => c.desc ?? '');
    const caption = lines?.some((l) => l.trim()) ? lines.join('\n') : item.desc;
    // Prefer the original-language recognition over machine translations.
    const subs = (item.video?.subtitleInfos ?? []).filter(
      (x) => x.Url && /^https:\/\//.test(x.Url) && (x.Format ?? 'webvtt') === 'webvtt',
    );
    const sub = subs.find((x) => x.Source === 'ASR') ?? subs[0];
    return {
      caption: caption?.trim() || null,
      author: item.author?.nickname || item.author?.uniqueId || null,
      image: image && /^https:\/\//.test(image) ? image : null,
      subtitles: sub ? { url: sub.Url!, language: sub.LanguageCodeName ?? null } : null,
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

/** JSON array starting at `from` (balanced brackets, strings respected). */
function jsonArrayAt(text: string, from: number): unknown[] | null {
  if (text[from] !== '[') return null;
  let depth = 0;
  let inString = false;
  for (let i = from; i < text.length && i < from + 200_000; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(from, i + 1)) as unknown[];
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** YouTube subtitles: a creator's own track first, else the automatic one. */
export function youtubeSubtitles(html: string): Subtitles | null {
  const key = '"captionTracks":';
  const at = html.indexOf(key);
  if (at < 0) return null;
  const tracks = (jsonArrayAt(html, at + key.length) ?? []) as {
    baseUrl?: string;
    languageCode?: string;
    kind?: string;
  }[];
  const ok = tracks.filter((t) => t.baseUrl && /^https:\/\/www\.youtube\.com\//.test(t.baseUrl));
  const t = ok.find((x) => x.kind !== 'asr') ?? ok[0];
  if (!t) return null;
  return { url: `${t.baseUrl}&fmt=vtt`, language: t.languageCode ?? null };
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

/** Caption of Instagram's public embed page (`/p/<code>/embed/captioned/`). */
export function instagramEmbedCaption(
  html: string,
): { caption: string; author: string | null; image: string | null } | null {
  const block = html.match(/<div class="Caption">([\s\S]*?)<\/div>/)?.[1];
  if (!block) return null;
  const author = block.match(/class="CaptionUsername"[^>]*>([^<]+)</)?.[1]?.trim() ?? null;
  const text = decodeEntities(
    block
      .replace(/<a class="CaptionUsername"[\s\S]*?<\/a>/, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const img = html.match(/<img[^>]+class="EmbeddedMediaImage"[^>]+src="([^"]+)"/)?.[1];
  const image = img ? decodeEntities(img) : null;
  return text
    ? { caption: text, author, image: image && /^https:\/\//.test(image) ? image : null }
    : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/** Direct link of a public Instagram video (reel), found in the post or embed page. */
export function instagramVideoUrl(html: string): string | null {
  const key = '"video_versions":';
  const at = html.indexOf(key);
  if (at >= 0) {
    const versions = (jsonArrayAt(html, at + key.length) ?? []) as { url?: string }[];
    const url = versions.find((v) => v.url && /^https:\/\//.test(v.url))?.url;
    if (url) return url;
  }
  // Embed page: the data is a JSON string inside a script, so it is escaped once more
  // (\"video_url\":\"https:\\\/\\\/…\").
  const marker = '\\"video_url\\":\\"';
  const start = html.indexOf(marker);
  if (start >= 0) {
    const from = start + marker.length;
    const end = html.indexOf('\\"', from);
    const url = html
      .slice(from, end)
      .replace(/\\+\//g, '/')
      .replace(/\\+u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    if (end > from && /^https:\/\/[^\s"\\]+$/.test(url)) return url;
  }
  return null;
}

const STOPWORDS: Record<'fr' | 'en' | 'es' | 'de' | 'it', string[]> = {
  fr: [
    'le',
    'la',
    'les',
    'et',
    'de',
    'des',
    'du',
    'un',
    'une',
    'pour',
    'avec',
    'dans',
    'est',
    'je',
    'vous',
  ],
  en: ['the', 'and', 'of', 'to', 'with', 'for', 'in', 'is', 'you', 'it', 'this', 'then'],
  es: ['el', 'los', 'las', 'y', 'con', 'para', 'del', 'una', 'es', 'que', 'por', 'se'],
  de: ['der', 'die', 'das', 'und', 'mit', 'für', 'ein', 'eine', 'ist', 'den', 'dem', 'zu'],
  it: ['il', 'lo', 'gli', 'e', 'con', 'per', 'della', 'una', 'è', 'che', 'del', 'di'],
};

/** Most likely language of a caption (fr, en, es, de, it), or null when it is too short to tell. */
export function guessLanguage(text: string): 'fr' | 'en' | 'es' | 'de' | 'it' | null {
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  if (words.length < 5) return null;
  let best: 'fr' | 'en' | 'es' | 'de' | 'it' | null = null;
  let bestScore = 0;
  for (const [lang, list] of Object.entries(STOPWORDS) as [keyof typeof STOPWORDS, string[]][]) {
    const set = new Set(list);
    const score = words.filter((w) => set.has(w)).length;
    if (score > bestScore) {
      best = lang;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}
