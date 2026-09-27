import { router } from 'expo-router';
import { parseRecipeText, type RecipeDraft } from '@pepperedapron/core';
import { recipeFromDraft } from '@pepperedapron/client';
import { runtime } from '../../services/runtime';
import { draftStore, type EditorDraft } from '../../services/drafts';

/** Open the editor pre-filled with an import result. Nothing is saved until the user confirms. */
export function openDraft(d: RecipeDraft, opts: { notice: EditorDraft['notice']; localImageUri?: string | null; replace?: boolean }) {
  const servings = runtime.session?.repos.settings().defaultServings ?? 4;
  const key = draftStore.put({ data: recipeFromDraft(d, servings), imageUrl: d.imageUrl, localImageUri: opts.localImageUri ?? null, notice: opts.notice });
  const go = opts.replace === false ? router.push : router.replace;
  go({ pathname: '/recipe/edit', params: { draft: key } });
}

export function openTextDraft(text: string, extra: Partial<RecipeDraft> = {}, notice: EditorDraft['notice'] = 'text', localImageUri: string | null = null) {
  const d = parseRecipeText(text);
  openDraft({ ...d, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== null && v !== undefined)) } as RecipeDraft, { notice, localImageUri });
}
