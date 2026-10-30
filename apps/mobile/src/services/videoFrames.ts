import { Directory, File, Paths } from 'expo-file-system';

/**
 * Pictures taken from an imported video, kept a while next to the recipe so the editor can offer
 * them as its photo ("Choose a picture from the video"). They live in the caches folder: iOS may
 * empty it, and then the editor simply does not offer them any more.
 */
const root = () => new Directory(Paths.cache, 'video-frames');
const dirFor = (recipeId: string) => new Directory(root(), `recipe-${recipeId}`);

/** Move the pictures of an import next to the recipe saved from it (best first). */
export async function keepFramesFor(recipeId: string, uris: string[]) {
  if (!uris.length) return;
  try {
    const dir = dirFor(recipeId);
    if (!dir.exists) dir.create({ intermediates: true });
    for (const [i, uri] of uris.entries()) {
      const f = new File(uri);
      if (f.exists) await f.move(new File(dir, `${i}.jpg`));
    }
  } catch {
    // Only a convenience: the recipe is saved either way.
  }
}

/** The pictures kept for a recipe, best first; [] when there are none (or iOS removed them). */
export function framesFor(recipeId: string): string[] {
  try {
    const dir = dirFor(recipeId);
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((e): e is File => e instanceof File && e.name.endsWith('.jpg'))
      .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
      .map((f) => f.uri);
  } catch {
    return [];
  }
}

/** Forget the pictures of a recipe (once a photo is chosen, or when it is deleted). */
export function dropFrames(recipeId: string) {
  try {
    const dir = dirFor(recipeId);
    if (dir.exists) dir.delete();
  } catch {
    // Caches folder.
  }
}
