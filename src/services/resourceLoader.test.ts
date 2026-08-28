import { describe, expect, it } from 'vitest';
import { normalizeServerUrl } from './resourceLoader';

describe('multiplayer server URL normalization', () => {
  it('upgrades HTTP endpoints to their WebSocket equivalents', () => {
    expect(normalizeServerUrl('http://127.0.0.1:2567/', 'http://127.0.0.1:4173/')).toBe('ws://127.0.0.1:2567');
    expect(normalizeServerUrl('https://mahjong.example.com/socket', 'https://game.example.com/')).toBe('wss://mahjong.example.com/socket');
  });

  it('rejects placeholders and unsupported protocols', () => {
    expect(normalizeServerUrl('{{multiplayer.serverUrl}}', 'https://game.example.com/')).toBe('');
    expect(normalizeServerUrl('file:///tmp/socket', 'https://game.example.com/')).toBe('');
  });
});
