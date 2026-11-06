import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, space } from '@/theme';

import { Text } from './Text';

export type SegmentOption<T> = { value: T; label: string; accessibilityLabel?: string };

/** iOS-style segmented control: Low | Medium | High, Compositions | Originals. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  style,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessibility name of the whole control. */
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.track, style]} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="tab"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={[styles.segment, selected && styles.selected]}
          >
            <Text
              variant="footnote"
              tone={selected ? 'default' : 'muted'}
              style={selected && styles.selectedText}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm + 1,
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.sm - 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.lineStrong },
  selectedText: { fontWeight: '600' },
});
