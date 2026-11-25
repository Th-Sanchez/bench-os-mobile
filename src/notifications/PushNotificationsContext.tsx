import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'expo-router';
import type { EventSubscription, NotificationResponse } from 'expo-notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import {
  configureForegroundNotificationHandler,
  isPushSupportedInRuntime,
  loadNotificationsModule,
  registerDevicePushToken,
  resolveNotificationRoute,
  type PushRegistrationStatus,
} from './pushNotifications';

interface PushNotificationsContextValue {
  status: PushRegistrationStatus;
  expoPushToken: string | null;
  isBusy: boolean;
  enableNotifications: () => Promise<PushRegistrationStatus>;
}

interface SessionPushState {
  userId: string;
  status: PushRegistrationStatus;
  token: string | null;
}

const PushNotificationsContext = createContext<PushNotificationsContextValue | null>(null);

export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrating, session } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [pushState, setPushState] = useState<SessionPushState | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handledNotificationIdsRef = useRef<Set<string>>(new Set());
  const registeredUserIdRef = useRef<string | null>(null);

  const currentUserId = isAuthenticated ? (session?.user.id ?? null) : null;
  const supported = isPushSupportedInRuntime();

  const effectiveStatus: PushRegistrationStatus = !supported
    ? 'unsupported'
    : currentUserId && pushState?.userId === currentUserId
      ? pushState.status
      : 'idle';

  const effectiveToken: string | null =
    currentUserId && pushState?.userId === currentUserId ? pushState.token : null;

  const invalidateRelatedQueries = useCallback(
    (data: Record<string, unknown> | undefined) => {
      const type = typeof data?.type === 'string' ? data.type : '';
      const orderId = typeof data?.orderId === 'string' ? data.orderId : null;

      if (type === 'QUOTE_APPROVED' || type === 'QUOTE_REJECTED' || orderId) {
        void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
        void queryClient.invalidateQueries({ queryKey: ['orders'] });
        if (orderId) {
          void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
        }
      } else if (type === 'FINANCE_DUE_ALERT') {
        void queryClient.invalidateQueries({ queryKey: ['finance-summary'] });
        void queryClient.invalidateQueries({ queryKey: ['finance-transactions'] });
      } else if (type === 'ORDER_DEADLINE_ALERT') {
        void queryClient.invalidateQueries({ queryKey: ['bench-queue'] });
      }
    },
    [queryClient]
  );

  const handleNotificationTap = useCallback(
    (response: NotificationResponse | null) => {
      if (!response || !isAuthenticated || isHydrating) return;

      const notificationId = response.notification.request.identifier;
      if (handledNotificationIdsRef.current.has(notificationId)) {
        return;
      }
      handledNotificationIdsRef.current.add(notificationId);

      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;

      invalidateRelatedQueries(data);

      const targetRoute = resolveNotificationRoute(data);
      if (targetRoute) {
        router.push(targetRoute as never);
      }
    },
    [invalidateRelatedQueries, isAuthenticated, isHydrating, router]
  );

  const syncRegistration = useCallback(
    async (userId: string, requestPermission: boolean): Promise<PushRegistrationStatus> => {
      if (!isPushSupportedInRuntime()) {
        return 'unsupported';
      }

      setIsBusy(true);
      try {
        const outcome = await registerDevicePushToken(requestPermission);
        setPushState({
          userId,
          status: outcome.status,
          token: outcome.token ?? null,
        });
        return outcome.status;
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  const enableNotifications = useCallback(async () => {
    if (!currentUserId) return 'idle' as PushRegistrationStatus;
    return syncRegistration(currentUserId, true);
  }, [currentUserId, syncRegistration]);

  // Register device token automatically once per authenticated operator session.
  useEffect(() => {
    if (!currentUserId) {
      registeredUserIdRef.current = null;
      return;
    }

    if (!supported || registeredUserIdRef.current === currentUserId) {
      return;
    }
    registeredUserIdRef.current = currentUserId;

    let cancelled = false;
    void registerDevicePushToken(true).then((outcome) => {
      if (cancelled) return;
      setPushState({
        userId: currentUserId,
        status: outcome.status,
        token: outcome.token ?? null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [currentUserId, supported]);

  // Attach foreground and tap listeners on supported native builds only.
  useEffect(() => {
    if (!supported) return;

    let disposed = false;
    let receivedSub: EventSubscription | null = null;
    let responseSub: EventSubscription | null = null;

    void (async () => {
      await configureForegroundNotificationHandler();
      const Notifications = await loadNotificationsModule();
      if (!Notifications || disposed) return;

      receivedSub = Notifications.addNotificationReceivedListener((notification) => {
        const data = notification.request.content.data as Record<string, unknown> | undefined;
        invalidateRelatedQueries(data);
      });

      responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
        handleNotificationTap(response);
      });
    })();

    return () => {
      disposed = true;
      receivedSub?.remove();
      responseSub?.remove();
    };
  }, [handleNotificationTap, invalidateRelatedQueries, supported]);

  // Handle cold-start notification launch once authentication finishes hydrating.
  useEffect(() => {
    if (!supported || isHydrating || !isAuthenticated) return;

    let disposed = false;
    void loadNotificationsModule().then((Notifications) => {
      if (!Notifications || disposed) return;
      const lastResponse = Notifications.getLastNotificationResponse();
      if (lastResponse) {
        handleNotificationTap(lastResponse);
      }
    });

    return () => {
      disposed = true;
    };
  }, [handleNotificationTap, isAuthenticated, isHydrating, supported]);

  const value = useMemo<PushNotificationsContextValue>(
    () => ({
      status: effectiveStatus,
      expoPushToken: effectiveToken,
      isBusy,
      enableNotifications,
    }),
    [effectiveStatus, effectiveToken, isBusy, enableNotifications]
  );

  return (
    <PushNotificationsContext.Provider value={value}>
      {children}
    </PushNotificationsContext.Provider>
  );
}

export function usePushNotifications(): PushNotificationsContextValue {
  const ctx = useContext(PushNotificationsContext);
  if (!ctx) {
    throw new Error('usePushNotifications must be used within a PushNotificationsProvider');
  }
  return ctx;
}
