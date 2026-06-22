export {
  prgCanonicalMappingVersion,
  prgDatabaseSchemaVersion,
  prgVoivodeshipCodes,
} from "./domain/database-schema.js";
export {
  initializePrgDatabases,
  readPrgDatabaseSchemaState,
} from "./infrastructure/sqlite/prg-database-schema.js";
export {
  acquirePrgImportLock,
  atomicReplaceFileWithBackup,
  atomicWriteFile,
  isPrgImportLockOrphaned,
  PrgImportLockError,
  recoverInterruptedImport,
  releasePrgImportLock,
} from "./infrastructure/files/atomic-import-files.js";
export type {
  PrgDatabaseKind,
  PrgDatabaseSchemaState,
  PrgVoivodeshipCode,
} from "./domain/database-schema.js";
export type {
  InitializedPrgDatabases,
  InitializePrgDatabaseOptions,
} from "./infrastructure/sqlite/prg-database-schema.js";
export type {
  AcquiredPrgImportLock,
  AcquirePrgImportLockOptions,
  PrgImportLockFile,
  PrgImportRecoveryReport,
} from "./infrastructure/files/atomic-import-files.js";
