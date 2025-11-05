interface RuntimeConfig {
  API_BASE_URL: string;
}

interface Window {
  __RUNTIME_CONFIG__?: RuntimeConfig;
}
