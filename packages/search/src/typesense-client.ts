/**
 * Typesense Client Wrapper
 *
 * Provides a configured Typesense client with connection management,
 * health checks, and observability.
 */

import Typesense from 'typesense';
import { trace, metrics, type Counter, type Histogram } from '@opentelemetry/api';
import type { Logger } from 'pino';
import type { TypesenseConfig, SearchHealthStatus } from './types.js';

const tracer = trace.getTracer('battlescope.search.client');
const meter = metrics.getMeter('battlescope.search.client');

export class TypesenseClient {
  private client: Typesense.Client;
  private logger: Logger;
  private config: TypesenseConfig;

  // Metrics
  private requestCounter: Counter;
  private errorCounter: Counter;
  private latencyHistogram: Histogram;

  constructor(config: TypesenseConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'typesense-client' });

    this.client = new Typesense.Client({
      nodes: config.nodes,
      apiKey: config.apiKey,
      connectionTimeoutSeconds: config.connectionTimeoutSeconds ?? 5,
      numRetries: config.numRetries ?? 3,
      retryIntervalSeconds: config.retryIntervalSeconds ?? 1,
      healthcheckIntervalSeconds: config.healthcheckIntervalSeconds ?? 15,
    });

    // Initialize metrics
    this.requestCounter = meter.createCounter('search.requests.total', {
      description: 'Total number of search requests',
    });

    this.errorCounter = meter.createCounter('search.errors.total', {
      description: 'Total number of search errors',
    });

    this.latencyHistogram = meter.createHistogram('search.latency.milliseconds', {
      description: 'Search request latency in milliseconds',
    });

    this.logger.info(
      { nodes: config.nodes.map((n) => `${n.protocol}://${n.host}:${n.port}`) },
      'Typesense client initialized',
    );
  }

  /**
   * Get the underlying Typesense client for direct access
   */
  getClient(): Typesense.Client {
    return this.client;
  }

  /**
   * Execute a search operation with observability
   */
  async search<T extends Record<string, any>>(
    collection: string,
    searchParams: Record<string, any>,
    operation: string,
  ): Promise<any> {
    const startTime = Date.now();
    const span = tracer.startSpan(`search.${operation}`, {
      attributes: {
        'search.collection': collection,
        'search.query': searchParams.q ?? '*',
        'search.operation': operation,
      },
    });

    try {
      this.logger.debug({ collection, operation, query: searchParams.q }, 'Executing search');

      const result = await this.client.collections<T>(collection).documents().search(searchParams);

      const latency = Date.now() - startTime;

      // Record metrics
      this.requestCounter.add(1, {
        collection,
        operation,
        status: 'success',
      });

      this.latencyHistogram.record(latency, {
        collection,
        operation,
      });

      span.setAttributes({
        'search.hits': result.hits?.length ?? 0,
        'search.found': result.found ?? 0,
        'search.latency_ms': latency,
      });

      this.logger.debug(
        {
          collection,
          operation,
          hits: result.hits?.length ?? 0,
          found: result.found ?? 0,
          latencyMs: latency,
        },
        'Search completed successfully',
      );

      span.end();
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;

      this.errorCounter.add(1, {
        collection,
        operation,
        error: error instanceof Error ? error.message : 'unknown',
      });

      this.logger.error(
        {
          err: error,
          collection,
          operation,
          query: searchParams.q,
          latencyMs: latency,
        },
        'Search operation failed',
      );

      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Search failed',
      });
      span.end();

      throw error;
    }
  }

  /**
   * Index a single document with observability
   */
  async upsertDocument<T extends Record<string, any>>(collection: string, document: T): Promise<T> {
    const span = tracer.startSpan('search.upsert', {
      attributes: {
        'search.collection': collection,
      },
    });

    try {
      this.logger.debug({ collection }, 'Upserting document');

      const result = await this.client.collections<T>(collection).documents().upsert(document);

      this.requestCounter.add(1, {
        collection,
        operation: 'upsert',
        status: 'success',
      });

      span.end();
      return result;
    } catch (error) {
      this.errorCounter.add(1, {
        collection,
        operation: 'upsert',
        error: error instanceof Error ? error.message : 'unknown',
      });

      this.logger.error({ err: error, collection }, 'Failed to upsert document');

      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Upsert failed',
      });
      span.end();

      throw error;
    }
  }

  /**
   * Batch import documents with observability
   */
  async importDocuments<T extends Record<string, any>>(
    collection: string,
    documents: T[],
    options?: { action?: 'create' | 'update' | 'upsert' },
  ): Promise<any[]> {
    const span = tracer.startSpan('search.import', {
      attributes: {
        'search.collection': collection,
        'search.document_count': documents.length,
        'search.action': options?.action ?? 'upsert',
      },
    });

    try {
      this.logger.info(
        { collection, count: documents.length, action: options?.action },
        'Importing documents',
      );

      const result = await this.client
        .collections<T>(collection)
        .documents()
        .import(documents, options);

      // Count successes and failures
      const successes = result.filter((r: any) => r.success === true).length;
      const failures = result.length - successes;

      this.requestCounter.add(1, {
        collection,
        operation: 'import',
        status: 'success',
      });

      span.setAttributes({
        'search.imported': successes,
        'search.failed': failures,
      });

      this.logger.info(
        {
          collection,
          total: documents.length,
          successes,
          failures,
        },
        'Document import completed',
      );

      span.end();
      return result;
    } catch (error) {
      this.errorCounter.add(1, {
        collection,
        operation: 'import',
        error: error instanceof Error ? error.message : 'unknown',
      });

      this.logger.error(
        { err: error, collection, count: documents.length },
        'Failed to import documents',
      );

      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Import failed',
      });
      span.end();

      throw error;
    }
  }

  /**
   * Delete a document by ID
   */
  async deleteDocument(collection: string, id: string): Promise<void> {
    const span = tracer.startSpan('search.delete', {
      attributes: {
        'search.collection': collection,
        'search.document_id': id,
      },
    });

    try {
      await this.client.collections(collection).documents(id).delete();

      this.requestCounter.add(1, {
        collection,
        operation: 'delete',
        status: 'success',
      });

      this.logger.debug({ collection, id }, 'Document deleted');
      span.end();
    } catch (error) {
      this.errorCounter.add(1, {
        collection,
        operation: 'delete',
        error: error instanceof Error ? error.message : 'unknown',
      });

      this.logger.error({ err: error, collection, id }, 'Failed to delete document');

      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Delete failed',
      });
      span.end();

      throw error;
    }
  }

  /**
   * Delete documents matching a filter
   */
  async deleteDocumentsByQuery(collection: string, filterBy: string): Promise<number> {
    const span = tracer.startSpan('search.delete_by_query', {
      attributes: {
        'search.collection': collection,
        'search.filter': filterBy,
      },
    });

    try {
      this.logger.info({ collection, filter: filterBy }, 'Deleting documents by query');

      const result = await this.client.collections(collection).documents().delete({
        filter_by: filterBy,
      });

      const deleted =
        typeof result === 'object' && 'num_deleted' in result ? result.num_deleted : 0;

      this.requestCounter.add(1, {
        collection,
        operation: 'delete_by_query',
        status: 'success',
      });

      span.setAttribute('search.deleted', deleted);
      this.logger.info({ collection, deleted }, 'Documents deleted by query');

      span.end();
      return deleted;
    } catch (error) {
      this.errorCounter.add(1, {
        collection,
        operation: 'delete_by_query',
        error: error instanceof Error ? error.message : 'unknown',
      });

      this.logger.error(
        { err: error, collection, filter: filterBy },
        'Failed to delete documents by query',
      );

      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Delete by query failed',
      });
      span.end();

      throw error;
    }
  }

  /**
   * Check health status of Typesense connection and collections
   */
  async checkHealth(): Promise<SearchHealthStatus> {
    const startTime = Date.now();
    const span = tracer.startSpan('search.health_check');

    try {
      // Check if we can reach Typesense
      await this.client.health.retrieve();

      // Check if required collections exist
      const collections = await this.client.collections().retrieve();
      const collectionNames = collections.map((c: any) => c.name);

      const status: SearchHealthStatus = {
        healthy: true,
        latencyMs: Date.now() - startTime,
        collections: {
          battles: collectionNames.includes('battles'),
          entities: collectionNames.includes('entities'),
          systems: collectionNames.includes('systems'),
        },
      };

      this.logger.debug(status, 'Health check successful');
      span.end();
      return status;
    } catch (error) {
      const status: SearchHealthStatus = {
        healthy: false,
        latencyMs: Date.now() - startTime,
        collections: {
          battles: false,
          entities: false,
          systems: false,
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      this.logger.error({ err: error }, 'Health check failed');

      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Health check failed',
      });
      span.end();

      return status;
    }
  }

  /**
   * Create a collection with schema
   */
  async createCollection(schema: any): Promise<void> {
    const span = tracer.startSpan('search.create_collection', {
      attributes: {
        'search.collection': schema.name,
      },
    });

    try {
      this.logger.info({ collection: schema.name }, 'Creating collection');
      await this.client.collections().create(schema);
      this.logger.info({ collection: schema.name }, 'Collection created successfully');
      span.end();
    } catch (error) {
      this.logger.error({ err: error, collection: schema.name }, 'Failed to create collection');
      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Create collection failed',
      });
      span.end();
      throw error;
    }
  }

  /**
   * Drop a collection
   */
  async dropCollection(name: string): Promise<void> {
    const span = tracer.startSpan('search.drop_collection', {
      attributes: {
        'search.collection': name,
      },
    });

    try {
      this.logger.info({ collection: name }, 'Dropping collection');
      await this.client.collections(name).delete();
      this.logger.info({ collection: name }, 'Collection dropped successfully');
      span.end();
    } catch (error) {
      this.logger.error({ err: error, collection: name }, 'Failed to drop collection');
      span.recordException(error as Error);
      span.setStatus({
        code: 2,
        message: error instanceof Error ? error.message : 'Drop collection failed',
      });
      span.end();
      throw error;
    }
  }
}

/**
 * Factory function to create a configured Typesense client
 */
export function createTypesenseClient(config: TypesenseConfig, logger: Logger): TypesenseClient {
  return new TypesenseClient(config, logger);
}
