import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '@/api/endpoints';
import { setApiAccessToken, setUnauthorizedHandler } from '@/api/http';
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
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  const persistSession = useCallback(async (auth: AuthResponse) => {
    const next: AuthSession = {
      accessToken: auth.accessToken,
      expiresAt: auth.expiresAt,
      user: auth.user,
      tenant: auth.tenant,
    };
    setApiAccessToken(next.accessToken);
    setSession(next);
    await saveSessionJson(JSON.stringify(next));
  }, []);

  const signOut = useCallback(async () => {
    setApiAccessToken(null);
    setSession(null);
    await clearSessionJson();
  }, []);

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
            setSession(parsed);
          } else {
            await clearSessionJson();
          }
        }
      } catch {
        await clearSessionJson();
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
