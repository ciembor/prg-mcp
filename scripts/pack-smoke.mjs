import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

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
  const { stdout: tarballListing } = await execFileAsync("tar", ["-tzf", tarball]);
  const packedFiles = new Set(tarballListing.trim().split("\n").map((line) => line.replace(/^package\//u, "")));
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
