export type FetchFn = typeof fetch;

export const defaultFetch: FetchFn = (...args) => fetch(...args);

export const resolveBaseUrl = (override?: string): string => {
  if (override) {
    return override.replace(/\/$/, '');
  }
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

export const fetchJson = async <TData = unknown>(
  input: string,
  init: RequestInit | undefined,
  fetchFn: FetchFn = defaultFetch,
): Promise<TData> => {
  const response = await fetchFn(input, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Request failed (${response.status}): ${body || response.statusText}`);
  }
  return (await response.json()) as TData;
};
