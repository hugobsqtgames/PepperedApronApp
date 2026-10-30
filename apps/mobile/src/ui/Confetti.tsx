import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const Ctx = createContext<() => void>(() => undefined);

/** Paper colours: the brand's, plus a few festive ones. */
const COLORS = ['#D2642A', '#1F4D3A', '#E8B04B', '#86C1A2', '#C9473B', '#F2ECE1', '#6E8FD8'];
const PIECES = 42;

interface Piece {
  x: number;
  drift: number;
  size: number;
  color: string;
  spin: number;
  delay: number;
  round: boolean;
}

/**
 * A short shower of paper confetti for the moments worth it (first dish, 10th, 50th, a badge
 * won). Not shown with Reduce Motion: the toast and the haptic say it already.
 */
export function ConfettiProvider({ children }: { children: ReactNode }) {
  const { a11y } = useTheme();
  const { width, height } = useWindowDimensions();
  const [shot, setShot] = useState<{ id: number; pieces: Piece[] } | null>(null);
  const progress = useRef(new Animated.Value(0)).current;

  const fire = useCallback(() => {
    if (a11y.reduceMotion) return;
    const pieces = Array.from({ length: PIECES }, (_, i) => ({
      x: Math.random() * width,
      drift: (Math.random() - 0.5) * 160,
      size: 6 + Math.random() * 7,
      color: COLORS[i % COLORS.length]!,
      spin: (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 4),
      delay: Math.random() * 0.25,
      round: Math.random() < 0.3,
    }));
    progress.setValue(0);
    setShot({ id: Date.now(), pieces });
    Animated.timing(progress, {
      toValue: 1,
      duration: 2400,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setShot(null));
  }, [a11y.reduceMotion, width, progress]);

  return (
    <Ctx.Provider value={fire}>
      {children}
      {shot ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti">
          {shot.pieces.map((p, i) => {
            const t = progress.interpolate({
              inputRange: [0, p.delay, 1],
              outputRange: [0, 0, 1],
            });
            return (
              <Animated.View
                key={`${shot.id}-${i}`}
                style={{
                  position: 'absolute',
                  left: p.x,
                  top: -20,
                  width: p.size,
                  height: p.round ? p.size : p.size * 0.45,
                  borderRadius: p.round ? p.size / 2 : 1.5,
                  backgroundColor: p.color,
                  opacity: t.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
                  transform: [
                    {
                      translateY: t.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, height * 0.9],
                      }),
                    },
                    {
                      translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }),
                    },
                    {
                      rotate: t.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', `${p.spin * 360}deg`],
                      }),
                    },
                  ],
                }}
              />
            );
          })}
        </View>
      ) : null}
    </Ctx.Provider>
  );
}

export const useConfetti = () => useContext(Ctx);
