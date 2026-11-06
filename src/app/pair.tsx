import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSharingConfig } from '@/data/sharing-config';
import { sharingApi } from '@/platform/sharing-api';
import { colors, space } from '@/theme';
import { Button, Text } from '@/ui';

/**
 * Opened by scanning a Display's pairing QR with the iPhone camera (immersia360://pair?code=ABC123): pairs
 * that Display with this booth in one step.
 */
export default function PairRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const config = useSharingConfig();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!config || !code) return;
    let alive = true;
    sharingApi.claimDisplay(config, code).then(
      (d) => alive && setResult({ ok: true, message: `${d.name} now shows this booth's videos.` }),
      (e: unknown) => alive && setResult({ ok: false, message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [config, code]);

  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const message = !config
    ? 'Set up QR sharing first (Sharing on the home screen), then scan the code again.'
    : !code
      ? 'This link has no display code in it.'
      : result?.message;

  return (
    <SafeAreaView style={styles.screen}>
      <Text variant="title" align="center">
        {result?.ok
          ? 'Display connected'
          : config && code && !result
            ? 'Connecting the display…'
            : 'Could not connect the display'}
      </Text>
      {config && code && !result ? (
        <ActivityIndicator color={colors.textMuted} />
      ) : (
        <Text tone="muted" align="center">
          {message}
        </Text>
      )}
      <Button label="Done" onPress={done} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xxl,
  },
});
