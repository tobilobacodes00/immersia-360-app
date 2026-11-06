import type { Preset } from '@/domain/settings';

/** The parts of a VisionCamera device this file needs, so the logic is testable without the native module. */
export type DeviceLike = {
  id: string;
  position: string;
  type: string;
  isVirtualDevice: boolean;
  localizedName: string;
};

const LENS_ORDER = ['ultra-wide-angle', 'wide-angle', 'telephoto'] as const;
const LENS_NAME: Record<(typeof LENS_ORDER)[number], string> = {
  'ultra-wide-angle': 'Ultra Wide (0.5×)',
  'wide-angle': 'Wide (1×)',
  telephoto: 'Telephoto',
};

/**
 * The camera to record with. A chosen lens wins while it exists. Otherwise the single wide lens, never a
 * virtual multi-lens camera: those switch lenses by themselves when the subject comes close, which on a
 * spinner happens mid-take and jumps the picture.
 */
export function pickDevice<D extends DeviceLike>(
  devices: D[],
  position: 'back' | 'front',
  lensId: string | null,
): D | undefined {
  const here = devices.filter((d) => d.position === position);
  return (
    (lensId ? here.find((d) => d.id === lensId) : undefined) ??
    here.find((d) => !d.isVirtualDevice && d.type === 'wide-angle') ??
    here.find((d) => !d.isVirtualDevice) ??
    here[0]
  );
}

export type Lens = { id: string; name: string; isDefault: boolean };

/** The single lenses on one side, ultra wide first, for the Lens picker. */
export function listLenses(devices: DeviceLike[], position: 'back' | 'front'): Lens[] {
  const defaultId = pickDevice(devices, position, null)?.id;
  return devices
    .filter(
      (d) =>
        d.position === position && !d.isVirtualDevice && (LENS_ORDER as readonly string[]).includes(d.type),
    )
    .sort((a, b) => LENS_ORDER.indexOf(a.type as never) - LENS_ORDER.indexOf(b.type as never))
    .map((d) => ({
      id: d.id,
      name:
        position === 'front'
          ? 'Front camera'
          : (LENS_NAME[d.type as keyof typeof LENS_NAME] ?? d.localizedName),
      isDefault: d.id === defaultId,
    }));
}

/** VisionCamera's target sizes are portrait (width < height); presets are stored landscape, as cameras report them. */
export function targetSize(preset: Pick<Preset, 'width' | 'height'>): { width: number; height: number } {
  return { width: Math.min(preset.width, preset.height), height: Math.max(preset.width, preset.height) };
}

/** Resolutions offered in the Preset picker, largest first. Anything else the camera reports is not useful here. */
export const PRESET_RESOLUTIONS = [
  { width: 3840, height: 2160 },
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
] as const;

export const PRESET_FPS = [240, 120, 60, 30] as const;
