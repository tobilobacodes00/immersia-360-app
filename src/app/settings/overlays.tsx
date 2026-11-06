import { Stack, useLocalSearchParams } from 'expo-router';

import { OverlaysScreen } from '@/features/look/OverlaysScreen';

/** Overlays and Audio files from inside Settings: the same library, in the Settings stack. */
export default function SettingsOverlaysRoute() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: tab === 'music' ? 'Audio files' : 'Overlays' }} />
      <OverlaysScreen initialTab={tab === 'music' ? 'music' : 'frames'} />
    </>
  );
}
