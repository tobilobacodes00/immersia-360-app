import { isRunningInExpoGo } from 'expo';

/**
 * Expo Go cannot load the high-frame-rate camera or our video engine. Inside it the app runs on stand-ins
 * (expo-camera at normal frame rate, a pass-through "video engine") so every screen can still be tried.
 */
export const IS_EXPO_GO = isRunningInExpoGo();

/** Frame rate of the Expo Go stand-in camera: no slow motion is possible there. */
export const EXPO_GO_CAMERA_FPS = 30;
