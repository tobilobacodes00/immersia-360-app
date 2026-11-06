import { requireOptionalNativeModule, type EventEmitter } from 'expo';
import { Platform } from 'react-native';

import { IS_EXPO_GO } from '@/platform/runtime';

import { standInComposer } from './standIn';
import type { ComposeRequest, ComposeResult, Composer } from './types';

export type { ComposeRequest, ComposeResult, Composer } from './types';

type ProgressEvent = { jobId: string; fraction: number };
type Events = { onProgress: (event: ProgressEvent) => void };

type NativeComposer = {
  compose(request: ComposeRequest): Promise<{ durationS: number; bytes: number }>;
  cancel(jobId: string): void;
  addListener: EventEmitter<Events>['addListener'];
};

// The engine is the local Expo module in modules/immersia-composer (iOS first). Expo Go and Android
// builds without it get the stand-in.
const native =
  IS_EXPO_GO || Platform.OS !== 'ios'
    ? null
    : requireOptionalNativeModule<NativeComposer>('ImmersiaComposer');

const nativeComposer = (engine: NativeComposer): Composer => ({
  isReal: true,
  async compose(request, onProgress): Promise<ComposeResult> {
    const subscription = engine.addListener('onProgress', (event) => {
      if (event.jobId === request.jobId) onProgress(event.fraction);
    });
    try {
      const result = await engine.compose(request);
      return { outputPath: request.outputPath, ...result };
    } finally {
      subscription.remove();
    }
  },
  cancel: (jobId) => engine.cancel(jobId),
});

export const composer: Composer = native ? nativeComposer(native) : standInComposer;
