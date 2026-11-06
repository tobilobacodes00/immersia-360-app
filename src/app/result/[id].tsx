import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Download, Share as ShareIcon, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSettings } from '@/data/settings-store';
import { deleteTake, resolveFile, useTake } from '@/data/takes';
import { useSharingConfig } from '@/data/sharing-config';
import { useUpload } from '@/data/uploads';
import { uploadStatusText } from '@/features/sharing/uploadStatus';
import { uploadQueue } from '@/jobs/uploads';
import { saveVideoToPhotos, shareVideo } from '@/platform/share';
import { colors, radius, space } from '@/theme';
import { Button, QrCard, Text, VideoLoop } from '@/ui';

/**
 * The guest's finished video, playing on a loop, with the ways to take it home. "Next guest" goes back to the
 * camera; so does leaving the screen untouched for the Booth "Return to camera" time.
 */
export default function ResultScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const take = useTake(id);
  const settings = useSettings();
  const { idleReturnS } = settings.booth;
  const sharingConfig = useSharingConfig();
  const upload = useUpload(id);
  const showQr = settings.sharing.enabled && settings.sharing.showQrAfterTake && sharingConfig !== null;
  const [saved, setSaved] = useState(false);

  const nextGuest = useCallback(() => router.replace('/capture'), [router]);

  // Any touch restarts the idle countdown.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restartIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (idleReturnS > 0) idleTimer.current = setTimeout(nextGuest, idleReturnS * 1000);
  }, [idleReturnS, nextGuest]);
  useEffect(() => {
    restartIdle();
    return () => clearTimeout(idleTimer.current);
  }, [restartIdle]);

  if (!take?.videoPath) {
    return (
      <SafeAreaView style={styles.screen}>
        {take === null && (
          <>
            <Text variant="title" align="center">
              This video no longer exists
            </Text>
            <Button label="Next guest" onPress={nextGuest} />
          </>
        )}
      </SafeAreaView>
    );
  }

  const uri = resolveFile(take.videoPath).uri;

  const save = async () => {
    if ((await saveVideoToPhotos(uri)) === 'saved') setSaved(true);
  };

  const discard = () =>
    Alert.alert('Discard this video?', 'The video and its original clip will be deleted from this phone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () =>
          void uploadQueue
            .unshare(id)
            .catch(() => undefined)
            .then(() => deleteTake(db, id))
            .then(nextGuest),
      },
    ]);

  return (
    <SafeAreaView style={styles.screen} onTouchStart={restartIdle}>
      <View style={styles.videoFrame}>
        <VideoLoop uri={uri} style={StyleSheet.absoluteFill} />
      </View>

      {showQr &&
        (upload?.url ? (
          <QrCard url={upload.url} status={uploadStatusText(upload)} size={110} compact />
        ) : (
          <Text variant="footnote" tone="faint" align="center">
            {upload?.status === 'failed'
              ? 'Could not get a link yet. It will be retried.'
              : 'Getting the QR code…'}
          </Text>
        ))}

      <View style={styles.actions}>
        <Button label="Next guest" size="large" onPress={nextGuest} />
        <View style={styles.row}>
          <Button
            label="Share"
            icon={ShareIcon}
            kind="secondary"
            style={styles.flex}
            onPress={() => void shareVideo(uri)}
          />
          <Button
            label={saved ? 'Saved' : 'Save to Photos'}
            icon={Download}
            kind="secondary"
            style={styles.flex}
            disabled={saved}
            onPress={() => void save()}
          />
        </View>
        <Button label="Discard" icon={Trash2} kind="ghost" onPress={discard} />
      </View>
      {idleReturnS > 0 && (
        <Text variant="caption" tone="faint" align="center">
          Back to the camera after {idleReturnS < 120 ? `${idleReturnS} seconds` : '2 minutes'} without a
          touch
        </Text>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: space.lg, gap: space.lg },
  videoFrame: {
    flex: 1,
    alignSelf: 'center',
    aspectRatio: 9 / 16,
    maxWidth: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  actions: { gap: space.md },
  row: { flexDirection: 'row', gap: space.md },
  flex: { flex: 1, paddingHorizontal: space.md },
});
