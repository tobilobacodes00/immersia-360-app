import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { useSettingsDraft } from '@/features/settings/draft';
import { useLenses } from '@/platform/camera';
import { colors, space } from '@/theme';
import { ChoiceRow, Section } from '@/ui';

export default function LensPicker() {
  const { position: raw } = useLocalSearchParams<{ position: string }>();
  const position = raw === 'front' ? 'front' : 'back';
  const { draft, edit } = useSettingsDraft();
  const lenses = useLenses(position);
  const chosen = draft.camera[position].lensId;

  const choose = (lensId: string | null) =>
    edit((s) => ({
      ...s,
      // A different lens has different presets: go back to the best one for it.
      camera: { ...s.camera, [position]: { ...s.camera[position], lensId, preset: null } },
    }));

  return (
    <>
      <Stack.Screen options={{ title: 'Lens' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Section
          title={position === 'back' ? 'Rear camera' : 'Front camera'}
          footer="Changing the lens resets the preset to the best slow motion that lens can do."
        >
          {lenses.map((lens) => (
            <ChoiceRow
              key={lens.id}
              label={lens.name}
              tag={lens.isDefault ? 'Standard' : undefined}
              selected={chosen === lens.id || (chosen === null && lens.isDefault)}
              onPress={() => choose(lens.isDefault ? null : lens.id)}
            />
          ))}
        </Section>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
});
