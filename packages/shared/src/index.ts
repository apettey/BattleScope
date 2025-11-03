export const projectName = 'BattleScope';

export const assertEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;
  if (!value) {
    throw new Error(`Missing required environment variable "${key}"`);
  }
  return value;
};
