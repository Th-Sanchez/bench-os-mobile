import { Platform } from 'react-native';
import { File, UploadTask, UploadType } from 'expo-file-system';
import { addApiBreadcrumb, captureApiError } from '@/observability/sentry';
import type { ProblemDetail } from '@/types/api';

const DEFAULT_API_URL = 'http://localhost:8080';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetail;
  readonly requestId?: string;

  constructor(status: number, message: string, problem?: ProblemDetail, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
    this.requestId = requestId ?? problem?.requestId;
  }
}

let accessTokenRef: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setApiAccessToken(token: string | null) {
  accessTokenRef = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | string[] | undefined | null>;
  skipAuth?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, item);
        }
      } else {
        url.searchParams.append(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, skipAuth = false } = options;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const startedAt = Date.now();

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth && accessTokenRef) {
    headers.Authorization = `Bearer ${accessTokenRef}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(normalizedPath, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkError) {
    addApiBreadcrumb({
      method,
      path: normalizedPath,
      durationMs: Date.now() - startedAt,
      ok: false,
    });
    captureApiError(networkError, {
      method,
      path: normalizedPath,
      stage: 'api',
    });
    throw networkError;
  }

  const headerRequestId = response.headers.get('X-Request-Id') ?? undefined;

  if (response.status === 204) {
    addApiBreadcrumb({
      method,
      path: normalizedPath,
      status: 204,
      durationMs: Date.now() - startedAt,
      requestId: headerRequestId,
      ok: true,
    });
    return undefined as T;
  }

  const text = await response.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!response.ok) {
    const problem = (parsed && typeof parsed === 'object' ? parsed : undefined) as ProblemDetail | undefined;
    const requestId = headerRequestId ?? problem?.requestId;
    const message = problem?.detail || problem?.title || `Request failed with status ${response.status}`;

    addApiBreadcrumb({
      method,
      path: normalizedPath,
      status: response.status,
      durationMs: Date.now() - startedAt,
      requestId,
      ok: false,
    });

    if (response.status === 401 && !skipAuth && unauthorizedHandler) {
      unauthorizedHandler();
    }

    const apiError = new ApiError(response.status, message, problem, requestId);
    captureApiError(apiError, {
      method,
      path: normalizedPath,
      status: response.status,
      requestId,
      stage: 'api',
    });
    throw apiError;
  }

  addApiBreadcrumb({
    method,
    path: normalizedPath,
    status: response.status,
    durationMs: Date.now() - startedAt,
    requestId: headerRequestId,
    ok: true,
  });

  return parsed as T;
}

/**
 * Direct binary PUT upload to a Cloudflare R2 / S3 / RustFS Presigned URL.
 * Uses native Expo FileSystem UploadTask on iOS/Android to stream the exact file bytes
 * without relying on React Native's fetch("file://..."), and standard fetch on Web.
 * Zero binary bytes pass through the BenchOS Java backend.
 */
export async function uploadFileToPresignedUrl(
  uploadUrl: string,
  fileUri: string,
  contentType: string
): Promise<void> {
  const startedAt = Date.now();

  try {
    if (Platform.OS !== 'web') {
      const file = new File(fileUri);
      const task = new UploadTask(file, uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
        headers: {
          'Content-Type': contentType,
        },
        mimeType: contentType,
      });

      const result = await task.uploadAsync();
      if (result.status < 200 || result.status >= 300) {
        throw new ApiError(
          result.status,
          result.body
            ? `Failed to upload image (${result.status}): ${result.body.slice(0, 120)}`
            : `Failed to upload image to object storage (${result.status})`
        );
      }
      addApiBreadcrumb({
        method: 'PUT',
        path: 'object-storage/presigned-upload',
        status: result.status,
        durationMs: Date.now() - startedAt,
        ok: true,
      });
      return;
    }

    const fileResponse = await fetch(fileUri);
    if (!fileResponse.ok) {
      throw new ApiError(fileResponse.status, 'Failed to read local image before upload');
    }
    const blob = await fileResponse.blob();

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: blob,
    });

    if (!uploadResponse.ok) {
      const details = await uploadResponse.text().catch(() => '');
      throw new ApiError(
        uploadResponse.status,
        details
          ? `Failed to upload image (${uploadResponse.status}): ${details.slice(0, 120)}`
          : `Failed to upload image to object storage (${uploadResponse.status})`
      );
    }

    addApiBreadcrumb({
      method: 'PUT',
      path: 'object-storage/presigned-upload',
      status: uploadResponse.status,
      durationMs: Date.now() - startedAt,
      ok: true,
    });
  } catch (uploadError) {
    const status = uploadError instanceof ApiError ? uploadError.status : undefined;
    addApiBreadcrumb({
      method: 'PUT',
      path: 'object-storage/presigned-upload',
      status,
      durationMs: Date.now() - startedAt,
      ok: false,
    });
    captureApiError(uploadError, {
      method: 'PUT',
      path: 'object-storage/presigned-upload',
      status,
      stage: 'storage_upload',
    });
    throw uploadError;
  }
}
