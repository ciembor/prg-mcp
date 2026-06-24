import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL("..", import.meta.url);
const workspace = await mkdtemp(join(tmpdir(), "prg-mcp-pack-smoke-"));

try {
  await execFileAsync("pnpm", ["build"], { cwd: root });
  await execFileAsync("pnpm", ["pack", "--pack-destination", workspace], { cwd: root });
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const tarball = join(workspace, `${packageJson.name}-${packageJson.version}.tgz`);
  const appDir = join(workspace, "app");
  await mkdir(appDir);
  await execFileAsync("npm", ["init", "-y"], { cwd: appDir });
  await execFileAsync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], { cwd: appDir });
  await execFileAsync("node", ["node_modules/prg-mcp/dist/cli.js", "tools"], { cwd: appDir });
  await execFileAsync("node", ["node_modules/prg-mcp/dist/cli.js", "setup"], {
    cwd: appDir,
    env: {
      ...process.env,
      MCP_DATA_DIR: join(workspace, "data"),
      MCP_LOG_LEVEL: "silent",
    },
  });
} finally {
  await rm(workspace, { force: true, recursive: true });
}
