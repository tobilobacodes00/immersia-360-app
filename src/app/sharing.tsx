import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SharingScreen } from '@/features/sharing/SharingScreen';
import { colors, space } from '@/theme';
import { Text } from '@/ui';

/** Sharing from the home screen's bottom bar. */
export default function SharingRoute() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.side} />
        <Text variant="headline" accessibilityRole="header">
          Sharing
        </Text>
        <Pressable
          style={[styles.side, styles.right]}
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
        >
          <Text variant="headline" tone="accent">
            Done
          </Text>
        </Pressable>
      </View>
      <SharingScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg },
  side: { width: 60 },
  right: { alignItems: 'flex-end' },
});
