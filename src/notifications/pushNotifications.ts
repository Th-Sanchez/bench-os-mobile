import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { usersApi } from '@/api/endpoints';
import { captureHandledException } from '@/observability/sentry';
import type { DevicePlatform } from '@/types/api';

export const BENCHOS_NOTIFICATION_CHANNEL_ID = 'benchos-alerts';

export type PushRegistrationStatus =
  | 'idle'
  | 'registered'
  | 'denied'
  | 'undetermined'
  | 'unsupported'
  | 'error';

export interface PushRegistrationOutcome {
  status: PushRegistrationStatus;
  token?: string;
}

let activePushTokenRef: string | null = null;
let handlerConfigured = false;

export function configureForegroundNotificationHandler(): void {
  if (handlerConfigured || Platform.OS === 'web') return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function isPushSupportedInRuntime(): boolean {
  if (Platform.OS === 'web') return false;
  if (!Device.isDevice) return false;
  // Remote push notifications are not supported inside Expo Go on Android (SDK 53+).
  if (Platform.OS === 'android' && isRunningInExpoGo()) return false;
  return true;
}

export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(BENCHOS_NOTIFICATION_CHANNEL_ID, {
    name: 'Alertas da Bancada',
    description: 'Aprovações de orçamento, contas a pagar e prazos de OS.',
    importance: AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: '#2563EB',
    sound: 'default',
  });
}

function resolveDevicePlatform(): DevicePlatform {
  if (Platform.OS === 'ios') return 'IOS';
  if (Platform.OS === 'android') return 'ANDROID';
  return 'WEB';
}

export async function registerDevicePushToken(
  requestPermission = true
): Promise<PushRegistrationOutcome> {
  if (!isPushSupportedInRuntime()) {
    return { status: 'unsupported' };
  }

  try {
    // On Android 13+, create notification channel before requesting permissions.
    await ensureAndroidNotificationChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      if (!requestPermission) {
        return {
          status: existingStatus === 'denied' ? 'denied' : 'undetermined',
        };
      }
      const permissionResult = await Notifications.requestPermissionsAsync();
      finalStatus = permissionResult.status;
    }

    if (finalStatus !== 'granted') {
      return { status: 'denied' };
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) {
      return { status: 'error' };
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const expoPushToken = tokenResponse.data?.trim();
    if (!expoPushToken) {
      return { status: 'error' };
    }

    await usersApi.registerPushToken({
      expoPushToken,
      platform: resolveDevicePlatform(),
      deviceName: Device.modelName ?? Device.deviceName ?? undefined,
    });

    activePushTokenRef = expoPushToken;
    return { status: 'registered', token: expoPushToken };
  } catch (err) {
    captureHandledException(err, { 'error.source': 'push_registration' });
    return { status: 'error' };
  }
}

export async function unregisterCurrentDevicePushToken(): Promise<void> {
  const token = activePushTokenRef;
  activePushTokenRef = null;
  if (!token) return;

  try {
    await usersApi.unregisterPushToken(token);
  } catch {
    // Best-effort cleanup during logout; never block session termination.
  }
}

export function resolveNotificationRoute(
  rawData: Record<string, unknown> | undefined
): string | null {
  if (!rawData) return null;

  const orderId = typeof rawData.orderId === 'string' ? rawData.orderId : null;
  const itemId = typeof rawData.itemId === 'string' ? rawData.itemId : null;
  if (orderId && itemId) {
    return `/orders/${orderId}/items/${itemId}`;
  }

  const type = typeof rawData.type === 'string' ? rawData.type : null;
  if (type === 'FINANCE_DUE_ALERT') {
    return '/(tabs)/finance';
  }
  if (type === 'ORDER_DEADLINE_ALERT') {
    return '/(tabs)/workbench';
  }

  const explicitRoute = typeof rawData.route === 'string' ? rawData.route : null;
  if (explicitRoute && explicitRoute.startsWith('/')) {
    return explicitRoute;
  }

  return null;
}
