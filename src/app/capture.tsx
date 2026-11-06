import { useAudioPlayer } from 'expo-audio';
import { useCameraPermissions } from 'expo-camera';
import { Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useIsFocused, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Flashlight, FlashlightOff, SwitchCamera, X } from 'lucide-react-native';
import { useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCurrentAlbumId } from '@/data/albums';
import { getSettings, updateSettings, useSettings } from '@/data/settings-store';
import { discardClip, saveTake } from '@/data/takes';
import { buildPlan, slowFactor } from '@/domain/timeline';
import { canAdjustCamera, captureReducer, initialCapture } from '@/features/capture/machine';
import { videoQueue } from '@/jobs/create-video';
import { thermalState, type ThermalState } from '@/platform/composer';
import {
  BoothCamera,
  useLenses,
  type BoothCameraHandle,
  type CameraFormat,
  type RecordedClip,
} from '@/platform/camera';
import { colors, radius, space, type as typeScale } from '@/theme';
import { Button, IconButton, ProgressRing, Text } from '@/ui';

/** Below this much free space a take could fail half-way: recording is refused. */
const BLOCK_BELOW_BYTES = 500e6;
/** Below this the operator is warned (a 20 s 240 fps take plus its video is roughly 150 MB). */
const WARN_BELOW_BYTES = 2e9;
/** Extra time past the planned length before the screen stops a recording itself, if the camera did not. */
const STOP_GRACE_MS = 1500;
const BUTTON = 78;
const RING = 98;

export default function CaptureScreen() {
  useKeepAwake();
  const router = useRouter();
  const db = useSQLiteContext();
  const settings = useSettings();
  const [permission, requestPermission] = useCameraPermissions();

  const position = settings.camera.position;
  const prefs = settings.camera[position];
  const recording = settings.recording;
  const lenses = useLenses(position);

  const [state, dispatch] = useReducer(captureReducer, initialCapture);
  const [format, setFormat] = useState<CameraFormat | null>(null);
  const [torch, setTorch] = useState(false);
  const [elapsedS, setElapsedS] = useState(0);
  const [freeBytes] = useState(() => Paths.availableDiskSpace);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const focused = useIsFocused();
  const [heat, setHeat] = useState<ThermalState>(thermalState);

  const camera = useRef<BoothCameraHandle>(null);
  const discardNext = useRef(false);
  const opened = useRef(false);

  const tick = useAudioPlayer(require('../../assets/sounds/tick.wav'));
  const go = useAudioPlayer(require('../../assets/sounds/go.wav'));

  // ---- Permission ----
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  // ---- 240 fps recording heats phones: warn before iOS starts throttling the camera ----
  useEffect(() => {
    const timer = setInterval(() => setHeat(thermalState()), 15_000);
    return () => clearInterval(timer);
  }, []);

  // ---- The app leaving the foreground stops a take and keeps what was recorded ----
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      setAppActive(next === 'active');
      if (next !== 'active') void camera.current?.stop();
    });
    return () => sub.remove();
  }, []);

  // ---- Auto-start begins once the camera is showing a picture ----
  useEffect(() => {
    if (!format || opened.current) return;
    opened.current = true;
    dispatch({ type: 'opened', autoStartS: recording.autoStartS });
  }, [format, recording.autoStartS]);

  // ---- One second per countdown step, with a tick (and a beep, if on) ----
  const counting = state.phase === 'autoStart' || state.phase === 'countdown' ? state : null;
  useEffect(() => {
    if (!counting) return;
    if (counting.phase === 'countdown') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (getSettings().recording.countdownBeep) replay(tick);
    }
    const timer = setTimeout(
      () => dispatch({ type: 'tick', countdownS: getSettings().recording.countdownS }),
      1000,
    );
    return () => clearTimeout(timer);
  }, [counting?.phase, counting?.remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  function onRecorded(clip: RecordedClip) {
    if (discardNext.current) {
      discardNext.current = false;
      discardClip(clip);
      return;
    }
    dispatch({ type: 'recordingFinished' });
    if (clip.durationS < 2) {
      discardClip(clip);
      dispatch({ type: 'failed', message: 'That take was under 2 seconds, so it was not kept.' });
      return;
    }
    saveTake(db, clip, { albumId: getCurrentAlbumId(), position, settings: getSettings() })
      .then((takeId) => dispatch({ type: 'saved', takeId }))
      .catch((error: unknown) =>
        dispatch({ type: 'failed', message: `The take could not be saved. ${errorMessage(error)}` }),
      );
  }

  // ---- Start, stop, and the safety stop ----
  useEffect(() => {
    if (state.phase === 'starting') {
      const { recordS } = getSettings().recording;
      if (getSettings().recording.countdownBeep) replay(go);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      camera.current
        ?.start(recordS, onRecorded, (message) => dispatch({ type: 'failed', message }))
        .then(() => dispatch({ type: 'recordingStarted', at: Date.now() }))
        .catch((error: unknown) => dispatch({ type: 'failed', message: errorMessage(error) }));
    }
    if (state.phase === 'stopping') void camera.current?.stop();
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startedAt = state.phase === 'recording' || state.phase === 'stopping' ? state.startedAt : null;
  useEffect(() => {
    if (startedAt === null) return;
    const { recordS } = getSettings().recording;
    const interval = setInterval(() => setElapsedS(Math.min(recordS, (Date.now() - startedAt) / 1000)), 100);
    const safety = setTimeout(() => void camera.current?.stop(), recordS * 1000 + STOP_GRACE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(safety);
    };
  }, [startedAt]);

  // ---- No new video is started while the camera records ----
  const busy = state.phase === 'starting' || state.phase === 'recording' || state.phase === 'stopping';
  useEffect(() => {
    videoQueue.hold(busy);
  }, [busy]);
  useEffect(() => () => videoQueue.hold(false), []);

  // ---- After saving: make the video and show it ----
  const savedId = state.phase === 'saved' ? state.takeId : null;
  useEffect(() => {
    if (!savedId) return;
    videoQueue.hold(false);
    videoQueue.enqueue(savedId);
    router.replace({ pathname: '/creating/[id]', params: { id: savedId } });
  }, [savedId, router]);

  // ---- Controls ----
  const trigger = () => {
    if (state.phase === 'idle' && freeBytes < BLOCK_BELOW_BYTES) {
      Alert.alert(
        'Not enough space',
        'Free up space on this phone (or delete videos in the Gallery) before recording.',
      );
      return;
    }
    dispatch({ type: 'trigger', countdownS: recording.countdownS });
  };

  const close = () => {
    if (state.phase === 'recording' || state.phase === 'starting' || state.phase === 'stopping') {
      Alert.alert('Stop and discard this take?', 'The recording so far will be deleted.', [
        { text: 'Keep recording', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            discardNext.current = true;
            void camera.current?.stop();
            router.back();
          },
        },
      ]);
      return;
    }
    router.back();
  };

  const adjustable = canAdjustCamera(state);
  const flip = () =>
    updateSettings((s) => ({
      ...s,
      camera: { ...s.camera, position: s.camera.position === 'back' ? 'front' : 'back' },
    }));
  const nextLens = () => {
    if (lenses.length < 2) return;
    const index = lenses.findIndex((l) => l.id === (prefs.lensId ?? lenses.find((x) => x.isDefault)?.id));
    const next = lenses[(index + 1) % lenses.length]!;
    updateSettings((s) => ({
      ...s,
      camera: { ...s.camera, [position]: { ...s.camera[position], lensId: next.isDefault ? null : next.id } },
    }));
    void Haptics.selectionAsync();
  };

  // ---- Slow-motion arc on the ring, from the same plan the video will be made with ----
  const fps = format?.fps ?? 30;
  const plan = buildPlan(recording, fps);
  const slow = plan.segments.find((s) => s.stretch > 1);
  const marks = slow
    ? [{ from: slow.srcStartS / recording.recordS, to: slow.srcEndS / recording.recordS }]
    : [];

  if (!permission) return <View style={styles.black} />;
  if (!permission.granted)
    return <PermissionNeeded canAsk={permission.canAskAgain} onAsk={requestPermission} onClose={close} />;

  const isRecording = state.phase === 'recording' || state.phase === 'stopping';
  const tapToStart = recording.tapAnywhere && (state.phase === 'idle' || state.phase === 'autoStart');

  return (
    <View style={styles.black}>
      <BoothCamera
        ref={camera}
        style={StyleSheet.absoluteFill}
        position={position}
        prefs={prefs}
        torch={torch}
        isActive={focused && appActive}
        onReady={setFormat}
        onError={(message) => dispatch({ type: 'failed', message })}
      />

      {tapToStart && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={trigger}
          accessibilityRole="button"
          accessibilityLabel={state.phase === 'autoStart' ? 'Cancel auto-start' : 'Start recording'}
        />
      )}

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.topSide}>
            <IconButton
              icon={torch ? Flashlight : FlashlightOff}
              label={torch ? 'Torch on' : 'Torch off'}
              color={colors.overlayText}
              disabled={position === 'front'}
              onPress={() => setTorch((t) => !t)}
            />
            <IconButton
              icon={SwitchCamera}
              label="Flip camera"
              color={colors.overlayText}
              disabled={!adjustable}
              onPress={flip}
            />
          </View>
          <View style={[styles.timerPill, isRecording && styles.timerRecording]}>
            <Text variant="timer" tone="overlay" accessibilityLabel={`${elapsedS.toFixed(1)} seconds`}>
              {formatTimer(elapsedS)}
            </Text>
          </View>
          <View style={[styles.topSide, styles.topRight]}>
            <IconButton icon={X} label="Close camera" color={colors.overlayText} onPress={close} />
          </View>
        </View>

        {format && (
          <Pressable
            onPress={nextLens}
            disabled={!adjustable || lenses.length < 2}
            accessibilityRole="button"
            accessibilityLabel={`Camera: ${formatLine(format)}${lenses.length > 1 ? '. Tap to change lens' : ''}`}
            style={styles.chip}
          >
            <Text variant="caption" tone="overlay">
              {formatLine(format)}
              {slowFactor(format.fps) > 1 ? ` · ${slowFactor(format.fps)}× slow motion` : ' · no slow motion'}
            </Text>
          </Pressable>
        )}

        {freeBytes < WARN_BELOW_BYTES && state.phase === 'idle' && (
          <View style={styles.banner}>
            <Text variant="footnote" tone="overlay" align="center">
              {freeBytes < BLOCK_BELOW_BYTES
                ? 'This phone is almost full. Recording is paused until space is freed.'
                : 'This phone is low on space. Delete old videos in the Gallery soon.'}
            </Text>
          </View>
        )}

        {(heat === 'serious' || heat === 'critical') && (
          <View style={styles.banner}>
            <Text variant="footnote" tone="overlay" align="center">
              {heat === 'critical'
                ? 'The phone is too hot. Stop recording and let it cool, out of direct light.'
                : 'The phone is getting hot. Give it a short break between guests if you can.'}
            </Text>
          </View>
        )}

        <View style={styles.centre} pointerEvents="none">
          <CentreMessage state={state} />
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          <View style={styles.buttonWrap}>
            {(isRecording || state.phase === 'starting') && (
              <View style={styles.ring}>
                <ProgressRing size={RING} stroke={5} progress={elapsedS / recording.recordS} marks={marks} />
              </View>
            )}
            <Pressable
              onPress={trigger}
              disabled={
                state.phase === 'starting' ||
                state.phase === 'stopping' ||
                state.phase === 'saving' ||
                state.phase === 'saved'
              }
              accessibilityRole="button"
              accessibilityLabel={
                isRecording
                  ? 'Stop recording'
                  : state.phase === 'countdown' || state.phase === 'autoStart'
                    ? 'Cancel countdown'
                    : 'Record'
              }
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <View style={isRecording ? styles.stopSquare : styles.recordDot} />
            </Pressable>
          </View>
          <Text variant="footnote" tone="overlay" style={styles.hint}>
            {hint(state.phase, recording.tapAnywhere)}
          </Text>
        </View>
      </SafeAreaView>

      {state.phase === 'error' && (
        <View style={styles.errorCard}>
          <Text variant="headline" align="center">
            Something went wrong
          </Text>
          <Text tone="muted" align="center">
            {state.message}
          </Text>
          <Button label="Try again" onPress={() => dispatch({ type: 'reset' })} />
        </View>
      )}
    </View>
  );
}

function CentreMessage({ state }: { state: ReturnType<typeof captureReducer> }) {
  switch (state.phase) {
    case 'countdown':
      return (
        <Text style={styles.countdown} accessibilityLiveRegion="assertive">
          {state.remaining}
        </Text>
      );
    case 'autoStart':
      return (
        <View style={styles.pill}>
          <Text variant="headline" tone="overlay" accessibilityLiveRegion="polite">
            Starting in {state.remaining}
          </Text>
          <Text variant="footnote" tone="overlay">
            Tap to cancel
          </Text>
        </View>
      );
    case 'saving':
      return (
        <View style={styles.pill}>
          <ActivityIndicator color={colors.overlayText} />
          <Text variant="headline" tone="overlay">
            Saving…
          </Text>
        </View>
      );
    case 'saved':
      return (
        <View style={styles.pill}>
          <Text variant="headline" tone="overlay" accessibilityLiveRegion="polite">
            Take saved
          </Text>
        </View>
      );
    default:
      return null;
  }
}

function PermissionNeeded({
  canAsk,
  onAsk,
  onClose,
}: {
  canAsk: boolean;
  onAsk: () => void;
  onClose: () => void;
}) {
  return (
    <SafeAreaView style={[styles.black, styles.permission]}>
      <Text variant="title" align="center">
        Camera access is needed
      </Text>
      <Text tone="muted" align="center">
        Immersia 360 records your guests with the camera. Nothing is uploaded unless you turn on QR sharing.
      </Text>
      {canAsk ? (
        <Button label="Allow camera" onPress={onAsk} />
      ) : (
        <Button label="Open Settings" onPress={() => void Linking.openSettings()} />
      )}
      <Button label="Not now" kind="ghost" onPress={onClose} />
    </SafeAreaView>
  );
}

function hint(phase: ReturnType<typeof captureReducer>['phase'], tapAnywhere: boolean): string {
  switch (phase) {
    case 'idle':
      return tapAnywhere ? 'Tap anywhere to start' : 'Tap to record';
    case 'countdown':
      return 'Tap the button to cancel';
    case 'recording':
      return 'Recording · tap to stop early';
    default:
      return ' ';
  }
}

function formatLine(format: CameraFormat): string {
  const lens = format.lensName ? `${format.lensName} · ` : '';
  return `${lens}${Math.min(format.width, format.height)}p · ${Math.round(format.fps)} fps`;
}

/** 00:07.3 */
function formatTimer(seconds: number): string {
  const tenths = Math.floor(seconds * 10);
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths % 10}`;
}

function replay(player: { seekTo: (s: number) => Promise<void>; play: () => void }) {
  void player.seekTo(0).then(() => player.play());
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  overlay: StyleSheet.absoluteFill,
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingTop: space.xs },
  topSide: { flex: 1, flexDirection: 'row', gap: space.xs },
  topRight: { justifyContent: 'flex-end' },
  timerPill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.scrim,
  },
  timerRecording: { backgroundColor: colors.record },
  chip: {
    alignSelf: 'center',
    marginTop: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
  },
  banner: {
    marginHorizontal: space.xl,
    marginTop: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(161, 92, 0, 0.85)',
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  countdown: {
    ...typeScale.countdown,
    color: colors.overlayText,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 12,
  },
  pill: {
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.scrim,
  },
  bottom: { alignItems: 'center', paddingBottom: space.lg },
  buttonWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
  button: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: BUTTON / 2,
    borderWidth: 4,
    borderColor: colors.overlayText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { transform: [{ scale: 0.94 }] },
  recordDot: {
    width: BUTTON - 16,
    height: BUTTON - 16,
    borderRadius: (BUTTON - 16) / 2,
    backgroundColor: colors.record,
  },
  stopSquare: { width: 30, height: 30, borderRadius: 6, backgroundColor: colors.record },
  hint: { marginTop: space.sm, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  permission: {
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xl,
    backgroundColor: colors.bg,
  },
  errorCard: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    top: '35%',
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceRaised,
  },
});
