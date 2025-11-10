import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TypesenseClient, createTypesenseClient } from '../src/typesense-client.js';
import type { TypesenseConfig } from '../src/types.js';
import pino from 'pino';

// Mock Typesense module
vi.mock('typesense', () => {
  return {
    default: {
      Client: vi.fn(),
    },
  };
});

describe('TypesenseClient', () => {
  let mockClient: any;
  let logger: pino.Logger;
  let config: TypesenseConfig;

  beforeEach(async () => {
    // Create a silent logger for tests
    logger = pino({ level: 'silent' });

    config = {
      nodes: [
        {
          host: 'localhost',
          port: 8108,
          protocol: 'http',
        },
      ],
      apiKey: 'test-key',
      connectionTimeoutSeconds: 5,
      numRetries: 3,
    };

    // Mock the Typesense client instance
    mockClient = {
      collections: vi.fn(),
      health: {
        retrieve: vi.fn(),
      },
    };

    // Make the Client constructor return our mock
    const TypesenseModule = await import('typesense');
    (TypesenseModule.default.Client as any).mockImplementation(() => mockClient);
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const client = new TypesenseClient(config, logger);
      expect(client).toBeDefined();
      expect(client.getClient()).toBe(mockClient);
    });

    it('should use default values for optional config', () => {
      const minimalConfig: TypesenseConfig = {
        nodes: [{ host: 'localhost', port: 8108, protocol: 'http' }],
        apiKey: 'test-key',
      };

      const client = new TypesenseClient(minimalConfig, logger);
      expect(client).toBeDefined();
    });
  });

  describe('search', () => {
    it('should execute search and return results', async () => {
      const mockSearchResults = {
        hits: [{ document: { id: '1', name: 'Test' } }, { document: { id: '2', name: 'Another' } }],
        found: 2,
      };

      const mockDocuments = {
        search: vi.fn().mockResolvedValue(mockSearchResults),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocuments),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);
      const searchParams = { q: 'test', query_by: 'name' };
      const result = await client.search('entities', searchParams, 'test_search');

      expect(result).toEqual(mockSearchResults);
      expect(mockClient.collections).toHaveBeenCalledWith('entities');
      expect(mockDocuments.search).toHaveBeenCalledWith(searchParams);
    });

    it('should handle search errors', async () => {
      const mockError = new Error('Search failed');

      const mockDocuments = {
        search: vi.fn().mockRejectedValue(mockError),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocuments),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);
      const searchParams = { q: 'test', query_by: 'name' };

      await expect(client.search('entities', searchParams, 'test_search')).rejects.toThrow(
        'Search failed',
      );
    });
  });

  describe('upsertDocument', () => {
    it('should upsert document successfully', async () => {
      const mockDocument = { id: '1', name: 'Test' };

      const mockDocuments = {
        upsert: vi.fn().mockResolvedValue(mockDocument),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocuments),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);
      const result = await client.upsertDocument('entities', mockDocument);

      expect(result).toEqual(mockDocument);
      expect(mockClient.collections).toHaveBeenCalledWith('entities');
      expect(mockDocuments.upsert).toHaveBeenCalledWith(mockDocument);
    });

    it('should handle upsert errors', async () => {
      const mockError = new Error('Upsert failed');
      const mockDocument = { id: '1', name: 'Test' };

      const mockDocuments = {
        upsert: vi.fn().mockRejectedValue(mockError),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocuments),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);

      await expect(client.upsertDocument('entities', mockDocument)).rejects.toThrow(
        'Upsert failed',
      );
    });
  });

  describe('importDocuments', () => {
    it('should import documents successfully', async () => {
      const mockDocuments = [
        { id: '1', name: 'Test 1' },
        { id: '2', name: 'Test 2' },
      ];

      const mockImportResults = [{ success: true }, { success: true }];

      const mockDocsApi = {
        import: vi.fn().mockResolvedValue(mockImportResults),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocsApi),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);
      const result = await client.importDocuments('entities', mockDocuments, { action: 'upsert' });

      expect(result).toEqual(mockImportResults);
      expect(mockDocsApi.import).toHaveBeenCalledWith(mockDocuments, { action: 'upsert' });
    });

    it('should handle partial import failures', async () => {
      const mockDocuments = [
        { id: '1', name: 'Test 1' },
        { id: '2', name: 'Test 2' },
      ];

      const mockImportResults = [{ success: true }, { success: false, error: 'Validation failed' }];

      const mockDocsApi = {
        import: vi.fn().mockResolvedValue(mockImportResults),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocsApi),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);
      const result = await client.importDocuments('entities', mockDocuments);

      expect(result).toEqual(mockImportResults);
      // Should still succeed even with partial failures
      expect(result.filter((r: any) => r.success).length).toBe(1);
    });

    it('should handle import errors', async () => {
      const mockError = new Error('Import failed');
      const mockDocuments = [{ id: '1', name: 'Test' }];

      const mockDocsApi = {
        import: vi.fn().mockRejectedValue(mockError),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocsApi),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);

      await expect(client.importDocuments('entities', mockDocuments)).rejects.toThrow(
        'Import failed',
      );
    });
  });

  describe('deleteDocument', () => {
    it('should delete document successfully', async () => {
      const mockDocumentApi = {
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocumentApi),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);
      await client.deleteDocument('entities', '123');

      expect(mockClient.collections).toHaveBeenCalledWith('entities');
      expect(mockCollection.documents).toHaveBeenCalledWith('123');
      expect(mockDocumentApi.delete).toHaveBeenCalled();
    });

    it('should handle delete errors', async () => {
      const mockError = new Error('Delete failed');

      const mockDocumentApi = {
        delete: vi.fn().mockRejectedValue(mockError),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocumentApi),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);

      await expect(client.deleteDocument('entities', '123')).rejects.toThrow('Delete failed');
    });
  });

  describe('deleteDocumentsByQuery', () => {
    it('should delete documents by query successfully', async () => {
      const mockDeleteResult = { num_deleted: 5 };

      const mockDocuments = {
        delete: vi.fn().mockResolvedValue(mockDeleteResult),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocuments),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);
      const deleted = await client.deleteDocumentsByQuery('entities', 'battleCount:=0');

      expect(deleted).toBe(5);
      expect(mockDocuments.delete).toHaveBeenCalledWith({ filter_by: 'battleCount:=0' });
    });

    it('should handle query delete errors', async () => {
      const mockError = new Error('Query delete failed');

      const mockDocuments = {
        delete: vi.fn().mockRejectedValue(mockError),
      };

      const mockCollection = {
        documents: vi.fn().mockReturnValue(mockDocuments),
      };

      mockClient.collections.mockReturnValue(mockCollection);

      const client = new TypesenseClient(config, logger);

      await expect(client.deleteDocumentsByQuery('entities', 'invalid:filter')).rejects.toThrow(
        'Query delete failed',
      );
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status when all checks pass', async () => {
      mockClient.health.retrieve.mockResolvedValue({ ok: true });

      const mockCollections = [{ name: 'battles' }, { name: 'entities' }, { name: 'systems' }];

      mockClient.collections.mockReturnValue({
        retrieve: vi.fn().mockResolvedValue(mockCollections),
      });

      const client = new TypesenseClient(config, logger);
      const health = await client.checkHealth();

      expect(health.healthy).toBe(true);
      expect(health.collections.battles).toBe(true);
      expect(health.collections.entities).toBe(true);
      expect(health.collections.systems).toBe(true);
      expect(health.latencyMs).toBeGreaterThanOrEqual(0);
      expect(health.error).toBeUndefined();
    });

    it('should return unhealthy status when connection fails', async () => {
      const mockError = new Error('Connection refused');
      mockClient.health.retrieve.mockRejectedValue(mockError);

      const client = new TypesenseClient(config, logger);
      const health = await client.checkHealth();

      expect(health.healthy).toBe(false);
      expect(health.collections.battles).toBe(false);
      expect(health.collections.entities).toBe(false);
      expect(health.collections.systems).toBe(false);
      expect(health.error).toBe('Connection refused');
    });

    it('should detect missing collections', async () => {
      mockClient.health.retrieve.mockResolvedValue({ ok: true });

      const mockCollections = [
        { name: 'battles' },
        // Missing 'entities' and 'systems'
      ];

      mockClient.collections.mockReturnValue({
        retrieve: vi.fn().mockResolvedValue(mockCollections),
      });

      const client = new TypesenseClient(config, logger);
      const health = await client.checkHealth();

      expect(health.healthy).toBe(true); // Connection is healthy
      expect(health.collections.battles).toBe(true);
      expect(health.collections.entities).toBe(false);
      expect(health.collections.systems).toBe(false);
    });
  });

  describe('createCollection', () => {
    it('should create collection successfully', async () => {
      const mockSchema = {
        name: 'test_collection',
        fields: [{ name: 'id', type: 'string' }],
      };

      mockClient.collections.mockReturnValue({
        create: vi.fn().mockResolvedValue(mockSchema),
      });

      const client = new TypesenseClient(config, logger);
      await client.createCollection(mockSchema);

      expect(mockClient.collections().create).toHaveBeenCalledWith(mockSchema);
    });

    it('should handle create collection errors', async () => {
      const mockError = new Error('Collection already exists');
      const mockSchema = { name: 'test_collection', fields: [] };

      mockClient.collections.mockReturnValue({
        create: vi.fn().mockRejectedValue(mockError),
      });

      const client = new TypesenseClient(config, logger);

      await expect(client.createCollection(mockSchema)).rejects.toThrow(
        'Collection already exists',
      );
    });
  });

  describe('dropCollection', () => {
    it('should drop collection successfully', async () => {
      const mockCollectionApi = {
        delete: vi.fn().mockResolvedValue({ name: 'test_collection' }),
      };

      mockClient.collections.mockReturnValue(mockCollectionApi);

      const client = new TypesenseClient(config, logger);
      await client.dropCollection('test_collection');

      expect(mockClient.collections).toHaveBeenCalledWith('test_collection');
      expect(mockCollectionApi.delete).toHaveBeenCalled();
    });

    it('should handle drop collection errors', async () => {
      const mockError = new Error('Collection not found');

      const mockCollectionApi = {
        delete: vi.fn().mockRejectedValue(mockError),
      };

      mockClient.collections.mockReturnValue(mockCollectionApi);

      const client = new TypesenseClient(config, logger);

      await expect(client.dropCollection('nonexistent')).rejects.toThrow('Collection not found');
    });
  });

  describe('createTypesenseClient factory', () => {
    it('should create a TypesenseClient instance', () => {
      const client = createTypesenseClient(config, logger);
      expect(client).toBeInstanceOf(TypesenseClient);
      expect(client.getClient()).toBe(mockClient);
    });
  });
});
