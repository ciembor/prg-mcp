import type { RuntimeConfig } from "@mcp-craftsman/node";

const defaultMaxDownloadBytes = 4 * 1024 * 1024 * 1024;
const defaultSourceTimeoutMs = 30_000;
const defaultSyncConcurrency = 2;

export type PrgConfig = RuntimeConfig & {
  readonly maxDownloadBytes: number;
  readonly sourceTimeoutMs: number;
  readonly syncConcurrency: number;
};

export function loadPrgConfig(runtimeConfig: RuntimeConfig, env: NodeJS.ProcessEnv = process.env): PrgConfig {
  return {
    ...runtimeConfig,
    maxDownloadBytes: readInteger(env.PRG_MAX_DOWNLOAD_BYTES, {
      defaultValue: defaultMaxDownloadBytes,
      maximum: Number.MAX_SAFE_INTEGER,
      minimum: 1,
      name: "PRG_MAX_DOWNLOAD_BYTES",
    }),
    sourceTimeoutMs: readInteger(env.PRG_SOURCE_TIMEOUT_MS, {
      defaultValue: defaultSourceTimeoutMs,
      maximum: 300_000,
      minimum: 100,
      name: "PRG_SOURCE_TIMEOUT_MS",
    }),
    syncConcurrency: readInteger(env.PRG_SYNC_CONCURRENCY, {
      defaultValue: defaultSyncConcurrency,
      maximum: 8,
      minimum: 1,
      name: "PRG_SYNC_CONCURRENCY",
    }),
  };
}

type IntegerConstraint = {
  readonly defaultValue: number;
  readonly maximum: number;
  readonly minimum: number;
  readonly name: string;
};

function readInteger(value: string | undefined, constraint: IntegerConstraint): number {
  if (value === undefined || value === "") {
    return constraint.defaultValue;
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < constraint.minimum || parsed > constraint.maximum) {
    throw new Error(
      `${constraint.name} must be an integer between ${constraint.minimum} and ${constraint.maximum}.`,
    );
  }

  return parsed;
}
