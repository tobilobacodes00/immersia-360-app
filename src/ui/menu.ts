import * as Haptics from 'expo-haptics';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type MenuItem = { label: string; onPress: () => void; destructive?: boolean; hidden?: boolean };

/**
 * A native action menu: the iOS action sheet (the reference's ⋯ menus), or an alert with buttons on Android.
 * Hidden items are left out, so callers can list every action and switch them by state.
 */
export function showMenu(title: string | undefined, items: MenuItem[]): void {
  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return;
  void Haptics.selectionAsync();

  if (Platform.OS === 'ios') {
    const destructive = visible.flatMap((item, i) => (item.destructive ? [i] : []));
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...visible.map((i) => i.label), 'Cancel'],
        cancelButtonIndex: visible.length,
        destructiveButtonIndex: destructive,
      },
      (index) => visible[index]?.onPress(),
    );
    return;
  }
  Alert.alert(title ?? '', undefined, [
    ...visible.map((i) => ({
      text: i.label,
      onPress: i.onPress,
      style: i.destructive ? ('destructive' as const) : ('default' as const),
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

/** "Delete 3 videos?" with a red confirm button. */
export function confirmDestructive(
  title: string,
  message: string,
  confirm: string,
  onConfirm: () => void,
): void {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirm, style: 'destructive', onPress: onConfirm },
  ]);
}
