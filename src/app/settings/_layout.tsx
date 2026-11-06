import { Stack } from 'expo-router';

import { SettingsDraftProvider } from '@/features/settings/draft';
import { colors } from '@/theme';

export default function SettingsLayout() {
  return (
    <SettingsDraftProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.accentText,
          headerTitleStyle: { color: colors.text },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Settings' }} />
        <Stack.Screen name="lens" options={{ title: 'Lens' }} />
        <Stack.Screen name="preset" options={{ title: 'Preset' }} />
        <Stack.Screen name="overlays" options={{ title: 'Overlays' }} />
        <Stack.Screen name="sharing" options={{ title: 'QR sharing' }} />
        <Stack.Screen name="legal" options={{ title: 'Privacy Policy' }} />
      </Stack>
    </SettingsDraftProvider>
  );
}
