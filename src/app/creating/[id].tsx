import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { resolveFile, useTake } from '@/data/takes';
import { CANCELLED, videoQueue } from '@/jobs/create-video';
import { composer } from '@/platform/composer';
import { colors, radius, space } from '@/theme';
import { Button, Text } from '@/ui';

/** "Creating your video…" between the take and the Result screen. */
export default function CreatingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const take = useTake(id);

  useEffect(() => {
    if (take?.status === 'ready') router.replace({ pathname: '/result/[id]', params: { id } });
  }, [take?.status, id, router]);

  const backToCamera = () => router.replace('/capture');

  if (take === null) {
    return (
      <Centre>
        <Text variant="title" align="center">
          This take no longer exists
        </Text>
        <Button label="Back to camera" onPress={backToCamera} />
      </Centre>
    );
  }

  const failed = take?.status === 'failed';
  const cancelled = failed && take.error === CANCELLED;
  const progress = take?.status === 'creating' ? take.progress : 0;

  return (
    <Centre>
      <View style={styles.thumb}>
        {take?.thumbPath ? (
          <Image
            source={{ uri: resolveFile(take.thumbPath).uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          !failed && <ActivityIndicator color={colors.textMuted} size="large" />
        )}
      </View>

      {!failed && (
        <>
          <Text variant="title" align="center" accessibilityLiveRegion="polite">
            Creating your video…
          </Text>
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
          >
            <View style={[styles.fill, { width: `${Math.max(2, progress * 100)}%` }]} />
          </View>
          <Text variant="footnote" tone="faint" align="center">
            {Math.round(progress * 100)}%
            {!composer.isReal
              ? ' · Expo Go preview: the clip is used as it is, without slow motion or reverse'
              : ''}
          </Text>
          <Button label="Cancel" kind="ghost" onPress={() => void videoQueue.cancel(id)} />
        </>
      )}

      {failed && (
        <>
          <Text variant="title" align="center">
            {cancelled ? 'Video not made' : "Couldn't create the video"}
          </Text>
          <Text tone="muted" align="center">
            Your original clip is saved.{!cancelled && take.error ? ` ${take.error}` : ''}
          </Text>
          <Button label={cancelled ? 'Make it now' : 'Try again'} onPress={() => videoQueue.enqueue(id)} />
          <Button label="Back to camera" kind="secondary" onPress={backToCamera} />
        </>
      )}
    </Centre>
  );
}

function Centre({ children }: { children: ReactNode }) {
  return <SafeAreaView style={styles.screen}>{children}</SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: space.lg,
    paddingHorizontal: space.xxl,
  },
  thumb: {
    alignSelf: 'center',
    width: 150,
    aspectRatio: 9 / 16,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
});
