/**
 * Search Types
 *
 * Type definitions for the Typesense-powered search functionality
 */

// ============================================================================
// Entity Search Types
// ============================================================================

export type EntityType = 'alliance' | 'corporation' | 'character';

export interface EntitySearchResult {
  id: string;
  type: EntityType;
  name: string;
  ticker: string | null;
  allianceId?: string;
  allianceName?: string;
  corpId?: string;
  corpName?: string;
  battleCount: number;
  lastSeenAt: string; // ISO 8601
}

export interface EntityAutocompleteRequest {
  q: string;
  type?: EntityType[];
  limit?: number;
}

export interface EntityAutocompleteResponse {
  alliances: EntitySearchResult[];
  corporations: EntitySearchResult[];
  characters: EntitySearchResult[];
  processingTimeMs: number;
  query: string;
}

// ============================================================================
// System Search Types
// ============================================================================

export type SpaceType = 'kspace' | 'jspace' | 'pochven';
export type SecurityLevel = 'highsec' | 'lowsec' | 'nullsec';

export interface SystemSearchResult {
  id: string;
  name: string;
  regionId: string;
  regionName: string;
  constellationId: string;
  constellationName: string;
  spaceType: SpaceType;
  securityLevel: SecurityLevel | null;
  securityStatus: number; // -1.0 to 1.0
  battleCount: number;
  lastBattleAt: string | null; // ISO 8601
}

export interface SystemAutocompleteRequest {
  q: string;
  spaceType?: SpaceType[];
  limit?: number;
}

export interface SystemAutocompleteResponse {
  systems: SystemSearchResult[];
  processingTimeMs: number;
  query: string;
}

// ============================================================================
// Battle Search Types
// ============================================================================

export interface BattleSearchResult {
  id: string;
  systemId: string;
  systemName: string;
  regionName: string;
  spaceType: SpaceType;
  securityLevel: SecurityLevel | null;
  startTime: string; // ISO 8601
  endTime: string; // ISO 8601
  duration: number; // seconds
  totalKills: number;
  totalParticipants: number;
  totalIskDestroyed: number;
  allianceNames: string[];
  _matchedTerms?: string[];
  _relevanceScore?: number;
}

export interface BattleSearchFilters {
  spaceType?: SpaceType[];
  securityLevel?: SecurityLevel[];
  startTime?: {
    after?: string; // ISO 8601
    before?: string; // ISO 8601
  };
  totalKills?: {
    min?: number;
    max?: number;
  };
  totalIskDestroyed?: {
    min?: number;
    max?: number;
  };
  totalParticipants?: {
    min?: number;
    max?: number;
  };
  duration?: {
    min?: number; // seconds
    max?: number;
  };
  allianceIds?: string[];
  corpIds?: string[];
  systemIds?: string[];
}

export interface BattleSearchRequest {
  query?: string;
  filters?: BattleSearchFilters;
  sort?: {
    by: 'startTime' | 'totalKills' | 'totalIskDestroyed' | 'totalParticipants' | 'duration';
    order: 'asc' | 'desc';
  };
  page?: {
    limit: number;
    offset: number;
  };
}

export interface BattleSearchResponse {
  hits: BattleSearchResult[];
  estimatedTotalHits: number;
  limit: number;
  offset: number;
  processingTimeMs: number;
  query?: string;
  facets?: {
    spaceType?: Record<string, number>;
    securityLevel?: Record<string, number>;
  };
}

// ============================================================================
// Global Search Types
// ============================================================================

export interface GlobalSearchResponse {
  battles: BattleSearchResult[];
  entities: {
    alliances: EntitySearchResult[];
    corporations: EntitySearchResult[];
    characters: EntitySearchResult[];
  };
  systems: SystemSearchResult[];
  processingTimeMs: number;
  query: string;
  totalResults: {
    battles: number;
    entities: number;
    systems: number;
  };
}

// ============================================================================
// Typesense Collection Schemas
// ============================================================================

export interface BattleDocument {
  id: string;
  systemId: string;
  systemName: string;
  regionName: string;
  spaceType: string;
  securityLevel: string | null;
  startTime: number; // Unix timestamp
  endTime: number;
  duration: number;
  totalKills: number;
  totalParticipants: number;
  totalIskDestroyed: number;
  allianceNames: string[];
  battleScore: number; // For ranking
}

export interface EntityDocument {
  id: string;
  type: string;
  name: string;
  ticker: string | null;
  allianceId: string | null;
  allianceName: string | null;
  corpId: string | null;
  corpName: string | null;
  battleCount: number;
  lastSeenAt: number; // Unix timestamp
  activityScore: number; // For ranking
}

export interface SystemDocument {
  id: string;
  name: string;
  regionId: string;
  regionName: string;
  constellationId: string;
  constellationName: string;
  spaceType: string;
  securityLevel: string | null;
  securityStatus: number;
  battleCount: number;
  lastBattleAt: number | null; // Unix timestamp
  activityScore: number; // For ranking
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface TypesenseConfig {
  nodes: Array<{
    host: string;
    port: number;
    protocol: 'http' | 'https';
  }>;
  apiKey: string;
  connectionTimeoutSeconds?: number;
  numRetries?: number;
  retryIntervalSeconds?: number;
  healthcheckIntervalSeconds?: number;
}

// ============================================================================
// Health Check Types
// ============================================================================

export interface SearchHealthStatus {
  healthy: boolean;
  latencyMs: number;
  collections: {
    battles: boolean;
    entities: boolean;
    systems: boolean;
  };
  error?: string;
}

// Typesense API types
export interface TypesenseSearchParams {
  q: string;
  query_by: string;
  filter_by?: string;
  sort_by?: string;
  facet_by?: string;
  per_page?: number;
  page?: number;
  num_typos?: number;
  prefix?: boolean;
}

export interface TypesenseSearchHit<T> {
  document: T;
  text_match?: number;
  highlights?: unknown[];
}

export interface TypesenseFacetCount {
  value: string;
  count: number;
}

export interface TypesenseFacet {
  field_name: string;
  counts: TypesenseFacetCount[];
}

export interface TypesenseSearchResponse<T> {
  hits?: TypesenseSearchHit<T>[];
  found?: number;
  facet_counts?: TypesenseFacet[];
}

export interface TypesenseImportResponse {
  success: boolean;
  error?: string;
}

export interface TypesenseDeleteResponse {
  num_deleted?: number;
}
