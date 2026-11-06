import { forwardRef, type ComponentType, type RefAttributes } from 'react';

import { IS_EXPO_GO } from '@/platform/runtime';

import type { Preset } from '@/domain/settings';

import type { Lens } from './devices';
import type { BoothCameraHandle, BoothCameraProps } from './types';

export type { Lens } from './devices';
export type {
  BoothCameraHandle,
  BoothCameraProps,
  CameraFormat,
  CameraPosition,
  RecordedClip,
} from './types';

type CameraComponent = ComponentType<BoothCameraProps & RefAttributes<BoothCameraHandle>>;

// Resolved once. `require` keeps VisionCamera out of Expo Go entirely: its module creates a native object as
// soon as it is evaluated, and Expo Go does not have it.
const Implementation: CameraComponent = IS_EXPO_GO
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./ExpoGoCamera') as typeof import('./ExpoGoCamera')).ExpoGoCamera
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./VisionBoothCamera') as typeof import('./VisionBoothCamera')).VisionBoothCamera;

/** The booth camera: VisionCamera in the app, expo-camera in Expo Go. */
export const BoothCamera = forwardRef<BoothCameraHandle, BoothCameraProps>(function BoothCamera(props, ref) {
  return <Implementation {...props} ref={ref} />;
});

const noLenses = (): Lens[] => [];

/** The single lenses on one side of the phone. Empty in Expo Go, which has no lens choice. */
export const useLenses: (position: 'back' | 'front') => Lens[] = IS_EXPO_GO
  ? noLenses
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./VisionLenses') as typeof import('./VisionLenses')).useVisionLenses;

const noPresets = (): { presets: Preset[] | null; error: string | null } => ({ presets: [], error: null });

/** What the chosen lens can record (resolution × frame rate), checked with the camera. Empty in Expo Go. */
export const usePresets: (
  position: 'back' | 'front',
  lensId: string | null,
) => { presets: Preset[] | null; error: string | null } = IS_EXPO_GO
  ? noPresets
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('./VisionPresets') as typeof import('./VisionPresets')).useVisionPresets;
