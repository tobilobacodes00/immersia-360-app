import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import {
  Camera,
  useCameraDevices,
  useVideoOutput,
  type CameraDevice,
  type CameraSessionConfig,
  type Constraint,
  type Recorder,
} from 'react-native-vision-camera';

import { recordingBitrate } from '@/domain/bitrate';

import { pickDevice, targetSize } from './devices';
import type { BoothCameraHandle, BoothCameraProps, CameraFormat } from './types';

/** When no preset is chosen: 1080p at the highest frame rate this camera can do there. */
const DEFAULT_PRESET = { width: 1920, height: 1080, fps: 240 };

/**
 * The real booth camera (VisionCamera). Only loaded outside Expo Go: importing VisionCamera creates its native
 * module immediately, which does not exist in Expo Go.
 *
 * Resolution is negotiated first and frame rate second, so "1080p · 240 fps" on a phone that only manages
 * 120 fps at 1080p records 1080p at 120 fps rather than dropping to 720p. What was actually chosen is reported
 * through `onReady` and stored with the take, so the slow-motion maths always uses the real frame rate.
 */
export const VisionBoothCamera = forwardRef<BoothCameraHandle, BoothCameraProps>(function VisionBoothCamera(
  { position, prefs, torch, isActive, onReady, onError, style },
  ref,
) {
  const devices = useCameraDevices();
  const device = pickDevice(devices, position, prefs.lensId);
  const preset = prefs.preset ?? DEFAULT_PRESET;
  const target = targetSize(preset);

  const videoOutput = useVideoOutput({
    targetResolution: target,
    targetBitRate: recordingBitrate(preset.width, preset.height, preset.fps, prefs.quality),
    enableAudio: false,
    fileType: 'mov',
  });

  const constraints = useMemo<Constraint[]>(
    () => [
      { resolutionBias: videoOutput },
      { fps: preset.fps },
      { videoStabilizationMode: prefs.stabilization === 'off' ? 'off' : 'standard' },
    ],
    [videoOutput, preset.fps, prefs.stabilization],
  );

  const selected = useRef<CameraFormat | null>(null);
  const recorder = useRef<Recorder | null>(null);

  const describe = (config: CameraSessionConfig | null, dev: CameraDevice): CameraFormat => {
    const size = videoOutput.currentResolution ?? target;
    return {
      width: Math.max(size.width, size.height),
      height: Math.min(size.width, size.height),
      fps: config?.selectedFPS ?? preset.fps,
      lensName: dev.localizedName,
    };
  };

  useImperativeHandle(ref, () => ({
    async start(maxDurationS, onFinished, onRecordError) {
      if (!device) throw new Error('No camera is available.');
      const format = selected.current ?? describe(null, device);
      const r = await videoOutput.createRecorder({ maxDuration: maxDurationS });
      recorder.current = r;
      await r.startRecording(
        (filePath) => {
          recorder.current = null;
          onFinished({
            ...format,
            uri: filePath.startsWith('file://') ? filePath : `file://${filePath}`,
            durationS: Math.min(maxDurationS, r.recordedDuration),
          });
        },
        (error) => {
          recorder.current = null;
          onRecordError(error.message);
        },
      );
    },
    async stop() {
      await recorder.current?.stopRecording();
    },
  }));

  if (!device) return null;

  return (
    <Camera
      style={style}
      isActive={isActive}
      device={device}
      outputs={[videoOutput]}
      constraints={constraints}
      mirrorMode={position === 'front' ? (prefs.mirror ? 'on' : 'auto') : 'off'}
      torchMode={torch && device.hasTorch ? 'on' : 'off'}
      resizeMode="cover"
      onSessionConfigSelected={(config) => {
        selected.current = describe(config, device);
      }}
      onStarted={() => onReady(selected.current ?? describe(null, device))}
      onError={(error) => onError(error.message)}
    />
  );
});
