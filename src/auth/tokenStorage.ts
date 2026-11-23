import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'benchos_auth_session_v1';

export async function saveSessionJson(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(SESSION_KEY, value);
    } catch {
      // ignore storage errors on restricted web contexts
    }
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, value);
}

export async function readSessionJson(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(SESSION_KEY) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function clearSessionJson(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    return;
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
