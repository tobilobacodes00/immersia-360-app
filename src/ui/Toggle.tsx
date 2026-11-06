import { Switch } from 'react-native';

import { colors } from '@/theme';

export function Toggle({
  value,
  onChange,
  label,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      trackColor={{ false: colors.lineStrong, true: colors.accent }}
      thumbColor={colors.onAccent}
      ios_backgroundColor={colors.lineStrong}
    />
  );
}
