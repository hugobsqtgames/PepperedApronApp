import { runtime } from './runtime';

/**
 * First-party, opt-in analytics. Events carry no content (no titles, no text), only a name, a
 * timestamp and a few enumerated properties. Nothing is sent without consent.
 */
export type EventName =
  | 'app_open' | 'recipe_created' | 'recipe_viewed' | 'recipe_published' | 'favorite_added' | 'collection_created'
  | 'meal_planned' | 'shopping_generated' | 'shopping_item_checked' | 'import_url' | 'import_text' | 'import_image'
  | 'import_share_extension' | 'recipe_shared' | 'cook_mode_started' | 'cook_mode_finished' | 'timer_started' | 'search'
  | 'household_joined' | 'error_shown';

let queue: { name: EventName; at: string; props?: Record<string, string | number | boolean> }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function consent(): boolean {
  try {
    return runtime.session?.repos.settings().analyticsConsent === true;
  } catch {
    return false;
  }
}

export function track(name: EventName, props?: Record<string, string | number | boolean>) {
  if (!consent()) return;
  queue.push({ name, at: new Date().toISOString(), props });
  if (queue.length >= 20) void flush();
  else if (!timer) timer = setTimeout(() => void flush(), 30_000);
}

export async function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length || !consent()) {
    queue = [];
    return;
  }
  const batch = queue.splice(0, 50);
  try {
    await runtime.api.trackEvents(batch);
  } catch {
    // Analytics are best-effort; dropped on failure.
  }
}
