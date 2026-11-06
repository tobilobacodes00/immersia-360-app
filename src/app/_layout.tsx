import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DATABASE_NAME, migrate } from '@/data/db';
import { colors } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accentText,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.line,
    notification: colors.accent,
  },
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemeProvider value={theme}>
        <SQLiteProvider
          databaseName={DATABASE_NAME}
          onInit={migrate}
          options={{ enableChangeListener: true }}
        >
          <HideSplashWhenReady />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          </Stack>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/** Rendered only once the database has opened and migrated (SQLiteProvider waits for `onInit`). */
function HideSplashWhenReady() {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);
  return null;
}
