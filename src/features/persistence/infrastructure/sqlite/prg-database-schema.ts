import { mkdirSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";

import {
  prgCanonicalMappingVersion,
  prgDatabaseSchemaVersion,
  prgVoivodeshipCodes,
  type PrgDatabaseKind,
  type PrgDatabaseSchemaState,
  type PrgVoivodeshipCode,
} from "../../domain/database-schema.js";

export type InitializePrgDatabaseOptions = {
  readonly dataDir: string;
  readonly addressShardCodes?: readonly PrgVoivodeshipCode[];
  readonly appVersion?: string;
};

export type InitializedPrgDatabases = {
  readonly catalogPath: string;
  readonly boundariesPath: string;
  readonly addressShardPaths: Readonly<Record<PrgVoivodeshipCode, string>>;
};

export function initializePrgDatabases(options: InitializePrgDatabaseOptions): InitializedPrgDatabases {
  mkdirSync(options.dataDir, { recursive: true });

  const catalogPath = join(options.dataDir, "catalog.sqlite");
  const boundariesPath = join(options.dataDir, "boundaries.sqlite");
  const shardCodes = options.addressShardCodes ?? prgVoivodeshipCodes;
  const addressShardPaths = Object.fromEntries(
    shardCodes.map((voivodeshipCode) => [voivodeshipCode, join(options.dataDir, `addresses-${voivodeshipCode}.sqlite`)]),
  ) as Record<PrgVoivodeshipCode, string>;

  withDatabase(catalogPath, (database) => migrateCatalogDatabase(database, options.appVersion ?? "0.1.0"));
  withDatabase(boundariesPath, migrateBoundariesDatabase);

  for (const shardPath of Object.values(addressShardPaths)) {
    withDatabase(shardPath, migrateAddressShardDatabase);
  }

  return {
    catalogPath,
    boundariesPath,
    addressShardPaths,
  };
}

export function readPrgDatabaseSchemaState(databasePath: string): PrgDatabaseSchemaState {
  return withDatabase(databasePath, (database) => {
    const row = database
      .prepare("select kind, version, canonical_mapping_version from schema_metadata order by rowid desc limit 1")
      .get() as { kind: PrgDatabaseKind; version: number; canonical_mapping_version: string };

    return {
      kind: row.kind,
      version: row.version,
      canonicalMappingVersion: row.canonical_mapping_version,
    };
  });
}

function migrateCatalogDatabase(database: Database.Database, appVersion: string): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    createSchemaMetadata(database, "catalog", appVersion);
    database.exec(`
      create table if not exists layers (
        layer_id text primary key,
        source_name text not null unique,
        title_pl text not null,
        category text not null,
        geometry_type text not null,
        source_channel text not null
      );

      create table if not exists sync_runs (
        id text primary key,
        mode text not null,
        started_at text not null,
        finished_at text,
        status text not null,
        error_code text
      );

      create table if not exists snapshots (
        id integer primary key,
        dataset_key text not null,
        scope text not null,
        state_date text,
        downloaded_at text not null,
        etag text,
        last_modified text,
        sha256 text,
        record_count integer,
        schema_fingerprint text not null,
        source_url text not null,
        unique (dataset_key, scope, state_date)
      );

      create table if not exists installed_coverage (
        layer_id text not null,
        scope_type text not null,
        scope_code text not null,
        snapshot_id integer not null references snapshots(id),
        completeness text not null,
        primary key (layer_id, scope_type, scope_code, snapshot_id)
      );

      create index if not exists installed_coverage_layer_idx on installed_coverage(layer_id, scope_type, scope_code);
      create index if not exists snapshots_dataset_idx on snapshots(dataset_key, scope, state_date);
    `);
    database.pragma(`user_version = ${prgDatabaseSchemaVersion}`);
  })();
}

function migrateBoundariesDatabase(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    createSchemaMetadata(database, "boundaries");
    database.exec(`
      create table if not exists areas (
        rowid integer primary key,
        snapshot_id integer not null,
        layer_id text not null,
        object_id text not null,
        name text,
        normalized_name text,
        aliases text,
        code text,
        iip_id text,
        regon text,
        valid_from text,
        valid_to text,
        version_from text,
        version_to text,
        area_m2 real,
        centroid_x real,
        centroid_y real,
        min_x real not null,
        min_y real not null,
        max_x real not null,
        max_y real not null,
        geometry_wkb blob not null,
        source_properties_json text not null default '{}',
        unique (snapshot_id, layer_id, object_id)
      );

      create virtual table if not exists areas_fts using fts5(
        name,
        normalized_name,
        code,
        aliases,
        content='areas',
        content_rowid='rowid'
      );

      create virtual table if not exists areas_rtree using rtree(
        rowid,
        min_x,
        max_x,
        min_y,
        max_y
      );

      create index if not exists areas_layer_idx on areas(layer_id);
      create index if not exists areas_code_idx on areas(code);
      create index if not exists areas_iip_idx on areas(iip_id);
      create index if not exists areas_regon_idx on areas(regon);
      create index if not exists areas_validity_idx on areas(valid_from, valid_to);
    `);
    database.pragma(`user_version = ${prgDatabaseSchemaVersion}`);
  })();
}

function migrateAddressShardDatabase(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.transaction(() => {
    createSchemaMetadata(database, "address-shard");
    database.exec(`
      create table if not exists import_batches (
        id text primary key,
        source_scope text not null,
        started_at text not null,
        finished_at text,
        status text not null,
        schema_fingerprint text not null
      );

      create table if not exists addresses (
        rowid integer primary key,
        batch_id text references import_batches(id),
        object_id text not null,
        iip_id text,
        municipality_code text,
        locality_id text,
        locality_name text,
        street_id text,
        street_name text,
        building_number text not null,
        postal_code text,
        x real not null,
        y real not null,
        valid_from text,
        version_from text,
        source_scope text not null,
        source_properties_json text not null default '{}',
        unique (object_id)
      );

      create table if not exists streets (
        rowid integer primary key,
        batch_id text references import_batches(id),
        object_id text not null,
        iip_id text,
        municipality_code text,
        locality_id text,
        name text not null,
        normalized_name text not null,
        min_x real not null,
        min_y real not null,
        max_x real not null,
        max_y real not null,
        geometry_wkb blob not null,
        source_properties_json text not null default '{}',
        unique (object_id)
      );

      create virtual table if not exists addresses_fts using fts5(
        full_address,
        locality_name,
        street_name,
        building_number,
        postal_code,
        content=''
      );

      create virtual table if not exists streets_fts using fts5(
        name,
        normalized_name,
        content='streets',
        content_rowid='rowid'
      );

      create virtual table if not exists addresses_rtree using rtree(
        rowid,
        min_x,
        max_x,
        min_y,
        max_y
      );

      create virtual table if not exists streets_rtree using rtree(
        rowid,
        min_x,
        max_x,
        min_y,
        max_y
      );

      create index if not exists addresses_iip_idx on addresses(iip_id);
      create index if not exists addresses_municipality_idx on addresses(municipality_code);
      create index if not exists addresses_locality_idx on addresses(locality_id);
      create index if not exists addresses_street_idx on addresses(street_id);
      create index if not exists streets_iip_idx on streets(iip_id);
      create index if not exists streets_municipality_idx on streets(municipality_code);
      create index if not exists streets_locality_idx on streets(locality_id);
    `);
    database.pragma(`user_version = ${prgDatabaseSchemaVersion}`);
  })();
}

function createSchemaMetadata(database: Database.Database, kind: PrgDatabaseKind, appVersion = "0.1.0"): void {
  database.exec(`
    create table if not exists schema_metadata (
      version integer not null,
      kind text not null,
      canonical_mapping_version text not null,
      created_at text not null,
      app_version text not null
    );
  `);

  const count = database.prepare("select count(*) as count from schema_metadata").get() as { count: number };

  if (count.count === 0) {
    database
      .prepare(
        "insert into schema_metadata(version, kind, canonical_mapping_version, created_at, app_version) values (?, ?, ?, ?, ?)",
      )
      .run(prgDatabaseSchemaVersion, kind, prgCanonicalMappingVersion, new Date(0).toISOString(), appVersion);
  }
}

function withDatabase<T>(path: string, callback: (database: Database.Database) => T): T {
  const database = new Database(path);

  try {
    return callback(database);
  } finally {
    database.close();
  }
}
