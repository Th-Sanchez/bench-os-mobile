import { Alert, type AlertButton, type AlertOptions } from 'react-native';

let configured = false;

/**
 * React Native on Android defaults `Alert.alert` to `cancelable: false`,
 * which blocks closing popup dialogs by tapping outside or pressing Back.
 * Call once at app startup so every `Alert.alert` is cancelable by default
 * unless a caller explicitly passes `{ cancelable: false }`.
 */
export function configureAlertDefaults(): void {
  if (configured) return;
  configured = true;

  const originalAlert = Alert.alert.bind(Alert);
  Alert.alert = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ) => {
    originalAlert(title, message, buttons, {
      cancelable: true,
      ...options,
    });
  };
}
