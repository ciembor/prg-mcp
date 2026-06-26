import { createRequire } from "node:module";

type PackageJson = {
  readonly name: string;
  readonly version: string;
};

const require = createRequire(import.meta.url);
const packageJson = require("../../package.json") as PackageJson;

export const packageName = packageJson.name;
export const packageVersion = packageJson.version;
export const packageUserAgent = `${packageName}/${packageVersion}`;
