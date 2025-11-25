import { describe, it, expect, beforeAll } from 'vitest';
import { encryptToken, decryptToken } from '../lib/crypto';

describe('Token Encryption', () => {
  beforeAll(() => {
    // Set encryption key for tests
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  it('should encrypt and decrypt a token correctly', () => {
    const originalToken = 'test_access_token_12345';

    const encrypted = encryptToken(originalToken);
    expect(encrypted).toBeInstanceOf(Buffer);
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(originalToken);
  });

  it('should produce different ciphertexts for the same input', () => {
    const token = 'same_token_12345';

    const encrypted1 = encryptToken(token);
    const encrypted2 = encryptToken(token);

    // Should be different due to random IV and salt
    expect(encrypted1).not.toEqual(encrypted2);

    // But both should decrypt to the same value
    expect(decryptToken(encrypted1)).toBe(token);
    expect(decryptToken(encrypted2)).toBe(token);
  });

  it('should handle long tokens', () => {
    const longToken = 'a'.repeat(1000);

    const encrypted = encryptToken(longToken);
    const decrypted = decryptToken(encrypted);

    expect(decrypted).toBe(longToken);
  });

  it('should handle tokens with special characters', () => {
    const specialToken = 'token!@#$%^&*()_+-=[]{}|;:,.<>?/~`';

    const encrypted = encryptToken(specialToken);
    const decrypted = decryptToken(encrypted);

    expect(decrypted).toBe(specialToken);
  });
});
