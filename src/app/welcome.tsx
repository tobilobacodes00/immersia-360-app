import { useRouter } from 'expo-router';
import { Cloud, RotateCw, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { updateSettings } from '@/data/settings-store';
import { colors, radius, space } from '@/theme';
import { Button, Text } from '@/ui';

const CARDS = [
  {
    icon: RotateCw,
    title: 'Slow motion, then reverse',
    body: 'Each guest gets a short video: normal speed, a slow-motion moment, then the whole thing played backwards, with your frame and music.',
  },
  {
    icon: Smartphone,
    title: 'Put the phone on the spinner',
    body: 'Mount the phone on the arm, open the camera and start. Settings sets the countdown, the recording length and where the slow motion falls.',
  },
  {
    icon: Cloud,
    title: 'Guests scan to take it home',
    body: 'Turn on QR sharing to show a QR code with every video, and pair a TV or laptop as a Display of the latest videos.',
  },
] as const;

/** Three cards on first launch. Skippable; never shown again once done. */
export default function Welcome() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const card = CARDS[index]!;
  const Icon = card.icon;
  const last = index === CARDS.length - 1;

  const finish = () => {
    updateSettings((s) => ({ ...s, onboardingDone: true }));
    router.back();
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.top}>
        <Button label="Skip" kind="ghost" onPress={finish} />
      </View>
      <View style={styles.card} accessibilityLiveRegion="polite">
        <View style={styles.icon}>
          <Icon size={40} color={colors.accentText} strokeWidth={1.75} />
        </View>
        <Text variant="title" align="center">
          {card.title}
        </Text>
        <Text tone="muted" align="center" style={styles.body}>
          {card.body}
        </Text>
      </View>
      <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${CARDS.length}`}>
        {CARDS.map((c, i) => (
          <View key={c.title} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
      <Button
        label={last ? 'Get started' : 'Next'}
        size="large"
        onPress={() => (last ? finish() : setIndex(index + 1))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: space.xl, gap: space.xl },
  top: { alignItems: 'flex-end' },
  card: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg },
  icon: {
    width: 88,
    height: 88,
    borderRadius: radius.xl,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.md,
  },
  body: { maxWidth: 420, lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.lineStrong },
  dotOn: { backgroundColor: colors.accentText, width: 24 },
});
