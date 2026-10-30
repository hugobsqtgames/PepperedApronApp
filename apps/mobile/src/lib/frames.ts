/** A picture taken from a video: where it is, when, and how sharp and well exposed it is. */
export interface ScoredFrame {
  uri: string;
  time: number;
  score: number;
}

/**
 * The pictures to offer as the recipe photo: the best ones first, at least `gap` seconds apart
 * so they show different moments of the video (not six times the same shot).
 */
export function pickFrames(frames: ScoredFrame[], count = 6, gap = 2.5): string[] {
  const chosen: ScoredFrame[] = [];
  for (const f of [...frames].sort((a, b) => b.score - a.score)) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => Math.abs(c.time - f.time) >= gap)) chosen.push(f);
  }
  return chosen.map((f) => f.uri);
}
