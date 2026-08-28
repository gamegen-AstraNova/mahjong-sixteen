import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const WEB_PORT = 4173;
const MULTIPLAYER_PORT = 2567;
const RESTART_DELAY_MS = 800;
const START_TIMEOUT_MS = 15_000;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = resolve(tmpdir(), 'astranova_mahjong_dev_server.lock');
const logPath = resolve(tmpdir(), 'astranova_mahjong_dev_server.log');
const viteEntry = resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const tsxEntry = resolve(projectRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const multiplayerEntry = resolve(projectRoot, 'server', 'index.ts');
const multiplayerTsConfig = resolve(projectRoot, 'tsconfig.server.json');

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readWatchdogPid() {
  if (!existsSync(lockPath)) return null;
  const pid = Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10);
  if (isProcessRunning(pid)) return pid;
  try {
    unlinkSync(lockPath);
  } catch {
    // A concurrent launcher may already have replaced the stale lock.
  }
  return null;
}

function isPortOpen(port) {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ host: HOST, port });
    socket.setTimeout(350);
    socket.once('connect', () => {
      socket.destroy();
      resolveOpen(true);
    });
    const finishClosed = () => {
      socket.destroy();
      resolveOpen(false);
    };
    socket.once('error', finishClosed);
    socket.once('timeout', finishClosed);
  });
}

async function waitForPort(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(WEB_PORT) && await isPortOpen(MULTIPLAYER_PORT)) return true;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  return false;
}

function acquireLock() {
  let descriptor;
  try {
    descriptor = openSync(lockPath, 'wx');
    writeFileSync(descriptor, String(process.pid), 'utf8');
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return true;
}

function releaseLock() {
  try {
    if (Number.parseInt(readFileSync(lockPath, 'utf8').trim(), 10) === process.pid) {
      unlinkSync(lockPath);
    }
  } catch {
    // The operating system also clears stale locks on the next launch.
  }
}

function appendLog(message) {
  const timestamp = new Date().toISOString();
  writeFileSync(logPath, `[${timestamp}] ${message}\n`, { encoding: 'utf8', flag: 'a' });
}

async function runWatchdog() {
  if (!acquireLock()) process.exit(0);

  let children = [];
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    children.forEach((child) => child.kill('SIGTERM'));
    releaseLock();
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', releaseLock);

  appendLog(`watchdog started (pid ${process.pid})`);
  while (!stopping) {
    const startChild = (label, entry, args = []) => {
      appendLog(`starting ${label}`);
      const child = spawn(process.execPath, [entry, ...args], {
        cwd: projectRoot,
        env: { ...process.env, FORCE_COLOR: '0', PORT: String(MULTIPLAYER_PORT) },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      child.stdout.on('data', (chunk) => appendLog(`${label}: ${chunk.toString().trimEnd()}`));
      child.stderr.on('data', (chunk) => appendLog(`${label}: ${chunk.toString().trimEnd()}`));
      return child;
    };
    const vite = startChild('Vite', viteEntry);
    const multiplayer = startChild('multiplayer', tsxEntry, ['--tsconfig', multiplayerTsConfig, multiplayerEntry]);
    children = [vite, multiplayer];
    const waitForExit = (label, child) => new Promise((resolveExit) => {
      child.once('error', (error) => {
        appendLog(`${label} launch error: ${error.message}`);
        resolveExit({ label, code: -1 });
      });
      child.once('exit', (code, signal) => {
        appendLog(`${label} exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`);
        resolveExit({ label, code: code ?? -1 });
      });
    });
    const exit = await Promise.race([waitForExit('Vite', vite), waitForExit('multiplayer', multiplayer)]);
    children.forEach((child) => { if (!child.killed) child.kill('SIGTERM'); });
    children = [];
    if (stopping) break;
    appendLog(`restarting after ${exit.label} exit ${exit.code}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, RESTART_DELAY_MS));
  }
}

async function launch() {
  const existingPid = readWatchdogPid();
  if (existingPid && await isPortOpen(WEB_PORT) && await isPortOpen(MULTIPLAYER_PORT)) {
    console.log(`AstraNova dev servers are already running at http://${HOST}:${WEB_PORT}/ and ws://${HOST}:${MULTIPLAYER_PORT}/ (watchdog ${existingPid}).`);
    return;
  }

  const watchdog = spawn(process.execPath, [fileURLToPath(import.meta.url), '--watchdog'], {
    cwd: projectRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  watchdog.unref();

  if (!await waitForPort(START_TIMEOUT_MS)) {
    throw new Error(`Dev servers did not open ports ${WEB_PORT} and ${MULTIPLAYER_PORT}. See ${logPath}`);
  }
  console.log(`AstraNova web and multiplayer servers are running at http://${HOST}:${WEB_PORT}/ and ws://${HOST}:${MULTIPLAYER_PORT}/.`);
  console.log(`Runtime log: ${logPath}`);
}

if (process.argv.includes('--watchdog')) {
  await runWatchdog();
} else if (process.argv.includes('--status')) {
  const pid = readWatchdogPid();
  const webOpen = await isPortOpen(WEB_PORT);
  const multiplayerOpen = await isPortOpen(MULTIPLAYER_PORT);
  console.log(JSON.stringify({ running: Boolean(pid && webOpen && multiplayerOpen), watchdogPid: pid, host: HOST, webPort: WEB_PORT, multiplayerPort: MULTIPLAYER_PORT, logPath }));
} else {
  await launch();
}
