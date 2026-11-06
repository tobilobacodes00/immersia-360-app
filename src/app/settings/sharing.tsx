import { Stack } from 'expo-router';

import { SharingScreen } from '@/features/sharing/SharingScreen';

/** QR sharing and the Display from inside Settings. */
export default function SettingsSharingRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'QR sharing' }} />
      <SharingScreen />
    </>
  );
}
