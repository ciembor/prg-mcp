import { prgDatabaseSchemaVersion } from "../../persistence/index.js";

export type AboutResult = {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly repository: string;
  readonly author: { readonly name: string; readonly email: string };
  readonly databaseSchemaVersion: number;
};

export function getAbout(): AboutResult {
  return {
    author: { email: "maciej.ciemborowicz@gmail.com", name: "Maciej Ciemborowicz" },
    databaseSchemaVersion: prgDatabaseSchemaVersion,
    description: "Local-first MCP server for all 54 layers of Poland's official National Register of Boundaries (PRG).",
    name: "prg-mcp",
    repository: "https://github.com/ciembor/prg-mcp",
    version: "0.1.0",
  };
}
