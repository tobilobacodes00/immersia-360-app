import * as Haptics from 'expo-haptics';
import { Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, hitSize, radius } from '@/theme';

const REPEAT_DELAY_MS = 400;
const REPEAT_EVERY_MS = 90;

/**
 * − | + buttons. Holding a button repeats after a short delay. Each button disables itself at its limit, as
 * in the reference (the + of Record time at 20 s). The value itself is shown by the row, not here.
 */
export function Stepper({
  value,
  min,
  max,
  step,
  onChange,
  label,
  format = String,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  /** Used for the accessibility labels: "Decrease Countdown". */
  label: string;
  format?: (v: number) => string;
}) {
  // The repeat timer reads the latest value and limits, not the ones from when the press began.
  const latest = useRef({ value, min, max, step, onChange });
  latest.current = { value, min, max, step, onChange };
  const repeat = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const stop = () => {
    clearInterval(repeat.current);
    repeat.current = undefined;
  };
  useEffect(() => stop, []);

  const nudge = (direction: 1 | -1): boolean => {
    const { value: v, min: lo, max: hi, step: s, onChange: change } = latest.current;
    // Snap to the step grid first, so 8.8 steps to 9.0 / 8.5 rather than 9.3 / 8.3.
    const snapped = direction > 0 ? Math.floor(v / s + 1e-9) * s + s : Math.ceil(v / s - 1e-9) * s - s;
    const next = Math.round(Math.min(hi, Math.max(lo, snapped)) * 10) / 10;
    if (next === v) return false;
    change(next);
    void Haptics.selectionAsync();
    return true;
  };

  // Runs once the press has been held for REPEAT_DELAY_MS (the Pressable long press), then keeps stepping.
  const start = (direction: 1 | -1) => {
    stop();
    if (!nudge(direction)) return;
    repeat.current = setInterval(() => {
      if (!nudge(direction)) stop();
    }, REPEAT_EVERY_MS);
  };

  return (
    <View
      style={styles.well}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <Half
        icon={Minus}
        disabled={value <= min}
        label={`Decrease ${label}`}
        onPress={() => nudge(-1)}
        onHold={() => start(-1)}
        onRelease={stop}
      />
      <View style={styles.divider} />
      <Half
        icon={Plus}
        disabled={value >= max}
        label={`Increase ${label}`}
        onPress={() => nudge(1)}
        onHold={() => start(1)}
        onRelease={stop}
      />
    </View>
  );
}

function Half({
  icon: Icon,
  disabled,
  label,
  onPress,
  onHold,
  onRelease,
}: {
  icon: LucideIcon;
  disabled: boolean;
  label: string;
  onPress: () => void;
  onHold: () => void;
  onRelease: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onHold}
      delayLongPress={REPEAT_DELAY_MS}
      onPressOut={onRelease}
      style={({ pressed }) => [styles.half, pressed && styles.pressed]}
    >
      <Icon size={20} color={disabled ? colors.textDisabled : colors.text} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  well: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    height: hitSize - 6,
  },
  half: {
    width: 54,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  divider: { width: StyleSheet.hairlineWidth, height: 18, backgroundColor: colors.lineStrong },
});
