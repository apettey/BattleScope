import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Encryption service for ESI tokens using AES-256-GCM
 *
 * Tokens are encrypted at rest in the database for security.
 * Uses a key derived from the environment variable ENCRYPTION_KEY.
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(encryptionKey: string) {
    if (!encryptionKey || encryptionKey.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters');
    }

    // Derive a 32-byte key from the encryption key
    this.key = scryptSync(encryptionKey, 'battlescope-salt', 32);
  }

  /**
   * Encrypt a plaintext string
   *
   * @param plaintext - The string to encrypt
   * @returns Base64-encoded encrypted data in format: iv:authTag:ciphertext
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all base64)
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
  }

  /**
   * Decrypt an encrypted string
   *
   * @param encrypted - The encrypted string in format: iv:authTag:ciphertext
   * @returns Decrypted plaintext
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format');
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * Encrypt data to Buffer (for database storage as bytea)
   *
   * @param plaintext - The string to encrypt
   * @returns Buffer containing encrypted data
   */
  encryptToBuffer(plaintext: string): Buffer {
    const encrypted = this.encrypt(plaintext);
    return Buffer.from(encrypted, 'utf8');
  }

  /**
   * Decrypt data from Buffer (from database bytea)
   *
   * @param buffer - The encrypted buffer
   * @returns Decrypted plaintext
   */
  decryptFromBuffer(buffer: Buffer): string {
    const encrypted = buffer.toString('utf8');
    return this.decrypt(encrypted);
  }
}

/**
 * Create an encryption service instance
 *
 * @param encryptionKey - The encryption key from environment
 * @returns EncryptionService instance
 */
export function createEncryptionService(encryptionKey: string): EncryptionService {
  return new EncryptionService(encryptionKey);
}
