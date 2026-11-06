import { Asset, requestPermissionsAsync } from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Alert, Linking } from 'react-native';

export type SaveResult = 'saved' | 'denied' | 'failed';

/**
 * Adds a video to Photos. Asks for add-only access (no reading of the library) the first time. When access
 * was turned off, offers the Settings app instead of failing silently.
 */
export async function saveVideoToPhotos(fileUri: string, { quiet = false } = {}): Promise<SaveResult> {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) {
    if (!quiet) {
      Alert.alert('Photos access is off', 'Allow Immersia 360 to add to your Photos in the Settings app.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ]);
    }
    return 'denied';
  }
  try {
    await Asset.create(fileUri);
    return 'saved';
  } catch (error) {
    if (!quiet)
      Alert.alert('Could not save to Photos', error instanceof Error ? error.message : String(error));
    return 'failed';
  }
}

/** The iOS share sheet: AirDrop, Messages, Save Video, other apps. */
export async function shareVideo(fileUri: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    Alert.alert('Sharing is not available on this device.');
    return;
  }
  const isMp4 = /\.mp4$/i.test(fileUri);
  await Sharing.shareAsync(fileUri, {
    mimeType: isMp4 ? 'video/mp4' : 'video/quicktime',
    UTI: isMp4 ? 'public.mpeg-4' : 'com.apple.quicktime-movie',
  });
}
