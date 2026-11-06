import { createAudioPlayer, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { Check, Ellipsis, ImagePlus, Music, Pause, Play, Plus, X } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  addOverlay,
  addTrack,
  checkFrame,
  deleteOverlay,
  deleteTrack,
  MUSIC_TYPES,
  renameOverlay,
  renameTrack,
  setTrackDuration,
  setTrackStart,
  useOverlays,
  useTracks,
  type Overlay,
  type Track,
} from '@/data/look';
import { updateSettings, useSettings } from '@/data/settings-store';
import { resolveFile, useTakes } from '@/data/takes';
import { useCurrentAlbumId } from '@/data/albums';
import { colors, hitSize, radius, space } from '@/theme';
import { Button, IconButton, Section, Segmented, Text } from '@/ui';
import { confirmDestructive, showMenu } from '@/ui/menu';

export type LookTab = 'frames' | 'music';

/**
 * The overlay frame and the music for new videos. Changes apply straight away (this is a library, not a
 * form), and only to takes recorded from now on: earlier takes keep the look they were recorded with.
 */
export function OverlaysScreen({ initialTab = 'frames' }: { initialTab?: LookTab }) {
  const [tab, setTab] = useState<LookTab>(initialTab);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Segmented
        label="Show"
        style={styles.tabs}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'frames', label: 'Frames' },
          { value: 'music', label: 'Music' },
        ]}
      />
      {tab === 'frames' ? <Frames /> : <MusicList />}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------------------------- Frames

function Frames() {
  const db = useSQLiteContext();
  const overlays = useOverlays() ?? [];
  const { overlayId } = useSettings().look;
  const { width } = useWindowDimensions();
  const [preview, setPreview] = useState<Overlay | null>(null);
  const columns = width > 700 ? 5 : 3;
  const tile = (Math.min(width, 900) - space.lg * 2 - space.md * (columns - 1)) / columns;

  const choose = (id: string | null) => updateSettings((s) => ({ ...s, look: { ...s.look, overlayId: id } }));

  const add = () =>
    showMenu('Add a frame', [
      { label: 'From Photos', onPress: () => void pickFromPhotos() },
      { label: 'From Files', onPress: () => void pickFromFiles() },
    ]);

  const pickFromPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      // Keep the original file: the automatic mode can hand back a JPEG, which has no transparency.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) await importFrame(asset.uri, asset.fileName ?? 'Frame.png');
  };

  const pickFromFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/png', copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (asset) await importFrame(asset.uri, asset.name);
  };

  const importFrame = async (uri: string, name: string) => {
    const check = await checkFrame(uri);
    if (!check.ok) return Alert.alert('This image can’t be a frame', check.reason);
    const save = async () => choose(await addOverlay(db, uri, name, check));
    if (check.portrait) return void save();
    Alert.alert(
      'Not the shape of the video',
      `This frame is ${check.width} × ${check.height}. Videos are 9:16 (for example 1080 × 1920), so its edges will be cropped to fit.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Use it anyway', onPress: () => void save() },
      ],
    );
  };

  const menu = (overlay: Overlay) =>
    showMenu(overlay.name, [
      { label: 'Preview', onPress: () => setPreview(overlay) },
      {
        label: 'Rename',
        hidden: Platform.OS !== 'ios',
        onPress: () =>
          Alert.prompt(
            'Rename frame',
            undefined,
            (name) => void renameOverlay(db, overlay.id, name),
            'plain-text',
            overlay.name,
          ),
      },
      {
        label: 'Delete',
        destructive: true,
        onPress: () =>
          confirmDestructive(
            `Delete “${overlay.name}”?`,
            'Videos already made keep it. New videos are made without a frame until you choose another.',
            'Delete',
            () => void deleteOverlay(db, overlay),
          ),
      },
    ]);

  return (
    <>
      <View style={styles.grid}>
        <FrameTile size={tile} selected={overlayId === null} label="None" onPress={() => choose(null)}>
          <X size={28} color={colors.textFaint} />
        </FrameTile>
        {overlays.map((o) => (
          <FrameTile
            key={o.id}
            size={tile}
            selected={overlayId === o.id}
            label={o.name}
            onPress={() => choose(o.id)}
            onLongPress={() => menu(o)}
            onMore={() => menu(o)}
          >
            <Image
              source={{ uri: resolveFile(o.filePath).uri }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
            />
          </FrameTile>
        ))}
        <FrameTile size={tile} selected={false} label="Add frame" onPress={add} dashed>
          <ImagePlus size={28} color={colors.accentText} />
        </FrameTile>
      </View>
      <Text variant="footnote" tone="faint" style={styles.note}>
        A frame is a PNG with a transparent middle, drawn over the whole video. Design it at 1080 × 1920 for
        an exact fit.
      </Text>
      <FramePreview overlay={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function FrameTile({
  size,
  selected,
  label,
  onPress,
  onLongPress,
  onMore,
  dashed,
  children,
}: {
  size: number;
  selected: boolean;
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  onMore?: () => void;
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ width: size }}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole={dashed ? 'button' : 'radio'}
        accessibilityState={dashed ? undefined : { checked: selected }}
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.tile,
          { height: (size * 16) / 9 },
          dashed && styles.tileDashed,
          selected && styles.tileSelected,
          pressed && styles.tilePressed,
        ]}
      >
        {children}
        {selected && (
          <View style={styles.tick}>
            <Check size={14} color={colors.onAccent} strokeWidth={3} />
          </View>
        )}
      </Pressable>
      <View style={styles.tileLabel}>
        <Text variant="caption" tone={selected ? 'default' : 'muted'} numberOfLines={1} style={styles.flex}>
          {label}
        </Text>
        {onMore && (
          <IconButton
            icon={Ellipsis}
            label={`Options for ${label}`}
            size={16}
            color={colors.textFaint}
            onPress={onMore}
          />
        )}
      </View>
    </View>
  );
}

/** The frame over the latest take's thumbnail (or plain ink when there is none yet). */
function FramePreview({ overlay, onClose }: { overlay: Overlay | null; onClose: () => void }) {
  const latest = useTakes(useCurrentAlbumId())?.find((t) => t.thumbPath);
  return (
    <Modal
      visible={overlay !== null}
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.previewScreen}>
        <View style={styles.previewFrame}>
          {latest?.thumbPath && (
            <Image
              source={{ uri: resolveFile(latest.thumbPath).uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
          {overlay && (
            <Image
              source={{ uri: resolveFile(overlay.filePath).uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          )}
        </View>
        <Button label="Close" kind="secondary" onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------------------- Music

function MusicList() {
  const db = useSQLiteContext();
  const tracks = useTracks() ?? [];
  const { trackId } = useSettings().look;
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  // Which song was last started; it shows as playing only while the player says it is.
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingStart, setEditingStart] = useState<string | null>(null);

  useEffect(() => {
    // Previews should be heard even with the ring/silent switch on.
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);

  const choose = (id: string | null) => updateSettings((s) => ({ ...s, look: { ...s.look, trackId: id } }));

  const togglePreview = async (track: Track, fromS = track.startS) => {
    if (playingId === track.id && status.playing) {
      player.pause();
      setPlayingId(null);
      return;
    }
    player.replace({ uri: resolveFile(track.filePath).uri });
    await player.seekTo(fromS);
    player.play();
    setPlayingId(track.id);
  };

  const add = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: MUSIC_TYPES, copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    const duration = await probeDuration(asset.uri);
    if (duration === null)
      return Alert.alert('This file can’t be played', 'Choose an MP3, M4A, AAC or WAV song.');
    choose(await addTrack(db, asset.uri, asset.name, duration));
  };

  const menu = (track: Track) =>
    showMenu(track.name, [
      { label: 'Set start point', onPress: () => setEditingStart(track.id) },
      {
        label: 'Rename',
        hidden: Platform.OS !== 'ios',
        onPress: () =>
          Alert.prompt(
            'Rename song',
            undefined,
            (name) => void renameTrack(db, track.id, name),
            'plain-text',
            track.name,
          ),
      },
      {
        label: 'Delete',
        destructive: true,
        onPress: () =>
          confirmDestructive(
            `Delete “${track.name}”?`,
            'Videos already made keep it. New videos are made without music until you choose another.',
            'Delete',
            () => {
              if (playingId === track.id) player.pause();
              void deleteTrack(db, track);
            },
          ),
      },
    ]);

  return (
    <>
      <Section footer="Use music you have the rights to. The song is cut to the length of the video and fades out over the last second.">
        <MusicRow name="None" detail="No sound" selected={trackId === null} onPress={() => choose(null)} />
        {tracks.map((t) => (
          <View key={t.id}>
            <MusicRow
              name={t.name}
              detail={[
                t.durationS ? clock(t.durationS) : null,
                t.startS > 0 ? `starts at ${clock(t.startS)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              selected={trackId === t.id}
              playing={playingId === t.id && status.playing}
              onPress={() => choose(t.id)}
              onPlay={() => void togglePreview(t)}
              onMore={() => menu(t)}
            />
            {editingStart === t.id && (
              <StartPoint
                track={t}
                onPreview={(s) => void togglePreview({ ...t, startS: s }, s)}
                onDone={async (s) => {
                  await setTrackStart(db, t.id, s);
                  if (t.durationS === null && status.duration > 0)
                    await setTrackDuration(db, t.id, status.duration);
                  setEditingStart(null);
                }}
              />
            )}
          </View>
        ))}
      </Section>
      <Button label="Add music" icon={Plus} kind="secondary" onPress={() => void add()} />
    </>
  );
}

function MusicRow({
  name,
  detail,
  selected,
  playing,
  onPress,
  onPlay,
  onMore,
}: {
  name: string;
  detail: string;
  selected: boolean;
  playing?: boolean;
  onPress: () => void;
  onPlay?: () => void;
  onMore?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={[name, detail].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.musicRow, pressed && styles.tilePressed]}
    >
      {onPlay ? (
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? `Pause ${name}` : `Play ${name}`}
          size={20}
          onPress={onPlay}
        />
      ) : (
        <View style={styles.musicIcon}>
          <Music size={20} color={colors.textFaint} />
        </View>
      )}
      <View style={styles.flex}>
        <Text numberOfLines={1}>{name}</Text>
        {detail !== '' && (
          <Text variant="footnote" tone="faint">
            {detail}
          </Text>
        )}
      </View>
      {selected && <Check size={20} color={colors.accentText} strokeWidth={2.5} />}
      {onMore && (
        <IconButton
          icon={Ellipsis}
          label={`Options for ${name}`}
          size={20}
          color={colors.textMuted}
          onPress={onMore}
        />
      )}
    </Pressable>
  );
}

/** Where the song starts in the video, to skip a long intro: −5 s / +5 s steps with a live preview. */
function StartPoint({
  track,
  onPreview,
  onDone,
}: {
  track: Track;
  onPreview: (s: number) => void;
  onDone: (s: number) => void;
}) {
  const [start, setStart] = useState(track.startS);
  const max = Math.max(0, (track.durationS ?? 600) - 5);
  const nudge = (by: number) => setStart((s) => Math.min(max, Math.max(0, Math.round((s + by) * 10) / 10)));
  return (
    <View style={styles.startPoint}>
      <Text variant="headline" align="center" accessibilityLiveRegion="polite">
        Starts at {clock(start)}
      </Text>
      <View style={styles.startButtons}>
        <Button
          label="−5 s"
          kind="secondary"
          style={styles.flex}
          disabled={start <= 0}
          onPress={() => nudge(-5)}
        />
        <Button
          label="−1 s"
          kind="secondary"
          style={styles.flex}
          disabled={start <= 0}
          onPress={() => nudge(-1)}
        />
        <Button
          label="+1 s"
          kind="secondary"
          style={styles.flex}
          disabled={start >= max}
          onPress={() => nudge(1)}
        />
        <Button
          label="+5 s"
          kind="secondary"
          style={styles.flex}
          disabled={start >= max}
          onPress={() => nudge(5)}
        />
      </View>
      <View style={styles.startButtons}>
        <Button
          label="Listen from here"
          icon={Play}
          kind="ghost"
          style={styles.flex}
          onPress={() => onPreview(start)}
        />
        <Button label="Done" style={styles.flex} onPress={() => onDone(start)} />
      </View>
    </View>
  );
}

/** Loads a song just long enough to read its length; null when it cannot be played at all. */
async function probeDuration(uri: string): Promise<number | null> {
  const player = createAudioPlayer({ uri });
  try {
    for (let waited = 0; waited < 5000; waited += 100) {
      if (player.isLoaded && player.duration > 0) return player.duration;
      await new Promise((r) => setTimeout(r, 100));
    }
    return null;
  } finally {
    player.remove();
  }
}

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.lg },
  tabs: { marginHorizontal: space.xl },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileDashed: { borderStyle: 'dashed', borderColor: colors.lineStrong },
  tileSelected: { borderColor: colors.accentText },
  tilePressed: { opacity: 0.7 },
  tick: {
    position: 'absolute',
    top: space.xs,
    right: space.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { flexDirection: 'row', alignItems: 'center', minHeight: 32 },
  note: { marginHorizontal: space.xs },
  previewScreen: { flex: 1, backgroundColor: colors.bg, padding: space.lg, gap: space.lg },
  previewFrame: {
    flex: 1,
    alignSelf: 'center',
    aspectRatio: 9 / 16,
    maxWidth: '100%',
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  musicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: hitSize + 12,
    paddingHorizontal: space.sm,
    paddingRight: space.xs,
  },
  musicIcon: { width: hitSize, alignItems: 'center' },
  startPoint: { gap: space.md, padding: space.lg, backgroundColor: colors.surfaceRaised },
  startButtons: { flexDirection: 'row', gap: space.sm },
});
