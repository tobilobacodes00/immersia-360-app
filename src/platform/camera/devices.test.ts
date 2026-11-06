import { listLenses, pickDevice, targetSize, type DeviceLike } from './devices';

const device = (id: string, position: string, type: string, isVirtualDevice = false): DeviceLike => ({
  id,
  position,
  type,
  isVirtualDevice,
  localizedName: id,
});

// An iPhone Pro: a virtual triple camera plus its three single lenses, and the front camera.
const pro = [
  device('triple', 'back', 'triple', true),
  device('tele', 'back', 'telephoto'),
  device('wide', 'back', 'wide-angle'),
  device('ultra', 'back', 'ultra-wide-angle'),
  device('front', 'front', 'wide-angle'),
];

describe('pickDevice', () => {
  it('uses the single wide lens by default, never the virtual camera', () => {
    expect(pickDevice(pro, 'back', null)?.id).toBe('wide');
    expect(pickDevice(pro, 'front', null)?.id).toBe('front');
  });

  it('uses the chosen lens while it exists', () => {
    expect(pickDevice(pro, 'back', 'ultra')?.id).toBe('ultra');
    expect(pickDevice(pro, 'back', 'gone')?.id).toBe('wide');
  });

  it('falls back to whatever the side has', () => {
    expect(pickDevice([device('only', 'back', 'dual', true)], 'back', null)?.id).toBe('only');
    expect(pickDevice([], 'back', null)).toBeUndefined();
  });
});

describe('listLenses', () => {
  it('lists single lenses, ultra wide first, and marks the default', () => {
    expect(listLenses(pro, 'back')).toEqual([
      { id: 'ultra', name: 'Ultra Wide (0.5×)', isDefault: false },
      { id: 'wide', name: 'Wide (1×)', isDefault: true },
      { id: 'tele', name: 'Telephoto', isDefault: false },
    ]);
  });

  it('names the front camera plainly', () => {
    expect(listLenses(pro, 'front')).toEqual([{ id: 'front', name: 'Front camera', isDefault: true }]);
  });
});

describe('targetSize', () => {
  it('turns a landscape preset portrait', () => {
    expect(targetSize({ width: 1920, height: 1080 })).toEqual({ width: 1080, height: 1920 });
    expect(targetSize({ width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 });
  });
});
