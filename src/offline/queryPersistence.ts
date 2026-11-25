import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient, type Query } from '@tanstack/react-query';
import { ApiError } from '@/api/http';

export const OFFLINE_CACHE_KEY = 'benchos_rq_cache_v1';
export const OFFLINE_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24 hours

const PERSISTABLE_QUERY_PREFIXES = new Set([
  'bench-queue',
  'orders',
  'orders-list',
  'order',
  'customers',
  'customer',
  'customer-orders',
  'tenant-settings',
  'parts-catalog',
  'finance-summary',
  'finance-transactions',
  'finance-pending',
  'finance-daily-closing',
  'finance-suppliers',
  'orders-profitability',
  'stale-items',
  'abandonment-eligible',
  'abandonment-eligible-summary',
  'item-photos',
  'item-payments',
]);

export function shouldPersistQuery(query: Query): boolean {
  if (query.state.status !== 'success') return false;
  const rootKey = query.queryKey[0];
  return typeof rootKey === 'string' && PERSISTABLE_QUERY_PREFIXES.has(rootKey);
}

export function createBenchQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: OFFLINE_CACHE_MAX_AGE_MS,
        networkMode: 'offlineFirst',
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          if (!onlineManager.isOnline()) return false;
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 1;
        },
      },
      mutations: {
        networkMode: 'online',
      },
    },
  });
}

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: OFFLINE_CACHE_KEY,
  throttleTime: 1000,
});

export const queryPersistOptions = {
  persister: asyncStoragePersister,
  maxAge: OFFLINE_CACHE_MAX_AGE_MS,
  buster: 'v1',
  dehydrateOptions: {
    shouldDehydrateQuery: shouldPersistQuery,
  },
};

export async function clearPersistedQueryCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OFFLINE_CACHE_KEY);
  } catch {
    // Best-effort cleanup
  }
}

export interface OfflineCacheStats {
  hasCache: boolean;
  sizeKb: number;
  savedAt: number | null;
}

export async function getPersistedCacheStats(): Promise<OfflineCacheStats> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_CACHE_KEY);
    if (!raw) {
      return { hasCache: false, sizeKb: 0, savedAt: null };
    }
    let savedAt: number | null = null;
    try {
      const parsed = JSON.parse(raw) as { timestamp?: number };
      if (typeof parsed?.timestamp === 'number') {
        savedAt = parsed.timestamp;
      }
    } catch {
      savedAt = null;
    }
    return {
      hasCache: true,
      sizeKb: Math.max(1, Math.round(raw.length / 1024)),
      savedAt,
    };
  } catch {
    return { hasCache: false, sizeKb: 0, savedAt: null };
  }
}
