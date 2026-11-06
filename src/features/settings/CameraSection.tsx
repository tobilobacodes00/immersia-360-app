import { StyleSheet } from 'react-native';

import { QUALITY, type CameraPrefs, type Settings } from '@/domain/settings';
import { IS_EXPO_GO } from '@/platform/runtime';
import { Row, Section, Segmented, Toggle } from '@/ui';

const QUALITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' } as const;

export function presetLabel(prefs: CameraPrefs): string {
  if (!prefs.preset) return 'Best slow motion';
  const { width, height, fps } = prefs.preset;
  return `${Math.max(width, height)}×${Math.min(width, height)} · ${Math.round(fps)} fps`;
}

/**
 * Lens, preset, quality and stabilisation for one camera. The rear and front cameras keep separate choices,
 * as in the reference. Lens and preset come from what this phone's camera reports, so their pickers live
 * with the camera code.
 */
export function CameraSection({
  position,
  draft,
  edit,
  lensLabel,
  onPickLens,
  onPickPreset,
}: {
  position: 'back' | 'front';
  draft: Settings;
  edit: (change: (s: Settings) => Settings) => void;
  lensLabel: string;
  onPickLens?: () => void;
  onPickPreset?: () => void;
}) {
  const prefs = draft.camera[position];
  const set = (patch: Partial<CameraPrefs>) =>
    edit((s) => ({ ...s, camera: { ...s.camera, [position]: { ...s.camera[position], ...patch } } }));
  const title = position === 'back' ? 'Rear camera' : 'Front camera';

  return (
    <Section
      title={title}
      footer={
        IS_EXPO_GO
          ? 'In Expo Go the camera records at 30 fps with the standard lens, so there is no slow motion. Lens and preset choices work in the Immersia 360 app.'
          : position === 'back'
            ? 'Stabilization is best left off on a spinner: it crops and warps the picture as the arm turns.'
            : undefined
      }
    >
      <Row
        label="Lens"
        value={lensLabel}
        onPress={IS_EXPO_GO ? undefined : onPickLens}
        disabled={IS_EXPO_GO}
      />
      <Row
        label="Preset"
        value={presetLabel(prefs)}
        onPress={IS_EXPO_GO ? undefined : onPickPreset}
        disabled={IS_EXPO_GO}
      />
      <Row
        label="Quality"
        right={
          <Segmented
            label={`${title} quality`}
            style={styles.segmented}
            value={prefs.quality}
            onChange={(quality) => set({ quality })}
            options={QUALITY.map((q) => ({ value: q, label: QUALITY_LABEL[q] }))}
          />
        }
      />
      <Row
        label="Stabilization"
        right={
          <Segmented
            label={`${title} stabilization`}
            style={styles.segmentedSmall}
            value={prefs.stabilization}
            onChange={(stabilization) => set({ stabilization })}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'standard', label: 'Standard' },
            ]}
          />
        }
      />
      {position === 'front' && (
        <Row
          label="Mirror video"
          detail="Saves the video the way the preview looks, like a mirror"
          right={<Toggle label="Mirror video" value={prefs.mirror} onChange={(mirror) => set({ mirror })} />}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  segmented: { width: 230 },
  segmentedSmall: { width: 170 },
});
