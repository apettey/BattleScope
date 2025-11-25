import Redis from 'ioredis';
import crypto from 'crypto';

export interface SessionData {
  accountId: string;
  characterId: string;
  createdAt: Date;
}

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: 3,
    });
  }
  return redis;
}

export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(
  sessionId: string,
  data: SessionData
): Promise<void> {
  const redis = getRedis();
  const ttl = parseInt(process.env.SESSION_TTL_SECONDS || '28800', 10); // 8 hours default

  await redis.setex(
    `session:${sessionId}`,
    ttl,
    JSON.stringify({
      ...data,
      createdAt: data.createdAt.toISOString(),
    })
  );
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const redis = getRedis();
  const data = await redis.get(`session:${sessionId}`);

  if (!data) {
    return null;
  }

  const parsed = JSON.parse(data);
  return {
    ...parsed,
    createdAt: new Date(parsed.createdAt),
  };
}

export async function deleteSession(sessionId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`session:${sessionId}`);
}

export async function deleteAccountSessions(accountId: string): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys(`session:*`);

  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed.accountId === accountId) {
        await redis.del(key);
      }
    }
  }
}

export async function storeOAuthState(state: string, data?: any): Promise<void> {
  const redis = getRedis();
  // Store for 10 minutes (600 seconds)
  const value = data ? JSON.stringify(data) : '1';
  await redis.setex(`oauth_state:${state}`, 600, value);
}

export async function verifyAndDeleteOAuthState(state: string): Promise<boolean> {
  const redis = getRedis();
  const key = `oauth_state:${state}`;
  const exists = await redis.get(key);

  if (!exists) {
    return false;
  }

  // Delete the state (one-time use)
  await redis.del(key);
  return true;
}

export async function verifyAndGetOAuthState(state: string): Promise<any | null> {
  const redis = getRedis();
  const key = `oauth_state:${state}`;
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  // Delete the state (one-time use)
  await redis.del(key);

  // Parse JSON if it's not just '1'
  if (data === '1') {
    return {};
  }

  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
