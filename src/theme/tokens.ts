import type { TextStyle } from 'react-native';

/**
 * Every colour, size and font the app uses. Restyling the app means editing this file only.
 *
 * Brand: ink, paper and one cobalt accent, no gradients. Contrast ratios are against `bg` (#111110):
 * cobalt #2b3fe6 is only 2.7:1 there, so it is used as a FILL (white text on it is 7.1:1) and the lighter
 * `accentText` (6.2:1) is used for cobalt text, outlines and indicators on dark surfaces.
 */
export const colors = {
  bg: '#111110', // ink: every screen
  surface: '#1b1b19', // grouped rows, cards
  surfaceRaised: '#242422', // sheets, menus, stepper wells
  surfacePressed: '#2e2e2b',
  line: '#2e2e2b', // hairlines between rows
  lineStrong: '#45443f', // control borders

  text: '#f7f6f2', // paper, 18:1
  textMuted: '#b3b0a8', // secondary values, 8.6:1
  textFaint: '#8a8780', // captions, section headers, 5.2:1 (smallest legible text)
  textDisabled: '#5e5c57', // disabled controls and decoration only

  accent: '#2b3fe6', // cobalt fill: primary buttons, the slow-mo window, toggles
  accentPressed: '#1f2fc4',
  accentText: '#7c8aff', // cobalt for text, rings and indicators on dark
  accentSoft: 'rgba(43, 63, 230, 0.22)', // selected-row wash
  onAccent: '#ffffff',

  record: '#e5484d', // the record button only
  ok: '#3fb27f',
  warn: '#f5a524',
  danger: '#ff6369', // destructive text on dark, 5.9:1

  scrim: 'rgba(0, 0, 0, 0.55)', // behind sheets and over the camera preview
  overlayText: '#ffffff', // text drawn over the live camera
} as const;

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

/** System font for now (SF Pro on iOS). Satoshi drops in here once its app-embedding licence is confirmed. */
export const fontFamily = {
  regular: undefined,
  medium: undefined,
  semibold: undefined,
  bold: undefined,
} as const;

export const type = {
  display: { fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  timer: { fontSize: 17, lineHeight: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  countdown: { fontSize: 160, lineHeight: 176, fontWeight: '700', fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/** Minimum touch target (Apple HIG). */
export const hitSize = 44;

export const motion = { fast: 120, normal: 220, slow: 360 } as const;
