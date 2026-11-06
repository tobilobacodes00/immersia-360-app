import { useMemo } from 'react';
import { useCameraDevices } from 'react-native-vision-camera';

import { listLenses, type Lens } from './devices';

export function useVisionLenses(position: 'back' | 'front'): Lens[] {
  const devices = useCameraDevices();
  return useMemo(() => listLenses(devices, position), [devices, position]);
}
