import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type PackageJson = {
  readonly name: string;
  readonly version: string;
};

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const packageJson = readPackageJson([
  join(currentDirectory, "../package.json"),
  join(currentDirectory, "../../package.json"),
]);

export const packageName = packageJson.name;
export const packageVersion = packageJson.version;
export const packageUserAgent = `${packageName}/${packageVersion}`;

function readPackageJson(paths: readonly string[]): PackageJson {
  for (const path of paths) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as PackageJson;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  }

  throw new Error("Unable to locate package.json metadata.");
}

function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
