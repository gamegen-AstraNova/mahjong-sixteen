import { sanitizeProgress } from './storage';
import type { PlayerProgress } from '../types/game';

function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportProgress(progress: PlayerProgress): string {
  const payload = JSON.stringify(progress);
  const body = toBase64Url(payload);
  return `tm1.${body}.${checksum(body)}`;
}

export function importProgress(code: string): PlayerProgress {
  const [version, body, signature] = code.trim().split('.');
  if (version !== 'tm1' || !body || signature !== checksum(body)) throw new Error('INVALID_TRANSFER_CODE');
  return sanitizeProgress(JSON.parse(fromBase64Url(body)));
}
