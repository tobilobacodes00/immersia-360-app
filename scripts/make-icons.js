// Regenerate the icons (the rasteriser is not an app dependency): npm i --no-save @resvg/resvg-js && node scripts/make-icons.js assets
// Renders the Immersia 360 mark into every icon the app needs. Original artwork: a guest on the platform with
// the camera's orbit passing behind and in front of them. Ink, paper and cobalt, no gradients.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const out = process.argv[2];
const INK = '#111110';
const PAPER = '#f7f6f2';
const COBALT = '#2b3fe6';

/** The mark drawn in a 1024 box. `orbit`/`figure`/`camera` colours; `bg` null for transparent. */
function mark({ bg, orbit, figure, camera, scale = 1 }) {
  const s = scale;
  const t = (x) => 512 + (x - 512) * s; // scale about the centre
  const ry = 118 * s;
  const rx = 336 * s;
  const cy = t(640);
  const w = 64 * s;
  // The orbit is split into its back half (drawn behind the guest) and front half (in front).
  const back = `M ${t(176)} ${cy} A ${rx} ${ry} 0 0 1 ${t(848)} ${cy}`;
  const front = `M ${t(848)} ${cy} A ${rx} ${ry} 0 0 1 ${t(176)} ${cy}`;
  // Camera on the front of the orbit, a little right of centre.
  const angle = (62 * Math.PI) / 180;
  const camX = t(512) + rx * Math.cos(angle);
  const camY = cy + ry * Math.sin(angle);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  ${bg ? `<rect width="1024" height="1024" fill="${bg}"/>` : ''}
  <path d="${back}" fill="none" stroke="${orbit}" stroke-width="${w}" stroke-linecap="round" opacity="0.55"/>
  <circle cx="${t(512)}" cy="${t(318)}" r="${74 * s}" fill="${figure}"/>
  <rect x="${t(436)}" y="${t(410)}" width="${152 * s}" height="${250 * s}" rx="${76 * s}" fill="${figure}"/>
  <path d="${front}" fill="none" stroke="${orbit}" stroke-width="${w}" stroke-linecap="round"/>
  <circle cx="${camX}" cy="${camY}" r="${58 * s}" fill="${camera}" stroke="${bg ?? INK}" stroke-width="${18 * s}"/>
</svg>`;
}

function render(svg, size, file) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(path.join(out, file), png);
  console.log(file, size, png.length, 'bytes');
}

// App Store / iOS icon: full bleed, no transparency (iOS rounds the corners itself).
render(mark({ bg: INK, orbit: COBALT, figure: PAPER, camera: PAPER }), 1024, 'icon.png');
// Splash: the mark alone on the ink splash background.
render(mark({ bg: null, orbit: COBALT, figure: PAPER, camera: PAPER, scale: 0.9 }), 1024, 'splash-icon.png');
// Android adaptive icon: foreground inside the 66% safe zone, solid background, monochrome for themed icons.
render(
  mark({ bg: null, orbit: COBALT, figure: PAPER, camera: PAPER, scale: 0.62 }),
  1024,
  'android-icon-foreground.png',
);
render(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${INK}"/></svg>`,
  1024,
  'android-icon-background.png',
);
render(
  mark({ bg: null, orbit: '#ffffff', figure: '#ffffff', camera: '#ffffff', scale: 0.62 }),
  1024,
  'android-icon-monochrome.png',
);
// A preview to look at.
render(mark({ bg: INK, orbit: COBALT, figure: PAPER, camera: PAPER }), 256, 'preview-256.png');
