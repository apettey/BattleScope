import { CollectionCreateSchema } from 'typesense/lib/Typesense/Collections';

// Battles collection schema
export const BattlesCollectionSchema: CollectionCreateSchema = {
  name: 'battles',
  fields: [
    { name: 'id', type: 'string' },
    { name: 'system_name', type: 'string', facet: true },
    { name: 'region_name', type: 'string', facet: true },
    { name: 'security_type', type: 'string', facet: true },
    { name: 'start_time', type: 'int64', sort: true },
    { name: 'end_time', type: 'int64', sort: true, optional: true },
    { name: 'total_kills', type: 'int32', sort: true },
    { name: 'total_isk_destroyed', type: 'int64', sort: true },
    { name: 'alliance_names', type: 'string[]', facet: true },
    { name: 'participant_names', type: 'string[]' },
  ],
  default_sorting_field: 'start_time',
};

// Killmails collection schema
export const KillmailsCollectionSchema: CollectionCreateSchema = {
  name: 'killmails',
  fields: [
    { name: 'killmail_id', type: 'string' },
    { name: 'victim_name', type: 'string' },
    { name: 'victim_alliance', type: 'string', facet: true, optional: true },
    { name: 'ship_type_name', type: 'string', facet: true },
    { name: 'ship_group', type: 'string', facet: true },
    { name: 'system_name', type: 'string', facet: true },
    { name: 'region_name', type: 'string', facet: true },
    { name: 'occurred_at', type: 'int64', sort: true },
    { name: 'isk_value', type: 'int64', sort: true },
  ],
  default_sorting_field: 'occurred_at',
};

// Characters collection schema (for autocomplete)
export const CharactersCollectionSchema: CollectionCreateSchema = {
  name: 'characters',
  fields: [
    { name: 'character_id', type: 'string' },
    { name: 'character_name', type: 'string' },
    { name: 'corp_name', type: 'string' },
    { name: 'alliance_name', type: 'string', optional: true },
  ],
};

// Corporations collection schema
export const CorporationsCollectionSchema: CollectionCreateSchema = {
  name: 'corporations',
  fields: [
    { name: 'corp_id', type: 'string' },
    { name: 'corp_name', type: 'string' },
    { name: 'alliance_name', type: 'string', optional: true },
    { name: 'member_count', type: 'int32', optional: true },
  ],
};

// Systems collection schema
export const SystemsCollectionSchema: CollectionCreateSchema = {
  name: 'systems',
  fields: [
    { name: 'system_id', type: 'string' },
    { name: 'system_name', type: 'string' },
    { name: 'region_name', type: 'string' },
    { name: 'security_status', type: 'float' },
  ],
};

// Export all schemas
export const ALL_SCHEMAS = [
  BattlesCollectionSchema,
  KillmailsCollectionSchema,
  CharactersCollectionSchema,
  CorporationsCollectionSchema,
  SystemsCollectionSchema,
];

// Collection names constants
export const Collections = {
  BATTLES: 'battles',
  KILLMAILS: 'killmails',
  CHARACTERS: 'characters',
  CORPORATIONS: 'corporations',
  SYSTEMS: 'systems',
} as const;
