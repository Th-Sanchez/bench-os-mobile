import * as Sentry from '@sentry/react-native';
import { isRunningInExpoGo } from 'expo';
import Constants from 'expo-constants';
import type { Role } from '@/types/api';

const SENTRY_DSN = (process.env.EXPO_PUBLIC_SENTRY_DSN || '').trim();
const APP_ENV =
  (process.env.EXPO_PUBLIC_APP_ENV || '').trim() || (__DEV__ ? 'development' : 'production');
const ENABLE_IN_DEV = process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV === 'true';

let initialized = false;

export interface SentrySessionUser {
  userId: string;
  role: Role;
  tenantId: string;
  tenantName: string;
}

export interface ApiBreadcrumbInput {
  method: string;
  path: string;
  status?: number;
  durationMs: number;
  requestId?: string;
  ok: boolean;
}

export interface ApiErrorContext {
  method: string;
  path: string;
  status?: number;
  requestId?: string;
  stage?: 'api' | 'storage_upload';
}

export function isSentryConfigured(): boolean {
  return SENTRY_DSN.length > 0 && (!__DEV__ || ENABLE_IN_DEV);
}

export function getAppVersionLabel(): string {
  const version = Constants.expoConfig?.version || '1.1.0';
  const buildNumber =
    Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber;
  return buildNumber ? `v${version} (${buildNumber})` : `v${version}`;
}

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  if (!isSentryConfigured()) {
    return;
  }

  const inExpoGo = isRunningInExpoGo();

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: APP_ENV,
    enabled: true,
    sendDefaultPii: false,
    tracesSampleRate: APP_ENV === 'production' ? 0.2 : 0.5,
    enableNativeFramesTracking: !inExpoGo,
    integrations: [
      Sentry.expoRouterIntegration({
        enableTimeToInitialDisplay: !inExpoGo,
      }),
    ],
    beforeSend(event) {
      if (event.request?.headers) {
        const sanitizedHeaders = { ...event.request.headers };
        delete sanitizedHeaders.Authorization;
        delete sanitizedHeaders.authorization;
        event.request.headers = sanitizedHeaders;
      }
      return event;
    },
  });

  Sentry.setTag('app.env', APP_ENV);
  Sentry.setTag('app.version', Constants.expoConfig?.version || 'unknown');
}

export function setSentryUserContext(session: SentrySessionUser | null): void {
  if (!isSentryConfigured()) return;

  if (!session) {
    Sentry.setUser(null);
    Sentry.setTag('tenant.id', undefined);
    Sentry.setTag('user.role', undefined);
    Sentry.setContext('workshop', null);
    return;
  }

  // Non-PII operator context so production crashes can be triaged by workshop and role.
  Sentry.setUser({ id: session.userId });
  Sentry.setTag('tenant.id', session.tenantId);
  Sentry.setTag('user.role', session.role);
  Sentry.setContext('workshop', {
    tenantId: session.tenantId,
    tenantName: session.tenantName,
    operatorRole: session.role,
  });
}

export function addApiBreadcrumb(input: ApiBreadcrumbInput): void {
  if (!isSentryConfigured()) return;

  Sentry.addBreadcrumb({
    category: 'http',
    type: 'http',
    level: input.ok ? 'info' : 'error',
    message: `${input.method} ${input.path}`,
    data: {
      method: input.method,
      path: input.path,
      status_code: input.status,
      duration_ms: input.durationMs,
      request_id: input.requestId,
    },
  });
}

/**
 * Captures unexpected API / network / object-storage failures.
 * Expected client errors (4xx validation/auth/business rules) are intentionally skipped
 * so Sentry alerts remain high-signal and actionable.
 */
export function captureApiError(error: unknown, context: ApiErrorContext): void {
  if (!isSentryConfigured()) return;

  const isExpectedClientError =
    context.stage !== 'storage_upload' &&
    typeof context.status === 'number' &&
    context.status >= 400 &&
    context.status < 500;

  if (isExpectedClientError) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag('error.source', context.stage === 'storage_upload' ? 'storage_upload' : 'api');
    scope.setTag('http.method', context.method);
    scope.setTag('http.path', context.path);
    if (context.status !== undefined) {
      scope.setTag('http.status', String(context.status));
    }
    if (context.requestId) {
      scope.setTag('backend.request_id', context.requestId);
    }
    scope.setContext('api_error', {
      method: context.method,
      path: context.path,
      status: context.status,
      requestId: context.requestId,
      stage: context.stage ?? 'api',
    });
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

export function captureHandledException(
  error: unknown,
  tags?: Record<string, string>,
  extra?: Record<string, unknown>
): void {
  if (!isSentryConfigured()) return;

  Sentry.withScope((scope) => {
    if (tags) {
      for (const [key, value] of Object.entries(tags)) {
        scope.setTag(key, value);
      }
    }
    if (extra) {
      scope.setExtras(extra);
    }
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

export const wrapRootComponent = Sentry.wrap;
export const wrapRouterErrorBoundary = Sentry.wrapExpoRouterErrorBoundary;
