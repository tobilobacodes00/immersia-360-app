import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, hitSize, radius, space } from '@/theme';

import { Text } from './Text';

type Kind = 'primary' | 'secondary' | 'ghost' | 'destructive';

const look: Record<
  Kind,
  { bg: string; pressed: string; text: 'onAccent' | 'default' | 'accent' | 'danger'; border?: string }
> = {
  primary: { bg: colors.accent, pressed: colors.accentPressed, text: 'onAccent' },
  secondary: {
    bg: colors.surfaceRaised,
    pressed: colors.surfacePressed,
    text: 'default',
    border: colors.lineStrong,
  },
  ghost: { bg: 'transparent', pressed: colors.surfacePressed, text: 'accent' },
  destructive: {
    bg: colors.surfaceRaised,
    pressed: colors.surfacePressed,
    text: 'danger',
    border: colors.lineStrong,
  },
};

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon: Icon,
  disabled,
  busy,
  size = 'regular',
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: Kind;
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
  size?: 'regular' | 'large';
  style?: StyleProp<ViewStyle>;
}) {
  const l = look[kind];
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'large' && styles.large,
        { backgroundColor: pressed ? l.pressed : l.bg },
        l.border && { borderColor: l.border, borderWidth: StyleSheet.hairlineWidth },
        disabled && styles.disabled,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? colors.onAccent : colors.text} />
      ) : (
        <View style={styles.content}>
          {Icon && (
            <Icon
              size={20}
              color={kind === 'primary' ? colors.onAccent : textColor(l.text)}
              strokeWidth={2}
            />
          )}
          <Text variant="headline" tone={l.text}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function textColor(tone: 'onAccent' | 'default' | 'accent' | 'danger') {
  return {
    onAccent: colors.onAccent,
    default: colors.text,
    accent: colors.accentText,
    danger: colors.danger,
  }[tone];
}

const styles = StyleSheet.create({
  base: {
    minHeight: hitSize + 4,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minHeight: 56, borderRadius: radius.lg },
  content: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  disabled: { opacity: 0.4 },
});
