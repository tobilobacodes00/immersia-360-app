import { Paths } from 'expo-file-system';
import { useFocusEffect, useRouter } from 'expo-router';
import { Camera, ChevronDown, Cloud, Images, Layers, Settings as SettingsIcon } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentAlbum } from '@/data/albums';
import { useSettings } from '@/data/settings-store';
import { useVideosInProgress } from '@/data/takes';
import { formatBytes } from '@/domain/format';
import { presetLabel } from '@/features/settings/CameraSection';
import { IS_EXPO_GO } from '@/platform/runtime';
import { colors, radius, space } from '@/theme';
import { IconButton, Text } from '@/ui';

const CAPTURE_SIZE = 116;
/** Below this, the home screen warns about space before anyone starts recording. */
const LOW_SPACE_BYTES = 2e9;

export default function Home() {
  const router = useRouter();
  const settings = useSettings();
  const album = useCurrentAlbum();
  const busy = useVideosInProgress();
  const [free, setFree] = useState(() => Paths.availableDiskSpace);
  useFocusEffect(useCallback(() => setFree(Paths.availableDiskSpace), []));

  const camera = settings.camera[settings.camera.position];
  const cameraLine = IS_EXPO_GO
    ? 'Expo Go camera · 30 fps'
    : `${settings.camera.position === 'back' ? 'Rear' : 'Front'} · ${presetLabel(camera)}`;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable
          style={({ pressed }) => [styles.albumChip, pressed && styles.chipPressed]}
          onPress={() => router.push('/albums')}
          accessibilityRole="button"
          accessibilityLabel={`Album: ${album?.name ?? 'Default'}. Change album`}
        >
          <Text variant="callout" numberOfLines={1} style={styles.albumName}>
            {album?.name ?? ' '}
          </Text>
          <ChevronDown size={16} color={colors.textMuted} />
        </Pressable>
        <Text
          variant="footnote"
          tone={free < LOW_SPACE_BYTES ? 'danger' : 'faint'}
          accessibilityLabel={`${formatBytes(free)} free`}
        >
          {formatBytes(free)} free
        </Text>
      </View>

      <View style={styles.centre}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start the booth"
          onPress={() => router.push('/capture')}
          style={({ pressed }) => [styles.capture, pressed && styles.capturePressed]}
        >
          <Camera size={34} color={colors.text} strokeWidth={1.75} />
        </Pressable>
        <Text variant="headline" style={styles.cta}>
          Tap to start
        </Text>
        <Text variant="footnote" tone="faint">
          {cameraLine}
        </Text>
      </View>

      <View style={styles.bar}>
        <IconButton
          icon={SettingsIcon}
          label="Settings"
          showLabel
          onPress={() => router.push('/settings')}
          style={styles.barItem}
        />
        <IconButton
          icon={Images}
          label="Gallery"
          showLabel
          badge={busy}
          onPress={() => router.push('/gallery')}
          style={styles.barItem}
        />
        <IconButton
          icon={Layers}
          label="Overlays"
          showLabel
          onPress={() => router.push('/overlays')}
          style={styles.barItem}
        />
        <IconButton
          icon={Cloud}
          label="Sharing"
          showLabel
          disabled
          onPress={() => {}}
          style={styles.barItem}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.md,
  },
  albumChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    maxWidth: '60%',
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  albumName: { flexShrink: 1 },
  chipPressed: { backgroundColor: colors.surfacePressed },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xs },
  capture: {
    width: CAPTURE_SIZE,
    height: CAPTURE_SIZE,
    borderRadius: CAPTURE_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.accentText,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  capturePressed: { backgroundColor: colors.accentSoft, transform: [{ scale: 0.97 }] },
  cta: { marginBottom: space.xxs },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  barItem: { minWidth: 72 },
});
