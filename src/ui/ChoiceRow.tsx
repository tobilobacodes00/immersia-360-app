import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, hitSize, space } from '@/theme';

import { Text } from './Text';

/** One option in a pick-one list: a checkmark on the chosen row. */
export function ChoiceRow({
  label,
  detail,
  tag,
  selected,
  onPress,
}: {
  label: string;
  detail?: string;
  /** A short highlight after the label, e.g. "Best slow motion". */
  tag?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={[label, tag, detail].filter(Boolean).join(', ')}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.labels}>
        <View style={styles.line}>
          <Text>{label}</Text>
          {tag && (
            <View style={styles.tag}>
              <Text variant="caption" tone="accent">
                {tag}
              </Text>
            </View>
          )}
        </View>
        {detail && (
          <Text variant="footnote" tone="faint">
            {detail}
          </Text>
        )}
      </View>
      {selected && <Check size={20} color={colors.accentText} strokeWidth={2.5} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: hitSize + 8,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  labels: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  tag: {
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: colors.accentSoft,
  },
});
