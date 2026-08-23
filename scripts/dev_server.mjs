import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 4173;
const RESTART_DELAY_MS = 800;
const START_TIMEOUT_MS = 15_000;
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = resolve(tmpdir(), 'astranova_mahjong_dev_server.lock');
const logPath = resolve(tmpdir(), 'astranova_mahjong_dev_server.log');
const viteEntry = resolve(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');

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

function isPortOpen() {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ host: HOST, port: PORT });
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
    if (await isPortOpen()) return true;
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

  let child = null;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    child?.kill('SIGTERM');
    releaseLock();
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', releaseLock);

  appendLog(`watchdog started (pid ${process.pid})`);
  while (!stopping) {
    appendLog('starting Vite');
    child = spawn(process.execPath, [viteEntry], {
      cwd: projectRoot,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.on('data', (chunk) => appendLog(chunk.toString().trimEnd()));
    child.stderr.on('data', (chunk) => appendLog(chunk.toString().trimEnd()));

    const exitCode = await new Promise((resolveExit) => {
      child.once('error', (error) => {
        appendLog(`Vite launch error: ${error.message}`);
        resolveExit(-1);
      });
      child.once('exit', (code, signal) => {
        appendLog(`Vite exited (code ${code ?? 'null'}, signal ${signal ?? 'none'})`);
        resolveExit(code ?? -1);
      });
    });
    child = null;
    if (stopping) break;
    appendLog(`restarting after unexpected exit ${exitCode}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, RESTART_DELAY_MS));
  }
}

async function launch() {
  const existingPid = readWatchdogPid();
  if (existingPid && await isPortOpen()) {
    console.log(`AstraNova dev server is already running at http://${HOST}:${PORT}/ (watchdog ${existingPid}).`);
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
    throw new Error(`Dev server did not open port ${PORT}. See ${logPath}`);
  }
  console.log(`AstraNova dev server is running at http://${HOST}:${PORT}/ and will restart automatically.`);
  console.log(`Runtime log: ${logPath}`);
}

if (process.argv.includes('--watchdog')) {
  await runWatchdog();
} else if (process.argv.includes('--status')) {
  const pid = readWatchdogPid();
  const open = await isPortOpen();
  console.log(JSON.stringify({ running: Boolean(pid && open), watchdogPid: pid, host: HOST, port: PORT, logPath }));
} else {
  await launch();
}
