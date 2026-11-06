import Storage from 'expo-sqlite/kv-store';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronDown, Ellipsis, Images, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deleteAlbum, useCurrentAlbum } from '@/data/albums';
import { DEFAULT_ALBUM_ID } from '@/data/db';
import { getSettings } from '@/data/settings-store';
import {
  deleteOriginal,
  deleteVideo,
  inCompositions,
  inOriginals,
  remakeWithSettings,
  resolveFile,
  useTakes,
  type Take,
} from '@/data/takes';
import { formatBytes } from '@/domain/format';
import { TakeRow, formatTakeDate, type GalleryTab } from '@/features/gallery/TakeRow';
import { CANCELLED, videoQueue } from '@/jobs/create-video';
import { uploadQueue } from '@/jobs/uploads';
import { useSharingConfig } from '@/data/sharing-config';
import { useUploads } from '@/data/uploads';
import { uploadStatusText } from '@/features/sharing/uploadStatus';
import { saveVideoToPhotos, shareVideo } from '@/platform/share';
import { colors, space } from '@/theme';
import { Button, IconButton, QrCard, Segmented, Text } from '@/ui';
import { confirmDestructive, showMenu } from '@/ui/menu';

const SORT_KEY = 'gallery.sort';
type Sort = 'newest' | 'oldest';

export default function GalleryScreen() {
  const router = useRouter();
  const db = useSQLiteContext();
  const album = useCurrentAlbum();
  const albumId = album?.id ?? DEFAULT_ALBUM_ID;
  const takes = useTakes(albumId);
  const sharingConfig = useSharingConfig();
  const uploadList = useUploads();
  const uploads = useMemo(() => new Map((uploadList ?? []).map((u) => [u.takeId, u])), [uploadList]);
  const [qrFor, setQrFor] = useState<string | null>(null);
  const qrUpload = qrFor ? uploads.get(qrFor) : undefined;

  const [tab, setTab] = useState<GalleryTab>('videos');
  const [sort, setSortState] = useState<Sort>(() =>
    Storage.getItemSync(SORT_KEY) === 'oldest' ? 'oldest' : 'newest',
  );
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const setSort = (next: Sort) => {
    Storage.setItemSync(SORT_KEY, next);
    setSortState(next);
  };

  const videos = useMemo(() => (takes ?? []).filter(inCompositions), [takes]);
  const originals = useMemo(() => (takes ?? []).filter(inOriginals), [takes]);
  const list = useMemo(() => {
    const items = tab === 'videos' ? videos : originals;
    return sort === 'newest' ? items : [...items].reverse();
  }, [tab, videos, originals, sort]);

  const fileOf = useCallback(
    (take: Take) => {
      const path = tab === 'videos' ? take.videoPath : take.originalPath;
      return path ? resolveFile(path).uri : null;
    },
    [tab],
  );

  // ---- One take ----
  const open = useCallback(
    (take: Take) => {
      if (selecting) {
        setSelected((s) => {
          const next = new Set(s);
          if (next.has(take.id)) next.delete(take.id);
          else next.add(take.id);
          return next;
        });
        return;
      }
      if (tab === 'videos' && take.status !== 'ready') {
        if (take.status === 'failed' && take.error !== CANCELLED) videoQueue.enqueue(take.id); // "Failed · Retry"
        return;
      }
      router.push({ pathname: '/player/[id]', params: { id: take.id, kind: tab, sort } });
    },
    [selecting, tab, sort, router],
  );

  const menu = useCallback(
    (take: Take) => {
      const uri = fileOf(take);
      const date = formatTakeDate(take.createdAt);
      if (tab === 'videos') {
        showMenu(date, [
          { label: 'Play', hidden: take.status !== 'ready', onPress: () => open(take) },
          {
            label: uploads.get(take.id)?.url ? 'Show QR' : 'Get QR',
            hidden: take.status !== 'ready' || !sharingConfig,
            onPress: () => {
              if (!uploads.get(take.id)) void uploadQueue.share(take.id);
              setQrFor(take.id);
            },
          },
          { label: 'Share…', hidden: !uri, onPress: () => uri && void shareVideo(uri) },
          { label: 'Save to Photos', hidden: !uri, onPress: () => uri && void saveVideoToPhotos(uri) },
          {
            label: 'Try again',
            hidden: take.status !== 'failed',
            onPress: () => videoQueue.enqueue(take.id),
          },
          {
            label: 'Make again with current settings',
            hidden: !take.originalPath || take.status === 'creating',
            onPress: () =>
              void remakeWithSettings(db, take, getSettings()).then(() => videoQueue.enqueue(take.id)),
          },
          {
            label: 'Delete video',
            destructive: true,
            hidden: take.status === 'creating',
            onPress: () => {
              const message = take.originalPath
                ? 'The video is deleted. Its original clip stays in Originals, so it can be made again.'
                : 'The video is deleted. Its original was not kept, so it cannot be made again.';
              if (!uploads.get(take.id)?.shareId) {
                confirmDestructive('Delete this video?', message, 'Delete', () => void deleteVideo(db, take));
                return;
              }
              // Shared: the guest link can stay (until it expires) or go with the video.
              Alert.alert('Delete this video?', `${message} It also has a guest link.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete from phone', onPress: () => void deleteVideo(db, take) },
                {
                  text: 'Delete from phone and the link',
                  style: 'destructive',
                  onPress: () =>
                    void uploadQueue
                      .unshare(take.id)
                      .catch((e: unknown) =>
                        Alert.alert(
                          'The link could not be deleted',
                          e instanceof Error ? e.message : String(e),
                        ),
                      )
                      .then(() => deleteVideo(db, take)),
                },
              ]);
            },
          },
        ]);
      } else {
        showMenu(date, [
          { label: 'Play', onPress: () => open(take) },
          {
            label: take.videoPath ? 'Make video again with current settings' : 'Make video',
            hidden: take.status === 'creating',
            onPress: () =>
              void remakeWithSettings(db, take, getSettings()).then(() => videoQueue.enqueue(take.id)),
          },
          { label: 'Share…', hidden: !uri, onPress: () => uri && void shareVideo(uri) },
          { label: 'Save to Photos', hidden: !uri, onPress: () => uri && void saveVideoToPhotos(uri) },
          {
            label: 'Delete original',
            destructive: true,
            hidden: take.status === 'creating',
            onPress: () =>
              confirmDestructive(
                'Delete this original?',
                take.videoPath
                  ? 'The raw clip is deleted. Its video stays, but it can no longer be made again with new settings.'
                  : 'The raw clip is deleted. It has no video, so nothing of this take is left.',
                'Delete',
                () => void deleteOriginal(db, take),
              ),
          },
        ]);
      }
    },
    [tab, db, open, fileOf, uploads, sharingConfig],
  );

  // ---- Whole album ----
  const albumMenu = () =>
    showMenu(album?.name, [
      { label: 'Select', hidden: list.length === 0, onPress: () => setSelecting(true) },
      { label: 'Save all to Photos', hidden: list.length === 0, onPress: () => void saveAll(list) },
      {
        label: sort === 'newest' ? 'Show oldest first' : 'Show newest first',
        onPress: () => setSort(sort === 'newest' ? 'oldest' : 'newest'),
      },
      { label: `Album storage: ${formatBytes(album?.bytes ?? 0)}`, onPress: () => {} },
      {
        label: 'Delete album',
        destructive: true,
        hidden: albumId === DEFAULT_ALBUM_ID,
        onPress: () =>
          confirmDestructive(
            `Delete “${album?.name}”?`,
            `All ${album?.takeCount ?? 0} takes in it are deleted from this phone, videos and originals.`,
            'Delete album',
            () => void deleteAlbum(db, albumId),
          ),
      },
    ]);

  const saveAll = async (items: Take[]) => {
    let saved = 0;
    for (const take of items) {
      const uri = fileOf(take);
      if (!uri) continue;
      const result = await saveVideoToPhotos(uri, { quiet: saved > 0 });
      if (result === 'denied') return;
      if (result === 'saved') saved += 1;
    }
  };

  const selectedTakes = list.filter((t) => selected.has(t.id));
  const endSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const deleteSelected = () =>
    confirmDestructive(
      `Delete ${selectedTakes.length} ${tab === 'videos' ? 'videos' : 'originals'}?`,
      tab === 'videos'
        ? 'Takes that still have their original stay in Originals.'
        : 'Takes that still have their video stay in Videos.',
      'Delete',
      () =>
        void (async () => {
          for (const take of selectedTakes)
            await (tab === 'videos' ? deleteVideo(db, take) : deleteOriginal(db, take));
          endSelecting();
        })(),
    );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {selecting ? (
          <Pressable onPress={endSelecting} hitSlop={12} accessibilityRole="button">
            <Text tone="accent">Done</Text>
          </Pressable>
        ) : (
          <IconButton icon={X} label="Close gallery" onPress={() => router.back()} />
        )}
        <Pressable
          style={styles.title}
          onPress={() => router.push('/albums')}
          accessibilityRole="button"
          accessibilityLabel={`Album ${album?.name ?? ''}. Change album`}
          disabled={selecting}
        >
          <Text variant="headline" numberOfLines={1} style={styles.titleText}>
            {selecting ? `${selected.size} selected` : (album?.name ?? ' ')}
          </Text>
          {!selecting && <ChevronDown size={18} color={colors.text} />}
        </Pressable>
        {selecting ? (
          <Pressable
            onPress={() =>
              setSelected(selected.size === list.length ? new Set() : new Set(list.map((t) => t.id)))
            }
            hitSlop={12}
            accessibilityRole="button"
          >
            <Text tone="accent">{selected.size === list.length ? 'None' : 'All'}</Text>
          </Pressable>
        ) : (
          <IconButton icon={Ellipsis} label="Album options" onPress={albumMenu} />
        )}
      </View>

      <Segmented
        label="Show"
        style={styles.tabs}
        value={tab}
        onChange={(next) => {
          setTab(next);
          setSelected(new Set());
        }}
        options={[
          { value: 'videos', label: `Compositions (${videos.length})` },
          { value: 'originals', label: `Originals (${originals.length})` },
        ]}
      />

      <FlatList
        data={list}
        keyExtractor={(t) => t.id}
        ItemSeparatorComponent={Separator}
        renderItem={({ item }) => (
          <TakeRow
            take={item}
            upload={uploads.get(item.id)}
            tab={tab}
            selecting={selecting}
            selected={selected.has(item.id)}
            onPress={open}
            onMenu={menu}
          />
        )}
        ListEmptyComponent={
          takes ? (
            <View style={styles.empty}>
              <Images size={40} color={colors.textFaint} strokeWidth={1.5} />
              <Text variant="headline" align="center">
                {tab === 'videos' ? 'No videos in this album yet' : 'No originals in this album'}
              </Text>
              {tab === 'videos' && (
                <Button label="Start recording" onPress={() => router.replace('/capture')} />
              )}
            </View>
          ) : null
        }
        contentContainerStyle={list.length === 0 && styles.emptyContainer}
      />

      <Modal visible={qrFor !== null} transparent animationType="fade" onRequestClose={() => setQrFor(null)}>
        <SafeAreaView style={styles.qrModal}>
          {qrUpload?.url ? (
            <QrCard url={qrUpload.url} status={uploadStatusText(qrUpload)} size={240} />
          ) : (
            <Text align="center">{qrUpload?.error ?? 'Getting the link…'}</Text>
          )}
          <Button label="Close" kind="secondary" onPress={() => setQrFor(null)} />
        </SafeAreaView>
      </Modal>

      {selecting && (
        <View style={styles.selectBar}>
          <Button
            label="Save to Photos"
            kind="secondary"
            disabled={selectedTakes.length === 0}
            onPress={() => void saveAll(selectedTakes).then(endSelecting)}
          />
          <Button
            label="Delete"
            kind="destructive"
            disabled={selectedTakes.length === 0}
            onPress={deleteSelected}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    gap: space.sm,
  },
  title: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 44,
  },
  titleText: { flexShrink: 1 },
  tabs: { marginHorizontal: space.xxl, marginVertical: space.md },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: space.lg + 44 + space.md,
  },
  empty: { alignItems: 'center', gap: space.md, padding: space.xxl },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  qrModal: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.lg,
  },
  selectBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: space.md,
    padding: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
