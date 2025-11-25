-- PostgreSQL initial schema for EVE Auth & Feature-Scoped RBAC
-- Migration: 001_init
-- Description: Initial authentication database schema
-- Created: 2025-11-25

create extension if not exists "uuid-ossp";

-- accounts
create table if not exists accounts (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text unique,
  display_name text not null default '',
  primary_character_id uuid,
  is_blocked boolean not null default false,
  is_deleted boolean not null default false,
  is_super_admin boolean not null default false,
  last_login_at timestamptz
);

-- characters
create table if not exists characters (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references accounts(id) on delete cascade,
  eve_character_id bigint not null unique,
  eve_character_name text not null,
  corp_id bigint not null,
  corp_name text not null,
  alliance_id bigint,
  alliance_name text,
  portrait_url text,
  esi_access_token bytea,
  esi_refresh_token bytea,
  esi_token_expires_at timestamptz,
  scopes text[] not null default array[]::text[],
  last_verified_at timestamptz
);

alter table accounts
  add constraint accounts_primary_character_fk
  foreign key (primary_character_id) references characters(id) on delete set null;

-- features
create table if not exists features (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  name text not null,
  description text
);

-- roles
create table if not exists roles (
  id uuid primary key default uuid_generate_v4(),
  key text not null unique,
  rank int not null,
  check (rank > 0)
);

-- account_feature_roles
create table if not exists account_feature_roles (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid not null references accounts(id) on delete cascade,
  feature_id uuid not null references features(id) on delete cascade,
  role_id uuid not null references roles(id) on delete restrict,
  granted_by uuid references accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (account_id, feature_id)
);

-- feature_settings
create table if not exists feature_settings (
  id uuid primary key default uuid_generate_v4(),
  feature_id uuid not null references features(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references accounts(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (feature_id, key)
);

-- auth_config (singleton)
create table if not exists auth_config (
  id boolean primary key default true, -- enforce single row
  require_membership boolean not null default true,
  allowed_corp_ids bigint[] not null default array[]::bigint[],
  allowed_alliance_ids bigint[] not null default array[]::bigint[],
  denied_corp_ids bigint[] not null default array[]::bigint[],
  denied_alliance_ids bigint[] not null default array[]::bigint[]
);

-- audit_logs
create table if not exists audit_logs (
  id uuid primary key default uuid_generate_v4(),
  actor_account_id uuid references accounts(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- helpful indexes
create index if not exists idx_characters_account on characters(account_id);
create index if not exists idx_characters_corp on characters(corp_id);
create index if not exists idx_characters_alliance on characters(alliance_id);
create index if not exists idx_audit_logs_actor on audit_logs(actor_account_id);

-- seeds
insert into roles (id, key, rank) values
  (uuid_generate_v4(), 'user', 10),
  (uuid_generate_v4(), 'fc', 20),
  (uuid_generate_v4(), 'director', 30),
  (uuid_generate_v4(), 'admin', 40)
on conflict (key) do nothing;

insert into features (id, key, name, description) values
  (uuid_generate_v4(), 'battle-reports', 'Battle Reports', 'Feature area for battle report creation/viewing'),
  (uuid_generate_v4(), 'battle-intel', 'Battle Intel', 'Feature area for intel collection/analysis')
on conflict (key) do nothing;

insert into auth_config (id, require_membership) values (true, true)
on conflict (id) do nothing;

-- trigger to auto-update updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_accounts_updated on accounts;
create trigger trg_accounts_updated before update on accounts
for each row execute procedure set_updated_at();

drop trigger if exists trg_feature_settings_updated on feature_settings;
create trigger trg_feature_settings_updated before update on feature_settings
for each row execute procedure set_updated_at();
