import type { ProblemDetail } from '@/types/api';

const DEFAULT_API_URL = 'http://localhost:8080';

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly problem?: ProblemDetail;

  constructor(status: number, message: string, problem?: ProblemDetail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
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

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth && accessTokenRef) {
    headers.Authorization = `Bearer ${accessTokenRef}`;
  }

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
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
    const message = problem?.detail || problem?.title || `Request failed with status ${response.status}`;

    if (response.status === 401 && !skipAuth && unauthorizedHandler) {
      unauthorizedHandler();
    }

    throw new ApiError(response.status, message, problem);
  }

  return parsed as T;
}

/**
 * Direct binary PUT upload to a Cloudflare R2 / S3 Presigned URL.
 * Zero binary bytes pass through the BenchOS Java backend.
 */
export async function uploadFileToPresignedUrl(
  uploadUrl: string,
  fileUri: string,
  contentType: string
): Promise<void> {
  const fileResponse = await fetch(fileUri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    throw new ApiError(uploadResponse.status, 'Failed to upload image to object storage');
  }
}
