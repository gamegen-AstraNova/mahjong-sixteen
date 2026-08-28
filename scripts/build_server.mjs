import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, 'server-dist');
const typeScriptCli = resolve(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc');

rmSync(outputDirectory, { recursive: true, force: true });
const result = spawnSync(process.execPath, [typeScriptCli, '-p', 'tsconfig.server.build.json'], {
  cwd: projectRoot,
  stdio: 'inherit',
  windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
