import { CameraView } from 'expo-camera';
import { forwardRef, useImperativeHandle, useRef } from 'react';

import type { BoothCameraHandle, BoothCameraProps, CameraFormat } from './types';

/** expo-camera has no frame-rate control: it records at 30 fps, so takes made in Expo Go have no slow motion. */
const FORMAT: CameraFormat = { width: 1920, height: 1080, fps: 30, lensName: null };

/**
 * The stand-in camera for Expo Go. Same handle as the real one, so the capture screen cannot tell them apart.
 */
export const ExpoGoCamera = forwardRef<BoothCameraHandle, BoothCameraProps>(function ExpoGoCamera(
  { position, prefs, torch, isActive, onReady, onError, style },
  ref,
) {
  const camera = useRef<CameraView>(null);
  const recording = useRef<{ startedAt: number } | null>(null);

  useImperativeHandle(ref, () => ({
    async start(maxDurationS, onFinished, onRecordError) {
      const view = camera.current;
      if (!view) throw new Error('The camera is not ready yet.');
      recording.current = { startedAt: Date.now() };
      // recordAsync resolves when the recording ends, not when it starts. Frames start within a few frames
      // of the call, which is close enough for the timer in Expo Go.
      view
        .recordAsync({ maxDuration: maxDurationS })
        .then((result) => {
          const startedAt = recording.current?.startedAt ?? Date.now();
          recording.current = null;
          if (!result?.uri) return onRecordError('The recording could not be saved.');
          onFinished({
            ...FORMAT,
            uri: result.uri,
            durationS: Math.min(maxDurationS, (Date.now() - startedAt) / 1000),
          });
        })
        .catch((error: unknown) => {
          recording.current = null;
          onRecordError(error instanceof Error ? error.message : String(error));
        });
    },
    async stop() {
      camera.current?.stopRecording();
    },
  }));

  return (
    <CameraView
      ref={camera}
      style={style}
      active={isActive}
      mode="video"
      facing={position}
      mute
      enableTorch={torch && position === 'back'}
      videoQuality="1080p"
      videoStabilizationMode={prefs.stabilization === 'off' ? 'off' : 'standard'}
      mirror={position === 'front' && prefs.mirror}
      onCameraReady={() => onReady(FORMAT)}
      onMountError={(e) => onError(e.message)}
    />
  );
});
