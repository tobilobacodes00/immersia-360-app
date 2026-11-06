import { Image } from 'expo-image';
import { CircleCheck, Circle as CircleIcon, Ellipsis, Film } from 'lucide-react-native';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { resolveFile, type Take } from '@/data/takes';
import { formatBytes } from '@/domain/format';
import { CANCELLED } from '@/jobs/create-video';
import { colors, hitSize, radius, space } from '@/theme';
import { IconButton, Text } from '@/ui';

export type GalleryTab = 'videos' | 'originals';

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** "2 Nov 2026 at 5:01 PM", in the phone's own language and clock. */
export function formatTakeDate(ms: number): string {
  return dateFormat.format(new Date(ms));
}

type Chip = { label: string; tone: 'accent' | 'danger' | 'faint' };

function statusChip(take: Take, tab: GalleryTab): Chip | null {
  if (tab === 'originals') return null;
  switch (take.status) {
    case 'creating':
      return { label: `Creating ${Math.round(take.progress * 100)}%`, tone: 'accent' };
    case 'recorded':
      return { label: 'Waiting', tone: 'faint' };
    case 'failed':
      return take.error === CANCELLED ? null : { label: 'Failed · Retry', tone: 'danger' };
    default:
      return null;
  }
}

/** One row of the gallery list (the reference's rows): thumbnail, date and size, status, ⋯. */
export const TakeRow = memo(function TakeRow({
  take,
  tab,
  selecting,
  selected,
  onPress,
  onMenu,
}: {
  take: Take;
  tab: GalleryTab;
  selecting: boolean;
  selected: boolean;
  onPress: (take: Take) => void;
  onMenu: (take: Take) => void;
}) {
  const bytes = tab === 'videos' ? take.videoBytes : take.originalBytes;
  const chip = statusChip(take, tab);
  const date = formatTakeDate(take.createdAt);
  const size = bytes ? formatBytes(bytes) : '';

  return (
    <Pressable
      onPress={() => onPress(take)}
      onLongPress={selecting ? undefined : () => onMenu(take)}
      accessibilityRole="button"
      accessibilityLabel={[date, size, chip?.label].filter(Boolean).join(', ')}
      accessibilityState={selecting ? { selected } : undefined}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {selecting &&
        (selected ? (
          <CircleCheck size={24} color={colors.accentText} />
        ) : (
          <CircleIcon size={24} color={colors.textFaint} />
        ))}
      <View style={styles.thumb}>
        {take.thumbPath ? (
          <Image
            source={{ uri: resolveFile(take.thumbPath).uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={take.thumbPath}
          />
        ) : (
          <Film size={20} color={colors.textFaint} />
        )}
      </View>
      <View style={styles.labels}>
        <Text numberOfLines={1}>{date}</Text>
        <View style={styles.meta}>
          {size !== '' && (
            <Text variant="callout" tone="faint">
              {size}
            </Text>
          )}
          {chip && (
            <View style={[styles.chip, chip.tone === 'danger' && styles.chipDanger]}>
              <Text variant="caption" tone={chip.tone}>
                {chip.label}
              </Text>
            </View>
          )}
        </View>
      </View>
      {!selecting && (
        <IconButton
          icon={Ellipsis}
          label="More"
          color={colors.textMuted}
          size={20}
          onPress={() => onMenu(take)}
        />
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    minHeight: hitSize + 32,
  },
  pressed: { backgroundColor: colors.surfacePressed },
  thumb: {
    width: 44,
    height: 76,
    borderRadius: radius.sm / 2,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labels: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chip: {
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: colors.accentSoft,
  },
  chipDanger: { backgroundColor: 'rgba(255, 99, 105, 0.16)' },
});
