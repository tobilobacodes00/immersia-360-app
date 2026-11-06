import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radius, space } from '@/theme';

import { Text } from './Text';

const PAPER = '#f7f6f2';

/**
 * "Scan to get your video": the QR on paper (phones scan dark-on-light most reliably), the link as text for
 * anyone who cannot scan, and where the upload is. `compact` puts the code beside the words, for the Result
 * screen on a phone.
 */
export function QrCard({
  url,
  status,
  size = 200,
  compact = false,
}: {
  url: string;
  status?: string;
  size?: number;
  compact?: boolean;
}) {
  return (
    <View
      style={[styles.card, compact && styles.compact]}
      accessible
      accessibilityLabel={`QR code for your video. ${status ?? ''}`}
    >
      <View style={styles.paper}>
        <QRCode value={url} size={size} color={colors.bg} backgroundColor={PAPER} ecl="M" />
      </View>
      <View style={[styles.words, compact && styles.wordsCompact]}>
        <Text variant="headline" align={compact ? 'left' : 'center'}>
          Scan to get your video
        </Text>
        <Text
          variant="footnote"
          tone="muted"
          numberOfLines={1}
          selectable
          align={compact ? 'left' : 'center'}
        >
          {url.replace(/^https?:\/\//, '')}
        </Text>
        {status && (
          <Text variant="footnote" tone="faint" align={compact ? 'left' : 'center'}>
            {status}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  compact: { flexDirection: 'row', padding: space.md, gap: space.lg },
  paper: { padding: space.sm, borderRadius: radius.md, backgroundColor: PAPER },
  words: { gap: space.xs, alignItems: 'center' },
  wordsCompact: { flex: 1, alignItems: 'flex-start' },
});
