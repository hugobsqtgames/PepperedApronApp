import type { RecipeData } from '@pepperedapron/core';

export interface EditorDraft {
  data: RecipeData;
  /** Remote image found by an importer (downloaded only if the user keeps it). */
  imageUrl: string | null;
  /** Local image (shared photo, OCR source) to attach on save. */
  localImageUri: string | null;
  notice: 'full' | 'partial' | 'minimal' | 'text' | 'photo' | null;
}

const drafts = new Map<string, EditorDraft>();
let n = 0;

/** In-memory hand-off from import screens to the editor (never persisted: the editor saves). */
export const draftStore = {
  put(d: EditorDraft): string {
    const key = `d${Date.now()}-${++n}`;
    drafts.set(key, d);
    return key;
  },
  get: (key: string) => drafts.get(key) ?? null,
  drop: (key: string) => void drafts.delete(key),
};
