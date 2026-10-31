import { normalizeText } from '../text';

/**
 * Text read on a screenshot (a story, a post, a message, a web page) also holds the phone's and
 * the app's own words: the status bar, buttons, counters, user names, timestamps. They are taken
 * out before the recipe is read, so they do not end up as ingredients or steps.
 */

/** Lines that are the status bar: "9:41", "87 %", "5G", "LTE", "Wi-Fi". */
const STATUS =
  /^(?:\d{1,2}[:.]\d{2}(?:\s*(?:am|pm))?|\d{1,3}\s*%|[345]g\+?|lte|e|h\+?|wi-?fi|sos|•+|[.·•\s]+)$/i;
/** App buttons and labels (Instagram, TikTok, Facebook, Pinterest, Messages, WhatsApp, Safari). */
const CHROME = new RegExp(
  `^(?:${[
    "j'aime",
    'aime',
    'aimer',
    'repondre',
    'repondu',
    'voir la traduction',
    'voir plus',
    'voir moins',
    '\\.\\.\\. ?plus',
    'plus',
    'afficher plus',
    'afficher la traduction',
    'envoyer un message',
    'envoyer',
    'message',
    'messages',
    'ajouter un commentaire',
    'ajoutez un commentaire',
    'commenter',
    'commentaires?',
    'partager',
    'enregistrer',
    'enregistre',
    "s'abonner",
    'abonne',
    'abonnements?',
    'abonnes',
    'suivre',
    'suivi',
    'suggestions?',
    'sponsorise',
    'publicite',
    'audio original',
    'son original',
    'traduction',
    'aujourd.hui',
    'hier',
    'lu',
    'distribue',
    'remise',
    'imessage',
    'sms',
    'like',
    'liked',
    'likes',
    'reply',
    'replies',
    'view replies',
    'see translation',
    'see more',
    'more',
    'send message',
    'send',
    'add a comment',
    'comments?',
    'share',
    'save',
    'saved',
    'follow',
    'following',
    'followers',
    'sponsored',
    'original audio',
    'today',
    'yesterday',
    'read',
    'delivered',
    'pour toi',
    'for you',
    'explorer',
    'accueil',
    'home',
    'reels?',
    'stories',
    'profil',
    'profile',
    'search',
    'rechercher',
    'recherche',
    'annuler',
    'cancel',
    'ok',
    'done',
    'termine',
    'retour',
    'back',
  ].join('|')})[\\s.!:]*$`,
  'i',
);
/** "2 h", "il y a 3 jours", "3 d ago", "12 min", "1 sem.", dates of messages. */
const TIMESTAMP =
  /^(?:il y a\s+)?\d{1,3}\s*(?:s|min|h|j|jours?|sem\.?|semaines?|mois|ans?|d|w|m|y|hrs?|days?|weeks?|months?|years?)(?:\s+ago)?$/i;
/** Counters: "1 234 j'aime", "12,5 k", "3 réponses", "Voir les 24 commentaires". */
const COUNTER =
  /^(?:voir (?:les |la )?)?[\d\s.,]+\s*[km]?\s*(?:j'aime|likes?|vues?|views?|reponses?|replies|commentaires?|comments?|partages?|shares?|enregistrements?|saves?|abonnes|followers)?$/i;
/** "@chef.marie", "chef.marie • Suivre", "#recette #facile". */
const HANDLE = /^(?:@[\w.]+|[\w.]{3,30}\s*[•·]\s*(?:suivre|follow|abonne)|(?:#[\p{L}\d_]+\s*)+)$/iu;
/** Web browser bars: "pepperedapron.app", "marmiton.org — Privé", "AA". */
const ADDRESS = /^(?:aa|[\w-]+(?:\.[\w-]+)+(?:\/\S*)?(?:\s*[—-]\s*\S+)?)$/i;

function isChrome(line: string): boolean {
  const t = normalizeText(line)
    .replace(/[^\p{L}\p{N}\s'.,:%#@•·/+-]/gu, '')
    .trim();
  if (!t) return true;
  return (
    STATUS.test(t) ||
    CHROME.test(t) ||
    TIMESTAMP.test(t) ||
    COUNTER.test(t) ||
    HANDLE.test(t) ||
    ADDRESS.test(t)
  );
}

/** The text of a screenshot without the phone's and the app's own words. */
export function cleanScreenshotText(text: string): string {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !isChrome(l))
    .join('\n')
    .trim();
}

/**
 * True when the picture looks like a screenshot of a phone: a status bar line ("9:41") near the
 * top of the text, or several app labels.
 */
export function looksLikeScreenshot(text: string): boolean {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const top = lines.slice(0, 4);
  if (top.some((l) => /^\d{1,2}[:.]\d{2}$/.test(l))) return true;
  return lines.filter(isChrome).length >= 3;
}
