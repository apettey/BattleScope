import { describe, expect, it, beforeEach } from 'vitest';
import {
  EncryptionService,
  createEncryptionService,
} from '../../src/services/encryption-service.js';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const validKey = 'this-is-a-very-secure-encryption-key-32-chars';

  beforeEach(() => {
    service = new EncryptionService(validKey);
  });

  describe('constructor', () => {
    it('should create service with valid encryption key', () => {
      // Act & Assert
      expect(() => new EncryptionService(validKey)).not.toThrow();
    });

    it('should throw error if encryption key is too short', () => {
      // Arrange
      const shortKey = 'short';

      // Act & Assert
      expect(() => new EncryptionService(shortKey)).toThrow(
        'ENCRYPTION_KEY must be at least 32 characters',
      );
    });

    it('should throw error if encryption key is empty', () => {
      // Act & Assert
      expect(() => new EncryptionService('')).toThrow(
        'ENCRYPTION_KEY must be at least 32 characters',
      );
    });

    it('should throw error if encryption key is exactly 31 characters', () => {
      // Arrange
      const key31 = 'a'.repeat(31);

      // Act & Assert
      expect(() => new EncryptionService(key31)).toThrow(
        'ENCRYPTION_KEY must be at least 32 characters',
      );
    });

    it('should accept encryption key with exactly 32 characters', () => {
      // Arrange
      const key32 = 'a'.repeat(32);

      // Act & Assert
      expect(() => new EncryptionService(key32)).not.toThrow();
    });
  });

  describe('encrypt', () => {
    it('should encrypt plaintext string', () => {
      // Arrange
      const plaintext = 'my-secret-token';

      // Act
      const encrypted = service.encrypt(plaintext);

      // Assert
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
      expect(typeof encrypted).toBe('string');
    });

    it('should return encrypted string in format iv:authTag:ciphertext', () => {
      // Arrange
      const plaintext = 'test-data';

      // Act
      const encrypted = service.encrypt(plaintext);

      // Assert
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBeTruthy(); // IV
      expect(parts[1]).toBeTruthy(); // Auth tag
      expect(parts[2]).toBeTruthy(); // Ciphertext
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      // Arrange
      const plaintext = 'same-plaintext';

      // Act
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      // Assert
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should encrypt empty string', () => {
      // Arrange
      const plaintext = '';

      // Act
      const encrypted = service.encrypt(plaintext);

      // Assert
      expect(encrypted).toBeTruthy();
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
    });

    it('should encrypt unicode characters', () => {
      // Arrange
      const plaintext = '你好世界 🚀 émojis';

      // Act
      const encrypted = service.encrypt(plaintext);

      // Assert
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should encrypt long strings', () => {
      // Arrange
      const plaintext = 'a'.repeat(10000);

      // Act
      const encrypted = service.encrypt(plaintext);

      // Assert
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should encrypt special characters', () => {
      // Arrange
      const plaintext = '!@#$%^&*()_+-={}[]|\\:";\'<>?,./';

      // Act
      const encrypted = service.encrypt(plaintext);

      // Assert
      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted string back to original plaintext', () => {
      // Arrange
      const plaintext = 'my-secret-token';
      const encrypted = service.encrypt(plaintext);

      // Act
      const decrypted = service.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt empty string', () => {
      // Arrange
      const plaintext = '';
      const encrypted = service.encrypt(plaintext);

      // Act
      const decrypted = service.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt unicode characters', () => {
      // Arrange
      const plaintext = '你好世界 🚀 émojis';
      const encrypted = service.encrypt(plaintext);

      // Act
      const decrypted = service.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt long strings', () => {
      // Arrange
      const plaintext = 'a'.repeat(10000);
      const encrypted = service.encrypt(plaintext);

      // Act
      const decrypted = service.decrypt(encrypted);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for invalid encrypted format (missing parts)', () => {
      // Arrange
      const invalidEncrypted = 'invalid:format';

      // Act & Assert
      expect(() => service.decrypt(invalidEncrypted)).toThrow('Invalid encrypted data format');
    });

    it('should throw error for invalid encrypted format (too many parts)', () => {
      // Arrange
      const invalidEncrypted = 'part1:part2:part3:part4';

      // Act & Assert
      expect(() => service.decrypt(invalidEncrypted)).toThrow('Invalid encrypted data format');
    });

    it('should throw error for invalid encrypted format (no colons)', () => {
      // Arrange
      const invalidEncrypted = 'invalidencrypteddata';

      // Act & Assert
      expect(() => service.decrypt(invalidEncrypted)).toThrow('Invalid encrypted data format');
    });

    it('should throw error for corrupted ciphertext', () => {
      // Arrange
      const plaintext = 'test-data';
      const encrypted = service.encrypt(plaintext);
      const parts = encrypted.split(':');
      const corrupted = `${parts[0]}:${parts[1]}:corrupted`;

      // Act & Assert
      expect(() => service.decrypt(corrupted)).toThrow();
    });

    it('should throw error for corrupted auth tag', () => {
      // Arrange
      const plaintext = 'test-data';
      const encrypted = service.encrypt(plaintext);
      const parts = encrypted.split(':');
      const corrupted = `${parts[0]}:corrupted:${parts[2]}`;

      // Act & Assert
      expect(() => service.decrypt(corrupted)).toThrow();
    });

    it('should not decrypt with different encryption service instance', () => {
      // Arrange
      const plaintext = 'test-data';
      const encrypted = service.encrypt(plaintext);
      const differentService = new EncryptionService('different-key-that-is-32-chars-long');

      // Act & Assert
      expect(() => differentService.decrypt(encrypted)).toThrow();
    });
  });

  describe('encryptToBuffer', () => {
    it('should encrypt plaintext and return Buffer', () => {
      // Arrange
      const plaintext = 'my-secret-token';

      // Act
      const buffer = service.encryptToBuffer(plaintext);

      // Assert
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should create buffer that can be converted to string', () => {
      // Arrange
      const plaintext = 'test-data';

      // Act
      const buffer = service.encryptToBuffer(plaintext);
      const asString = buffer.toString('utf8');

      // Assert
      const parts = asString.split(':');
      expect(parts).toHaveLength(3);
    });

    it('should encrypt empty string to buffer', () => {
      // Arrange
      const plaintext = '';

      // Act
      const buffer = service.encryptToBuffer(plaintext);

      // Assert
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should encrypt unicode to buffer', () => {
      // Arrange
      const plaintext = '你好世界 🚀';

      // Act
      const buffer = service.encryptToBuffer(plaintext);

      // Assert
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });

  describe('decryptFromBuffer', () => {
    it('should decrypt buffer back to original plaintext', () => {
      // Arrange
      const plaintext = 'my-secret-token';
      const buffer = service.encryptToBuffer(plaintext);

      // Act
      const decrypted = service.decryptFromBuffer(buffer);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt empty string from buffer', () => {
      // Arrange
      const plaintext = '';
      const buffer = service.encryptToBuffer(plaintext);

      // Act
      const decrypted = service.decryptFromBuffer(buffer);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt unicode from buffer', () => {
      // Arrange
      const plaintext = '你好世界 🚀 émojis';
      const buffer = service.encryptToBuffer(plaintext);

      // Act
      const decrypted = service.decryptFromBuffer(buffer);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should decrypt long string from buffer', () => {
      // Arrange
      const plaintext = 'a'.repeat(10000);
      const buffer = service.encryptToBuffer(plaintext);

      // Act
      const decrypted = service.decryptFromBuffer(buffer);

      // Assert
      expect(decrypted).toBe(plaintext);
    });

    it('should throw error for invalid buffer format', () => {
      // Arrange
      const invalidBuffer = Buffer.from('invalid:format');

      // Act & Assert
      expect(() => service.decryptFromBuffer(invalidBuffer)).toThrow();
    });
  });

  describe('round-trip testing', () => {
    it('should maintain data integrity through encrypt/decrypt cycle', () => {
      // Arrange
      const testCases = [
        'simple-token',
        'access_token_with_underscores',
        'token-with-dashes',
        'TokenWithCamelCase',
        '{"json":"data","nested":{"value":123}}',
        'multiline\nstring\nwith\nnewlines',
        'tab\tseparated\tvalues',
        '',
        'a'.repeat(1000),
      ];

      // Act & Assert
      for (const plaintext of testCases) {
        const encrypted = service.encrypt(plaintext);
        const decrypted = service.decrypt(encrypted);
        expect(decrypted).toBe(plaintext);
      }
    });

    it('should maintain data integrity through buffer cycle', () => {
      // Arrange
      const testCases = ['simple-token', 'unicode-data: 你好世界 🚀', '{"json":"data"}', ''];

      // Act & Assert
      for (const plaintext of testCases) {
        const buffer = service.encryptToBuffer(plaintext);
        const decrypted = service.decryptFromBuffer(buffer);
        expect(decrypted).toBe(plaintext);
      }
    });

    it('should be compatible between string and buffer methods', () => {
      // Arrange
      const plaintext = 'test-compatibility';

      // Act
      const encryptedString = service.encrypt(plaintext);
      const buffer = Buffer.from(encryptedString, 'utf8');
      const decrypted = service.decryptFromBuffer(buffer);

      // Assert
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('security properties', () => {
    it('should use authenticated encryption (detect tampering)', () => {
      // Arrange
      const plaintext = 'secure-data';
      const encrypted = service.encrypt(plaintext);
      const parts = encrypted.split(':');

      // Tamper with ciphertext
      const tamperedParts = [...parts];
      tamperedParts[2] = Buffer.from(parts[2], 'base64').toString('base64').replace(/.$/, 'X');
      const tampered = tamperedParts.join(':');

      // Act & Assert - should throw due to auth tag mismatch
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should produce different IV for each encryption', () => {
      // Arrange
      const plaintext = 'test-data';
      const iterations = 100;
      const ivs = new Set<string>();

      // Act
      for (let i = 0; i < iterations; i++) {
        const encrypted = service.encrypt(plaintext);
        const iv = encrypted.split(':')[0];
        ivs.add(iv);
      }

      // Assert - all IVs should be unique
      expect(ivs.size).toBe(iterations);
    });

    it('should use consistent key derivation', () => {
      // Arrange
      const plaintext = 'test-data';
      const service1 = new EncryptionService(validKey);
      const service2 = new EncryptionService(validKey);

      // Act
      const encrypted = service1.encrypt(plaintext);
      const decrypted = service2.decrypt(encrypted);

      // Assert - same key should decrypt
      expect(decrypted).toBe(plaintext);
    });
  });
});

describe('createEncryptionService', () => {
  it('should create EncryptionService instance', () => {
    // Arrange
    const key = 'valid-encryption-key-32-characters';

    // Act
    const service = createEncryptionService(key);

    // Assert
    expect(service).toBeInstanceOf(EncryptionService);
  });

  it('should create functional service', () => {
    // Arrange
    const key = 'valid-encryption-key-32-characters';
    const service = createEncryptionService(key);
    const plaintext = 'test-data';

    // Act
    const encrypted = service.encrypt(plaintext);
    const decrypted = service.decrypt(encrypted);

    // Assert
    expect(decrypted).toBe(plaintext);
  });

  it('should throw error for invalid key', () => {
    // Arrange
    const shortKey = 'short';

    // Act & Assert
    expect(() => createEncryptionService(shortKey)).toThrow(
      'ENCRYPTION_KEY must be at least 32 characters',
    );
  });
});
