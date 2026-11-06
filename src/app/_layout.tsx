import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DATABASE_NAME, migrate } from '@/data/db';
import { videoQueue } from '@/jobs/create-video';
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
          <AppReady />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="gallery" options={{ presentation: 'fullScreenModal' }} />
            <Stack.Screen
              name="albums"
              options={{
                presentation: 'formSheet',
                sheetAllowedDetents: [0.6, 1],
                sheetGrabberVisible: true,
              }}
            />
            <Stack.Screen
              name="player/[id]"
              options={{ presentation: 'fullScreenModal', animation: 'fade' }}
            />
            <Stack.Screen
              name="creating/[id]"
              options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }}
            />
            <Stack.Screen
              name="result/[id]"
              options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }}
            />
            <Stack.Screen
              name="capture"
              options={{ presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' }}
            />
          </Stack>
        </SQLiteProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Rendered only once the database has opened and migrated (SQLiteProvider waits for `onInit`): hides the splash
 * and starts the video queue, which resumes any take left waiting or half made.
 */
function AppReady() {
  const db = useSQLiteContext();
  useEffect(() => {
    void SplashScreen.hideAsync();
    void videoQueue.start(db);
  }, [db]);
  return null;
}
