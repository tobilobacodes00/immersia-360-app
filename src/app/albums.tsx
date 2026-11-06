import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Check, Ellipsis, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  ALBUM_NAME_MAX,
  createAlbum,
  deleteAlbum,
  renameAlbum,
  setCurrentAlbumId,
  useAlbums,
  useCurrentAlbumId,
  type Album,
} from '@/data/albums';
import { DEFAULT_ALBUM_ID } from '@/data/db';
import { formatBytes } from '@/domain/format';
import { colors, hitSize, radius, space, type as typeScale } from '@/theme';
import { Button, IconButton, Section, Text } from '@/ui';
import { confirmDestructive, showMenu } from '@/ui/menu';

/**
 * Albums (one per event, say). The current album is where new takes go and what the gallery shows; picking
 * one here switches both and closes the sheet.
 */
export default function AlbumsSheet() {
  const router = useRouter();
  const db = useSQLiteContext();
  const albums = useAlbums() ?? [];
  const currentId = useCurrentAlbumId();
  const [editing, setEditing] = useState<{ id: string | null; name: string } | null>(null);

  const choose = (album: Album) => {
    setCurrentAlbumId(album.id);
    router.back();
  };

  const commit = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return setEditing(null);
    try {
      if (editing.id) {
        await renameAlbum(db, editing.id, name);
      } else {
        const id = await createAlbum(db, name);
        setCurrentAlbumId(id);
      }
      setEditing(null);
    } catch (error) {
      Alert.alert('Could not save the album', error instanceof Error ? error.message : String(error));
    }
  };

  const menu = (album: Album) =>
    showMenu(album.name, [
      { label: 'Rename', onPress: () => setEditing({ id: album.id, name: album.name }) },
      {
        label: 'Delete album',
        destructive: true,
        hidden: album.id === DEFAULT_ALBUM_ID,
        onPress: () =>
          confirmDestructive(
            `Delete “${album.name}”?`,
            `All ${album.takeCount} takes in it are deleted from this phone, videos and originals.`,
            'Delete album',
            () => void deleteAlbum(db, album.id),
          ),
      },
    ]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text variant="title" style={styles.heading} accessibilityRole="header">
        Albums
      </Text>
      <Section footer="New takes go into the album with the tick. Make one album per event to keep them apart.">
        {albums.map((album) =>
          editing?.id === album.id ? (
            <NameField
              key={album.id}
              value={editing.name}
              onChange={(name) => setEditing({ id: album.id, name })}
              onDone={commit}
            />
          ) : (
            <Pressable
              key={album.id}
              onPress={() => choose(album)}
              onLongPress={() => menu(album)}
              accessibilityRole="radio"
              accessibilityState={{ checked: album.id === currentId }}
              accessibilityLabel={`${album.name}, ${album.takeCount} takes`}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.check}>
                {album.id === currentId && <Check size={20} color={colors.accentText} strokeWidth={2.5} />}
              </View>
              <View style={styles.labels}>
                <Text numberOfLines={1}>{album.name}</Text>
                <Text variant="footnote" tone="faint">
                  {album.takeCount === 1 ? '1 take' : `${album.takeCount} takes`}
                  {album.bytes > 0 ? ` · ${formatBytes(album.bytes)}` : ''}
                </Text>
              </View>
              <IconButton
                icon={Ellipsis}
                label={`Options for ${album.name}`}
                color={colors.textMuted}
                size={20}
                onPress={() => menu(album)}
              />
            </Pressable>
          ),
        )}
        {editing?.id === null ? (
          <NameField
            value={editing.name}
            onChange={(name) => setEditing({ id: null, name })}
            onDone={commit}
            placeholder="Album name"
          />
        ) : (
          <Pressable
            onPress={() => setEditing({ id: null, name: '' })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.check}>
              <Plus size={20} color={colors.accentText} />
            </View>
            <Text tone="accent">New album</Text>
          </Pressable>
        )}
      </Section>
      <Button label="Done" kind="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

function NameField({
  value,
  onChange,
  onDone,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.check} />
      <TextInput
        autoFocus
        value={value}
        onChangeText={onChange}
        // Return blurs the field (single-line default), so blur is the one place that saves: never twice.
        onBlur={onDone}
        submitBehavior="blurAndSubmit"
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        maxLength={ALBUM_NAME_MAX}
        returnKeyType="done"
        autoCapitalize="words"
        accessibilityLabel="Album name"
        style={styles.input}
        selectionColor={colors.accentText}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.sm },
  heading: { marginBottom: space.md, marginHorizontal: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: hitSize + 12,
    paddingHorizontal: space.md,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  check: { width: 28, alignItems: 'center' },
  labels: { flex: 1, gap: 2 },
  input: {
    ...typeScale.body,
    flex: 1,
    color: colors.text,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
});
