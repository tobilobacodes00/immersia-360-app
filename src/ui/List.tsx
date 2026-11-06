import { ChevronRight } from 'lucide-react-native';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, hitSize, radius, space } from '@/theme';

import { Text } from './Text';

/** A titled group of rows on a rounded surface, with hairlines between rows (iOS grouped list). */
export function Section({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={styles.section}>
      {title && (
        <Text variant="overline" tone="faint" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      )}
      <View style={styles.card}>
        {rows.map((row, i) => (
          <Fragment key={row.key ?? i}>
            {i > 0 && <View style={styles.separator} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer &&
        (typeof footer === 'string' ? (
          <Text variant="footnote" tone="faint" style={styles.footer}>
            {footer}
          </Text>
        ) : (
          <View style={styles.footer}>{footer}</View>
        ))}
    </View>
  );
}

/**
 * One row: a label on the left and, on the right, either a value (with a chevron when it opens something)
 * or a control (`right`). `below` renders full-width content under the label line, e.g. the timeline strip.
 */
export function Row({
  label,
  detail,
  value,
  right,
  below,
  onPress,
  disabled,
  destructive,
  accessibilityHint,
}: {
  label: string;
  detail?: string;
  value?: string;
  right?: ReactNode;
  below?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  accessibilityHint?: string;
}) {
  const content = (
    <>
      <View style={styles.line}>
        <View style={styles.labels}>
          <Text tone={disabled ? 'disabled' : destructive ? 'danger' : 'default'}>{label}</Text>
          {detail && (
            <Text variant="footnote" tone="faint">
              {detail}
            </Text>
          )}
        </View>
        {value !== undefined && (
          <Text tone={disabled ? 'disabled' : 'muted'} numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        )}
        {right}
        {onPress && !right && <ChevronRight size={18} color={colors.textFaint} />}
      </View>
      {below}
    </>
  );

  if (!onPress) {
    return (
      <View
        style={styles.row}
        accessible={!right && !below}
        accessibilityLabel={value ? `${label}, ${value}` : label}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: space.xl },
  title: { marginHorizontal: space.lg, marginBottom: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.lg },
  footer: { marginHorizontal: space.lg, marginTop: space.sm },
  row: {
    minHeight: hitSize + 8,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.surfacePressed },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: hitSize - 4 },
  labels: { flex: 1, gap: 2 },
  value: { flexShrink: 1, textAlign: 'right' },
});
