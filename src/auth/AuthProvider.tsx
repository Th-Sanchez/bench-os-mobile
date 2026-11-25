import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api/endpoints';
import { setApiAccessToken, setUnauthorizedHandler } from '@/api/http';
import { unregisterCurrentDevicePushToken } from '@/notifications/pushNotifications';
import { captureHandledException, setSentryUserContext } from '@/observability/sentry';
import { clearPersistedQueryCache } from '@/offline/queryPersistence';
import type {
  AuthResponse,
  LoginRequest,
  RegisterTenantRequest,
  TenantResponse,
  UserResponse,
} from '@/types/api';
import { clearSessionJson, readSessionJson, saveSessionJson } from './tokenStorage';

interface AuthSession {
  accessToken: string;
  expiresAt: string;
  user: UserResponse;
  tenant: TenantResponse;
}

interface AuthContextValue {
  session: AuthSession | null;
  isHydrating: boolean;
  isAuthenticated: boolean;
  isOwner: boolean;
  signIn: (payload: LoginRequest) => Promise<void>;
  registerShop: (payload: RegisterTenantRequest) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isSessionExpired(expiresAt: string): boolean {
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) return false;
  return Date.now() >= expiryMs - 30_000;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  const persistSession = useCallback(
    async (auth: AuthResponse) => {
      const next: AuthSession = {
        accessToken: auth.accessToken,
        expiresAt: auth.expiresAt,
        user: auth.user,
        tenant: auth.tenant,
      };
      // Purge any previously cached tenant data before switching accounts
      queryClient.clear();
      await clearPersistedQueryCache();

      setApiAccessToken(next.accessToken);
      setSentryUserContext({
        userId: next.user.id,
        role: next.user.role,
        tenantId: next.tenant.id,
        tenantName: next.tenant.name,
      });
      setSession(next);
      await saveSessionJson(JSON.stringify(next));
    },
    [queryClient]
  );

  const signOut = useCallback(async () => {
    try {
      await unregisterCurrentDevicePushToken();
    } catch {
      // Ignore push-token unregister network errors when logging out offline
    }
    setApiAccessToken(null);
    setSentryUserContext(null);
    setSession(null);
    queryClient.clear();
    await Promise.all([clearSessionJson(), clearPersistedQueryCache()]);
  }, [queryClient]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const raw = await readSessionJson();
        if (raw && active) {
          const parsed = JSON.parse(raw) as AuthSession;
          if (parsed?.accessToken && !isSessionExpired(parsed.expiresAt)) {
            setApiAccessToken(parsed.accessToken);
            setSentryUserContext({
              userId: parsed.user.id,
              role: parsed.user.role,
              tenantId: parsed.tenant.id,
              tenantName: parsed.tenant.name,
            });
            setSession(parsed);
          } else {
            setSentryUserContext(null);
            await Promise.all([clearSessionJson(), clearPersistedQueryCache()]);
          }
        }
      } catch (err) {
        captureHandledException(err, { 'error.source': 'session_hydration' });
        setSentryUserContext(null);
        await Promise.all([clearSessionJson(), clearPersistedQueryCache()]);
      } finally {
        if (active) setIsHydrating(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(
    async (payload: LoginRequest) => {
      const response = await authApi.login(payload);
      await persistSession(response);
    },
    [persistSession]
  );

  const registerShop = useCallback(
    async (payload: RegisterTenantRequest) => {
      const response = await authApi.register(payload);
      await persistSession(response);
    },
    [persistSession]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isHydrating,
      isAuthenticated: session !== null,
      isOwner: session?.user.role === 'OWNER',
      signIn,
      registerShop,
      signOut,
    }),
    [session, isHydrating, signIn, registerShop, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
