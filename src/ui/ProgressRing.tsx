import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '@/theme';

/**
 * A ring that fills clockwise from 12 o'clock. `marks` are highlighted stretches drawn underneath, as
 * fractions of the whole: the capture screen marks the slow-motion window, so the operator knows when to spin
 * fastest.
 */
export function ProgressRing({
  size,
  stroke,
  progress,
  marks = [],
  color = colors.overlayText,
  markColor = colors.accentText,
}: {
  size: number;
  stroke: number;
  progress: number;
  marks?: { from: number; to: number }[];
  color?: string;
  markColor?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = (from: number, to: number) => {
    const start = clamp01(from);
    const length = Math.max(0, clamp01(to) - start) * c;
    return { strokeDasharray: `${length} ${c}`, strokeDashoffset: -start * c };
  };

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} style={styles.rotate}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={stroke}
          fill="none"
        />
        {marks.map((m, i) => (
          <Circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={markColor}
            strokeOpacity={0.55}
            strokeWidth={stroke}
            fill="none"
            {...arc(m.from, m.to)}
          />
        ))}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          {...arc(0, progress)}
        />
      </Svg>
    </View>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const styles = StyleSheet.create({ rotate: { transform: [{ rotate: '-90deg' }] } });
