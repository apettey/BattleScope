-- PostgreSQL initial schema for Battle Clustering Service
-- Migration: 001_init
-- Description: Initial battle database schema with battles, killmails, participants, and ship history
-- Created: 2025-11-25

create extension if not exists "uuid-ossp";

-- battles table - stores battle metadata
create table if not exists battles (
  id uuid primary key default uuid_generate_v4(),
  system_id bigint not null,
  system_name text not null,
  region_name text not null,
  security_type text not null, -- 'highsec', 'lowsec', 'nullsec', 'wormhole'
  start_time timestamptz not null,
  end_time timestamptz,
  total_kills int not null default 0,
  total_isk_destroyed bigint not null default 0,
  zkill_related_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_killmail_at timestamptz not null
);

-- battle_killmails table - stores killmails belonging to each battle
create table if not exists battle_killmails (
  battle_id uuid not null references battles(id) on delete cascade,
  killmail_id bigint not null,
  occurred_at timestamptz not null,
  ship_type_name text,
  victim_name text,
  victim_alliance_name text,
  isk_value bigint,
  side_id int,
  primary key (battle_id, killmail_id)
);

-- battle_participants table - stores unique participants per battle
create table if not exists battle_participants (
  battle_id uuid not null references battles(id) on delete cascade,
  character_id bigint not null,
  character_name text,
  alliance_id bigint,
  alliance_name text,
  corp_id bigint,
  corp_name text,
  ship_type_id bigint,
  ship_type_name text,
  side_id int,
  is_victim boolean not null,
  primary key (battle_id, character_id)
);

-- pilot_ship_history table - tracks which ships each pilot has flown
create table if not exists pilot_ship_history (
  character_id bigint not null,
  ship_type_id bigint not null,
  ship_type_name text not null,
  first_seen timestamptz not null,
  last_seen timestamptz not null,
  kill_count int not null default 0,
  loss_count int not null default 0,
  primary key (character_id, ship_type_id)
);

-- Indexes for performance
create index if not exists idx_battles_start_time on battles(start_time desc);
create index if not exists idx_battles_system_id on battles(system_id);
create index if not exists idx_battles_security_type on battles(security_type);
create index if not exists idx_battles_last_killmail_at on battles(last_killmail_at) where end_time is null;
create index if not exists idx_battles_end_time on battles(end_time) where end_time is null;

create index if not exists idx_battle_killmails_occurred_at on battle_killmails(occurred_at desc);
create index if not exists idx_battle_killmails_killmail_id on battle_killmails(killmail_id);

create index if not exists idx_battle_participants_character_id on battle_participants(character_id);
create index if not exists idx_battle_participants_alliance_id on battle_participants(alliance_id);
create index if not exists idx_battle_participants_side_id on battle_participants(battle_id, side_id);

create index if not exists idx_pilot_ship_history_character_id on pilot_ship_history(character_id);
create index if not exists idx_pilot_ship_history_last_seen on pilot_ship_history(last_seen desc);

-- Trigger to auto-update updated_at
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_battles_updated on battles;
create trigger trg_battles_updated before update on battles
for each row execute procedure set_updated_at();
