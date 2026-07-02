import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

const execFileAsync = promisify(execFile);
const root = new URL("..", import.meta.url);
const workspace = await mkdtemp(join(tmpdir(), "prg-mcp-pack-smoke-"));
const npmEnv = {
  ...process.env,
  NPM_CONFIG_CACHE: join(workspace, "npm-cache"),
};

try {
  await execFileAsync("pnpm", ["build"], { cwd: root });
  await execFileAsync("pnpm", ["pack", "--pack-destination", workspace], { cwd: root });
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const tarball = join(workspace, `${packageJson.name}-${packageJson.version}.tgz`);
  const packedFiles = await listPackedFiles(tarball);
  for (const requiredFile of ["dist/cli.js", "README.md", "LICENSE", "NOTICE.md", "docs/tutorial.md", "docs/provenance.md", "docs/layer-coverage.md"]) {
    if (!packedFiles.has(requiredFile)) throw new Error(`Package smoke missing ${requiredFile}`);
  }

  const appDir = join(workspace, "app");
  await mkdir(appDir);
  await execFileAsync("npm", ["init", "-y"], { cwd: appDir, env: npmEnv });
  await execFileAsync("npm", ["install", "--no-audit", "--no-fund", tarball], { cwd: appDir, env: npmEnv });
  await execFileAsync("node", ["node_modules/prg-mcp/dist/cli.js", "tools"], { cwd: appDir });
  await execFileAsync("node", ["node_modules/prg-mcp/dist/cli.js", "setup"], {
    cwd: appDir,
    env: {
      ...process.env,
      MCP_DATA_DIR: join(workspace, "data"),
      MCP_LOG_LEVEL: "silent",
    },
  });
  for (const command of ["status", "coverage", "doctor"]) {
    await execFileAsync("node", ["node_modules/prg-mcp/dist/cli.js", command], {
      cwd: appDir,
      env: {
        ...process.env,
        MCP_DATA_DIR: join(workspace, "data"),
        MCP_LOG_LEVEL: "silent",
      },
    });
  }
} finally {
  await rm(workspace, { force: true, recursive: true });
}

async function listPackedFiles(tarball) {
  const bytes = gunzipSync(await readFile(tarball));
  const files = new Set();
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const size = Number.parseInt(readTarString(header, 124, 12).trim() || "0", 8);
    const path = [prefix, name].filter(Boolean).join("/").replace(/^package\//u, "");
    if (path) files.add(path);

    offset += 512 + Math.ceil(size / 512) * 512;
  }

  return files;
}

function readTarString(header, start, length) {
  const end = header.indexOf(0, start);
  return header.subarray(start, end === -1 || end > start + length ? start + length : end).toString("utf8");
}
