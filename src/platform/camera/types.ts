import type { StyleProp, ViewStyle } from 'react-native';

import type { CameraPrefs } from '@/domain/settings';

export type CameraPosition = 'back' | 'front';

/** What the camera actually settled on, which can differ from what was asked for. */
export type CameraFormat = { width: number; height: number; fps: number; lensName: string | null };

/** A finished recording, still in the camera's temporary location. */
export type RecordedClip = CameraFormat & { uri: string; durationS: number };

/**
 * The booth's camera, the same on both implementations: expo-camera inside Expo Go, VisionCamera in the app.
 * The capture screen only ever talks to this.
 */
export type BoothCameraHandle = {
  /**
   * Starts recording. Resolves once frames are being written, so the timer starts with the real recording.
   * `onFinished` fires once when it ends: stopped, or `maxDurationS` reached.
   */
  start(
    maxDurationS: number,
    onFinished: (clip: RecordedClip) => void,
    onError: (message: string) => void,
  ): Promise<void>;
  stop(): Promise<void>;
};

export type BoothCameraProps = {
  position: CameraPosition;
  prefs: CameraPrefs;
  torch: boolean;
  /** False while the screen is in the background or not focused: frees the camera. */
  isActive: boolean;
  onReady: (format: CameraFormat) => void;
  onError: (message: string) => void;
  style?: StyleProp<ViewStyle>;
};
