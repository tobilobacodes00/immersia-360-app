import { useEvent, useEventListener } from 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pause, Play, Share as ShareIcon, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentAlbumId } from '@/data/albums';
import { inCompositions, inOriginals, resolveFile, useTake, useTakes } from '@/data/takes';
import { shareVideo } from '@/platform/share';
import { colors, space } from '@/theme';
import { IconButton, Text } from '@/ui';

const HIDE_CONTROLS_MS = 3000;

/**
 * Full-screen playback from the gallery (the reference's player). Swipe down to close; swipe left or right for
 * the next or previous take in the same list.
 */
export default function PlayerScreen() {
  const params = useLocalSearchParams<{ id: string; kind?: string; sort?: string }>();
  const router = useRouter();
  const kind = params.kind === 'originals' ? 'originals' : 'videos';
  const take = useTake(params.id);
  const takes = useTakes(useCurrentAlbumId());

  const list = useMemo(() => {
    const items = (takes ?? []).filter((t) =>
      kind === 'videos' ? inCompositions(t) && t.status === 'ready' : inOriginals(t),
    );
    return params.sort === 'oldest' ? [...items].reverse() : items;
  }, [takes, kind, params.sort]);
  const index = list.findIndex((t) => t.id === params.id);

  const path = kind === 'videos' ? take?.videoPath : take?.originalPath;
  const uri = path ? resolveFile(path).uri : null;

  const step = (by: 1 | -1) => {
    const next = list[index + by];
    if (next) router.setParams({ id: next.id });
  };

  const swipes = Gesture.Race(
    Gesture.Fling()
      .direction(Directions.DOWN)
      .runOnJS(true)
      .onEnd(() => router.back()),
    Gesture.Fling()
      .direction(Directions.LEFT)
      .runOnJS(true)
      .onEnd(() => step(1)),
    Gesture.Fling()
      .direction(Directions.RIGHT)
      .runOnJS(true)
      .onEnd(() => step(-1)),
  );

  return (
    <GestureDetector gesture={swipes}>
      <View style={styles.screen}>
        {uri ? (
          // Keyed by take: swiping to another take starts a fresh player.
          <Playback
            key={uri}
            uri={uri}
            onClose={() => router.back()}
            position={index >= 0 ? `${index + 1} of ${list.length}` : ''}
          />
        ) : (
          <SafeAreaView style={styles.missing}>
            <Text tone="muted">{take === null ? 'This take no longer exists.' : ' '}</Text>
            <IconButton icon={X} label="Close" color={colors.overlayText} onPress={() => router.back()} />
          </SafeAreaView>
        )}
      </View>
    </GestureDetector>
  );
}

function Playback({ uri, onClose, position }: { uri: string; onClose: () => void; position: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [time, setTime] = useState({ current: 0, duration: 0 });
  useEventListener(player, 'timeUpdate', ({ currentTime }) =>
    setTime({ current: currentTime, duration: player.duration }),
  );

  const [controls, setControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showControls = () => {
    setControls(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), HIDE_CONTROLS_MS);
  };
  useEffect(() => {
    hideTimer.current = setTimeout(() => setControls(false), HIDE_CONTROLS_MS);
    return () => clearTimeout(hideTimer.current);
  }, []);

  const toggle = () => {
    if (isPlaying) player.pause();
    else player.play();
    showControls();
  };

  return (
    <>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => (controls ? setControls(false) : showControls())}
        accessibilityLabel={controls ? 'Hide controls' : 'Show controls'}
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit="contain"
        />
      </Pressable>
      {controls && (
        <SafeAreaView style={styles.controls} pointerEvents="box-none">
          <View style={styles.top}>
            <IconButton icon={X} label="Close" color={colors.overlayText} onPress={onClose} />
            <Text variant="footnote" tone="overlay">
              {position}
            </Text>
            <IconButton
              icon={ShareIcon}
              label="Share"
              color={colors.overlayText}
              onPress={() => void shareVideo(uri)}
            />
          </View>
          <View style={styles.bottom}>
            <View style={styles.scrubRow}>
              <Text variant="footnote" tone="overlay" style={styles.time}>
                {clock(time.current)}
              </Text>
              <Scrubber
                current={time.current}
                duration={time.duration}
                onSeek={(t) => {
                  player.seekBy(t - player.currentTime);
                  setTime((s) => ({ ...s, current: t }));
                  showControls();
                }}
              />
              <Text variant="footnote" tone="overlay" style={[styles.time, styles.right]}>
                -{clock(Math.max(0, time.duration - time.current))}
              </Text>
            </View>
            <IconButton
              icon={isPlaying ? Pause : Play}
              label={isPlaying ? 'Pause' : 'Play'}
              color={colors.overlayText}
              size={28}
              onPress={toggle}
              style={styles.play}
            />
          </View>
        </SafeAreaView>
      )}
    </>
  );
}

/** Drag or tap along the bar to seek. Cobalt fill, as the reference's played part is coloured. */
function Scrubber({
  current,
  duration,
  onSeek,
}: {
  current: number;
  duration: number;
  onSeek: (t: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const fraction = duration > 0 ? Math.min(1, current / duration) : 0;
  const seekTo = (x: number) =>
    duration > 0 && width > 0 && onSeek(Math.min(duration, Math.max(0, (x / width) * duration)));

  const gesture = Gesture.Race(
    Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((e) => seekTo(e.x))
      .onUpdate((e) => seekTo(e.x)),
    Gesture.Tap()
      .runOnJS(true)
      .onEnd((e) => seekTo(e.x)),
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={styles.scrubber}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessibilityRole="adjustable"
        accessibilityLabel="Position"
        accessibilityValue={{ text: `${clock(current)} of ${clock(duration)}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          onSeek(
            Math.min(duration, Math.max(0, current + (e.nativeEvent.actionName === 'increment' ? 5 : -5))),
          )
        }
      >
        <View style={styles.track}>
          <View style={[styles.played, { width: `${fraction * 100}%` }]} />
        </View>
        <View style={[styles.knob, { left: fraction * width - 9 }]} />
      </View>
    </GestureDetector>
  );
}

/** 0:07, 1:22 */
function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  controls: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    backgroundColor: colors.scrim,
  },
  bottom: {
    backgroundColor: colors.scrim,
    paddingTop: space.md,
    paddingBottom: space.sm,
    alignItems: 'center',
  },
  scrubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    alignSelf: 'stretch',
  },
  time: { minWidth: 40, fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  scrubber: { flex: 1, height: 32, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  played: { height: '100%', backgroundColor: colors.accentText },
  knob: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: colors.overlayText },
  play: { marginTop: space.xs },
});
