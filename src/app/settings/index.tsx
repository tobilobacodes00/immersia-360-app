import * as MediaLibrary from 'expo-media-library';
import { Paths } from 'expo-file-system';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { config } from '@/config';
import { useOverlays, useTracks } from '@/data/look';
import { useSettings } from '@/data/settings-store';
import { useSharingConfig } from '@/data/sharing-config';
import { formatBytes } from '@/domain/format';
import { IDLE_RETURN_CHOICES, type Settings } from '@/domain/settings';
import { CameraSection } from '@/features/settings/CameraSection';
import { useSettingsDraft } from '@/features/settings/draft';
import { RecordingSection } from '@/features/settings/RecordingSection';
import { useLenses, type Lens } from '@/platform/camera';
import { EXPO_GO_CAMERA_FPS, IS_EXPO_GO } from '@/platform/runtime';
import { colors, space } from '@/theme';
import { Row, Section, Segmented, Text, Toggle } from '@/ui';

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { draft, edit, dirty, save } = useSettingsDraft();
  const live = useSettings();
  const sharingConfig = useSharingConfig();
  const overlays = useOverlays();
  const tracks = useTracks();

  // While there are unsaved changes the sheet cannot be swiped away; Cancel asks first instead.
  useEffect(() => {
    navigation.getParent()?.setOptions({ gestureEnabled: !dirty });
  }, [navigation, dirty]);

  const cancel = () => {
    if (!dirty) return router.back();
    Alert.alert('Discard changes?', 'Your changes to the settings will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const lenses = { back: useLenses('back'), front: useLenses('front') };
  const camera = draft.camera[draft.camera.position];
  const cameraFps = IS_EXPO_GO ? EXPO_GO_CAMERA_FPS : (camera.preset?.fps ?? null);

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => <HeaderButton label="Cancel" onPress={cancel} />,
          headerRight: () => (
            <HeaderButton
              label="Save"
              bold
              onPress={() => {
                save();
                router.back();
              }}
            />
          ),
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxl }]}
        contentInsetAdjustmentBehavior="automatic"
      >
        <RecordingSection draft={draft} edit={edit} cameraFps={cameraFps} />
        <CameraSection
          position="back"
          draft={draft}
          edit={edit}
          lensLabel={lensLabel(lenses.back, draft, 'back')}
          onPickLens={() => router.push({ pathname: '/settings/lens', params: { position: 'back' } })}
          onPickPreset={() => router.push({ pathname: '/settings/preset', params: { position: 'back' } })}
        />
        <CameraSection
          position="front"
          draft={draft}
          edit={edit}
          lensLabel={lensLabel(lenses.front, draft, 'front')}
          onPickLens={() => router.push({ pathname: '/settings/lens', params: { position: 'front' } })}
          onPickPreset={() => router.push({ pathname: '/settings/preset', params: { position: 'front' } })}
        />

        <Section
          title="Final video"
          footer="MP4 at 30 fps, which plays on every phone and in WhatsApp. 720p files are about half the size, so they upload faster."
        >
          <Row
            label="Video size"
            right={
              <Segmented
                label="Video size"
                style={styles.segmented}
                value={draft.output.size}
                onChange={(size) => edit((s) => ({ ...s, output: { size } }))}
                options={[
                  { value: '1080p', label: '1080p' },
                  { value: '720p', label: '720p' },
                ]}
              />
            }
          />
        </Section>

        <Section title="Sharing">
          <Row
            label="QR sharing"
            value={live.sharing.enabled && sharingConfig ? 'Enabled' : 'Disabled'}
            onPress={() => router.push('/settings/sharing')}
          />
          <Row label="Display" value="Pair in QR sharing" onPress={() => router.push('/settings/sharing')} />
        </Section>

        {/* The library saves as soon as something is picked, so these rows show the live choice, not the draft. */}
        <Section title="Look">
          <Row
            label="Overlays"
            value={overlays?.find((o) => o.id === live.look.overlayId)?.name ?? 'None'}
            onPress={() => router.push({ pathname: '/settings/overlays', params: { tab: 'frames' } })}
          />
          <Row
            label="Audio files"
            value={tracks?.find((t) => t.id === live.look.trackId)?.name ?? 'None'}
            onPress={() => router.push({ pathname: '/settings/overlays', params: { tab: 'music' } })}
          />
        </Section>

        <StorageSection draft={draft} edit={edit} />

        <Section title="Booth">
          <Row
            label="Return to camera"
            detail="After a guest's video, when nobody touches the screen"
            below={
              <Segmented
                label="Return to camera"
                style={styles.below}
                value={draft.booth.idleReturnS}
                onChange={(idleReturnS) => edit((s) => ({ ...s, booth: { idleReturnS } }))}
                options={IDLE_RETURN_CHOICES.map((s) => ({
                  value: s,
                  label: s === 0 ? 'Off' : s < 120 ? `${s} s` : '2 min',
                  accessibilityLabel: s === 0 ? 'Off' : `After ${s} seconds`,
                }))}
              />
            }
          />
          <Row
            label="Lock the booth"
            detail="Keep guests inside the app with Guided Access"
            onPress={explainGuidedAccess}
          />
        </Section>

        <Section title="Help">
          {config.tutorialsUrl && (
            <Row label="Video tutorials" onPress={() => void Linking.openURL(config.tutorialsUrl!)} />
          )}
          <Row label="Privacy Policy" disabled />
          <Row label="Terms of Use" disabled />
          {config.supportEmail && (
            <Row
              label="Contact"
              value={config.supportEmail}
              onPress={() => void Linking.openURL(`mailto:${config.supportEmail}`)}
            />
          )}
          <Row label="Version" value={config.appVersion} />
        </Section>
      </ScrollView>
    </>
  );
}

function StorageSection({
  draft,
  edit,
}: {
  draft: Settings;
  edit: (change: (s: Settings) => Settings) => void;
}) {
  const [free] = useState(() => Paths.availableDiskSpace);

  const setAutoSave = async (on: boolean) => {
    if (on) {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert(
          'Photos access is off',
          'To save videos to Photos automatically, allow Immersia 360 to add to your Photos in the Settings app.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ],
        );
        return;
      }
    }
    edit((s) => ({ ...s, storage: { ...s.storage, autoSaveToPhotos: on } }));
  };

  return (
    <Section title="Storage">
      <Row
        label="Save originals"
        detail={
          draft.storage.saveOriginals
            ? 'Keeps the raw clip, so a video can be made again with new settings'
            : 'Deletes the raw clip once its video is made, to save space'
        }
        right={
          <Toggle
            label="Save originals"
            value={draft.storage.saveOriginals}
            onChange={(saveOriginals) => edit((s) => ({ ...s, storage: { ...s.storage, saveOriginals } }))}
          />
        }
      />
      <Row
        label="Save to Photos automatically"
        detail="Every finished video is also added to Photos"
        right={
          <Toggle
            label="Save to Photos automatically"
            value={draft.storage.autoSaveToPhotos}
            onChange={(on) => void setAutoSave(on)}
          />
        }
      />
      <Row label="Free space" value={formatBytes(free)} />
    </Section>
  );
}

function lensLabel(lenses: Lens[], draft: Settings, position: 'back' | 'front'): string {
  if (IS_EXPO_GO) return position === 'back' ? 'Back camera' : 'Front camera';
  const id = draft.camera[position].lensId;
  const lens = lenses.find((l) => (id ? l.id === id : l.isDefault));
  return lens?.name ?? (position === 'back' ? 'Wide (1×)' : 'Front camera');
}

function explainGuidedAccess() {
  Alert.alert(
    'Lock the booth with Guided Access',
    '1. In the Settings app, open Accessibility > Guided Access and turn it on, then set a passcode.\n\n' +
      '2. Open Immersia 360 and triple-click the side button (or the Home button) to start Guided Access.\n\n' +
      'Guests then cannot leave the app. Triple-click again and enter the passcode to end it.',
    [{ text: 'Done' }],
  );
}

function HeaderButton({ label, onPress, bold }: { label: string; onPress: () => void; bold?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <Text variant={bold ? 'headline' : 'body'} tone="accent">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, paddingTop: space.lg },
  segmented: { width: 170 },
  below: { marginTop: space.sm, marginBottom: space.xs },
  pressed: { opacity: 0.5 },
});
