import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, hitSize, radius, space } from '@/theme';

import { Text } from './Text';

/**
 * An icon with a 44 pt touch target. `label` is always the accessibility label; `showLabel` also prints it
 * under the icon (the home screen's bottom bar). `badge` shows a count in the corner.
 */
export function IconButton({
  icon: Icon,
  label,
  onPress,
  showLabel,
  badge,
  disabled,
  color = colors.text,
  size = 24,
  style,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  showLabel?: boolean;
  badge?: number;
  disabled?: boolean;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.base, pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      <View>
        <Icon size={size} color={color} strokeWidth={1.75} />
        {!!badge && (
          <View style={styles.badge}>
            <Text variant="caption" tone="onAccent" style={styles.badgeText}>
              {badge > 99 ? '99+' : badge}
            </Text>
          </View>
        )}
      </View>
      {showLabel && (
        <Text variant="caption" tone="muted" style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: hitSize,
    minHeight: hitSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.55 },
  disabled: { opacity: 0.35 },
  label: { marginTop: space.xs },
  badge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 14 },
});
