import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { newlyWon } from '@pepperedapron/core';
import { useRepos } from '../hooks/runtime';
import { haptic } from '../services/haptics';
import { useConfetti, useToast } from '../ui';
import { badgesOf } from './kitchen';

/** Dishes worth a celebration, besides the first one and badges. */
const MILESTONES = new Set([10, 25, 50, 100, 150, 200, 300, 500, 1000]);

/**
 * Wraps "this recipe was cooked": when it is the first dish, a round number, or wins a badge,
 * confetti, a "ta-da" haptic and a toast. Otherwise just the usual success haptic.
 */
export function useCookCelebration() {
  const repos = useRepos();
  const confetti = useConfetti();
  const toast = useToast();
  const { t } = useTranslation();
  return useCallback(
    async <T>(log: () => Promise<T>): Promise<T> => {
      const before = badgesOf(repos);
      const count = repos.allCookLogs().length;
      const out = await log();
      const after = repos.allCookLogs().length;
      const won = newlyWon(before, badgesOf(repos));
      const message =
        after > count && after === 1
          ? t('delight.celebrate.first')
          : won.length
            ? t('delight.badges.won', { name: t(`delight.badges.items.${won[0]!}.title`) })
            : after > count && MILESTONES.has(after)
              ? t('delight.celebrate.milestone', { count: after })
              : null;
      if (message) {
        confetti();
        haptic.celebrate();
        toast(message);
      } else haptic.success();
      return out;
    },
    [repos, confetti, toast, t],
  );
}
