export type FetchFn = typeof fetch;

export const defaultFetch: FetchFn = (...args) => fetch(...args);

export const resolveBaseUrl = (override?: string): string => {
  if (override) {
    return override.replace(/\/$/, '');
  }
  // Try runtime config first (for production deployments)
  const fromRuntime = window.__RUNTIME_CONFIG__?.API_BASE_URL;
  if (fromRuntime) {
    return fromRuntime.replace(/\/$/, '');
  }
  // Fall back to build-time env var (for development)
  const fromEnv = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (fromEnv ?? 'http://localhost:3000').replace(/\/$/, '');
};

export const buildUrl = (
  path: string,
  params: Record<string, string | readonly string[] | null | undefined>,
  baseUrl?: string,
): string => {
  const url = new URL(path, `${resolveBaseUrl(baseUrl)}/`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry !== undefined && entry !== null && entry !== '') {
          url.searchParams.append(key, entry);
        }
      });
      return;
    }

    if (typeof value === 'string' && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const fetchJson = async <TData = unknown>(
  input: string,
  init: RequestInit | undefined,
  fetchFn: FetchFn = defaultFetch,
): Promise<TData> => {
  // Always include credentials (cookies) with requests
  const requestInit: RequestInit = {
    ...init,
    credentials: 'include',
  };
  const response = await fetchFn(input, requestInit);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ApiError(
      response.status,
      `Request failed (${response.status}): ${body || response.statusText}`,
    );
  }
  return (await response.json()) as TData;
};
