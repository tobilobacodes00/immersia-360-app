import { Text as RNText, type TextProps } from 'react-native';

import { colors, type as scale } from '@/theme';

export type TextVariant = keyof typeof scale;
export type TextTone =
  'default' | 'muted' | 'faint' | 'disabled' | 'accent' | 'danger' | 'onAccent' | 'overlay';

const toneColor: Record<TextTone, string> = {
  default: colors.text,
  muted: colors.textMuted,
  faint: colors.textFaint,
  disabled: colors.textDisabled,
  accent: colors.accentText,
  danger: colors.danger,
  onAccent: colors.onAccent,
  overlay: colors.overlayText,
};

export function Text({
  variant = 'body',
  tone = 'default',
  align,
  style,
  ...props
}: TextProps & { variant?: TextVariant; tone?: TextTone; align?: 'left' | 'center' | 'right' }) {
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...props}
      style={[scale[variant], { color: toneColor[tone] }, align && { textAlign: align }, style]}
    />
  );
}
