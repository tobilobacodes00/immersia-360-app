import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { Preset } from '@/domain/settings';
import { slowFactor } from '@/domain/timeline';
import { useSettingsDraft } from '@/features/settings/draft';
import { usePresets } from '@/platform/camera';
import { colors, space } from '@/theme';
import { ChoiceRow, Section, Text } from '@/ui';

const RESOLUTION_NAME: Record<number, string> = { 2160: '4K', 1080: '1080p (Full HD)', 720: '720p (HD)' };

export default function PresetPicker() {
  const { position: raw } = useLocalSearchParams<{ position: string }>();
  const position = raw === 'front' ? 'front' : 'back';
  const { draft, edit } = useSettingsDraft();
  const prefs = draft.camera[position];
  const { presets, error } = usePresets(position, prefs.lensId);

  const choose = (preset: Preset | null) =>
    edit((s) => ({ ...s, camera: { ...s.camera, [position]: { ...s.camera[position], preset } } }));
  const isChosen = (p: Preset) =>
    prefs.preset?.width === p.width && prefs.preset.height === p.height && prefs.preset.fps === p.fps;

  const maxFps = presets?.reduce((m, p) => Math.max(m, p.fps), 0) ?? 0;
  const groups = groupByHeight(presets ?? []);

  return (
    <>
      <Stack.Screen options={{ title: 'Preset' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Section footer="Higher frame rates give slower, smoother slow motion: 240 fps plays 8 times slower, 120 fps 4 times, 60 fps twice. 30 fps has no slow motion.">
          <ChoiceRow
            label="Best slow motion"
            detail="1080p at the highest frame rate this lens can do"
            selected={prefs.preset === null}
            onPress={() => choose(null)}
          />
        </Section>

        {presets === null && !error && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.textMuted} />
            <Text variant="footnote" tone="faint">
              Checking what this lens can record…
            </Text>
          </View>
        )}
        {error && (
          <Text variant="footnote" tone="danger" style={styles.error}>
            {`Could not read this lens's presets: ${error}`}
          </Text>
        )}

        {groups.map(([height, items]) => (
          <Section key={height} title={RESOLUTION_NAME[height] ?? `${height}p`}>
            {items.map((p) => (
              <ChoiceRow
                key={`${p.width}x${p.height}@${p.fps}`}
                label={`${p.width}×${p.height} · ${p.fps} fps`}
                detail={slowFactor(p.fps) > 1 ? `${slowFactor(p.fps)}× slow motion` : 'No slow motion'}
                tag={p.fps === maxFps && maxFps > 30 ? 'Best slow motion' : undefined}
                selected={isChosen(p)}
                onPress={() => choose(p)}
              />
            ))}
          </Section>
        ))}
      </ScrollView>
    </>
  );
}

function groupByHeight(presets: Preset[]): [number, Preset[]][] {
  const map = new Map<number, Preset[]>();
  for (const p of presets) map.set(p.height, [...(map.get(p.height) ?? []), p]);
  return [...map.entries()].sort(([a], [b]) => b - a);
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  loading: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  error: { marginBottom: space.lg, marginHorizontal: space.lg },
});
