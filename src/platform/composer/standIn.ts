import { File } from 'expo-file-system';

import type { ComposeRequest, ComposeResult, Composer } from './types';

/**
 * The video engine inside Expo Go (and on Android until its engine ships): copies the recording as the
 * "video", so every screen after capture can be tried. No slow motion, reverse, frame or music.
 */
export const standInComposer: Composer = {
  isReal: false,
  async compose(request: ComposeRequest, onProgress: (fraction: number) => void): Promise<ComposeResult> {
    const source = new File(`file://${request.inputPath}`);
    const extension = source.extension || '.mov';
    const outputPath = request.outputPath.replace(/\.[^./]+$/, extension);
    const destination = new File(`file://${outputPath}`);
    if (destination.exists) destination.delete();
    onProgress(0.1);
    await source.copy(destination);
    onProgress(1);
    const forwardS = request.segments.reduce((sum, s) => sum + (s.srcEndS - s.srcStartS), 0);
    return { outputPath, durationS: forwardS, bytes: destination.size };
  },
  cancel() {},
};
