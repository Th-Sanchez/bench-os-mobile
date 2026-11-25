import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager, useQueryClient } from '@tanstack/react-query';

interface NetworkStatusContextValue {
  isOnline: boolean;
  isOffline: boolean;
  justReconnected: boolean;
  lastSyncedAt: number | null;
}

const NetworkStatusContext = createContext<NetworkStatusContextValue | null>(null);

function resolveIsOnline(state: NetInfoState): boolean {
  // Treat `isConnected === false` or explicitly unreachable internet as offline.
  // Keep `null` (indeterminate during startup) optimistic so we don't flash offline falsely.
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

export function NetworkStatusProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const wasOfflineRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const applyState = (state: NetInfoState) => {
      const online = resolveIsOnline(state);
      onlineManager.setOnline(online);
      setIsOnline(online);

      if (!online) {
        wasOfflineRef.current = true;
        setJustReconnected(false);
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      } else if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setJustReconnected(true);
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = setTimeout(() => {
          setJustReconnected(false);
          reconnectTimerRef.current = null;
        }, 2800);
      }
    };

    const unsubscribe = NetInfo.addEventListener(applyState);
    void NetInfo.fetch().then(applyState);

    return () => {
      unsubscribe();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        onlineManager.isOnline()
      ) {
        setLastSyncedAt(Date.now());
      }
    });
    return unsubscribe;
  }, [queryClient]);

  const value = useMemo<NetworkStatusContextValue>(
    () => ({
      isOnline,
      isOffline: !isOnline,
      justReconnected,
      lastSyncedAt,
    }),
    [isOnline, justReconnected, lastSyncedAt]
  );

  return (
    <NetworkStatusContext.Provider value={value}>
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatusContextValue {
  const ctx = useContext(NetworkStatusContext);
  if (!ctx) {
    throw new Error('useNetworkStatus must be used within a NetworkStatusProvider');
  }
  return ctx;
}
