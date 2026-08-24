import type { Locale } from '../types/game';

export type AssetKind = 'image' | 'audio' | 'video' | 'font';

interface AssetEntry {
  id: string;
  type: AssetKind;
  relativePath: string;
  cssVariable: string | null;
}

interface AssetManifest {
  assets: AssetEntry[];
}

interface GeneralConfiguration {
  isLocal?: boolean;
  commonPath?: string;
  serverUrl?: string;
}

export interface PlatformRuntime {
  assets: Record<string, string>;
  languagePacks: Record<Locale, Record<string, unknown>>;
  serverUrl: string;
  resolveAsset(relativePath: string): string;
  getPreloadedAudio(relativePath: string): HTMLAudioElement | null;
}

const APP_BASE = import.meta.env.BASE_URL || './';
const preloadedAudioByUrl = new Map<string, HTMLAudioElement>();

function stripLeadingSlash(value: string): string {
  return value.trim().replace(/^\/+/, '');
}

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function absoluteRoot(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('{{')) return null;
  try {
    return withTrailingSlash(new URL(withTrailingSlash(trimmed), location.href).href);
  } catch {
    return null;
  }
}

function appUrl(relativePath: string): string {
  return new URL(`${APP_BASE}${stripLeadingSlash(relativePath)}`, location.href).href;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

function probeMedia(url: string, kind: 'image' | 'audio' | 'video'): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    if (kind === 'image') {
      const image = new Image();
      const finish = (result: boolean) => {
        if (settled) return;
        settled = true;
        image.onload = null;
        image.onerror = null;
        resolve(result);
      };
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = url;
      return;
    }

    const media = document.createElement(kind);
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      media.oncanplay = null;
      media.onerror = null;
      if (result && kind === 'audio') preloadedAudioByUrl.set(url, media as HTMLAudioElement);
      else {
        media.removeAttribute('src');
        media.load();
      }
      resolve(result);
    };
    media.oncanplay = () => finish(true);
    media.onerror = () => finish(false);
    media.preload = 'auto';
    media.src = url;
    media.load();
  });
}

async function probe(url: string, kind: AssetKind | 'json'): Promise<boolean> {
  if (kind === 'image' || kind === 'audio' || kind === 'video') return probeMedia(url, kind);
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return false;
    if (kind === 'json') await response.clone().json();
    return true;
  } catch {
    return false;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function candidates(relativePath: string, roots: string[]): string[] {
  const clean = stripLeadingSlash(relativePath);
  const remote = roots.map((root) => new URL(clean, root).href);
  const local = [appUrl(`common/${clean}`), appUrl(clean)];
  return unique([...remote, ...local]);
}

async function resolveUrl(relativePath: string, kind: AssetKind | 'json', roots: string[]): Promise<string> {
  const urls = candidates(relativePath, roots);
  for (const url of urls) {
    if (await probe(url, kind)) return url;
  }
  console.warn(`[assets] unable to resolve ${relativePath}`, urls);
  return urls.at(-1) ?? relativePath;
}

async function readConfiguration(): Promise<GeneralConfiguration> {
  return await fetchJson<GeneralConfiguration>(appUrl('config/generalConfiguration.json')) ?? {};
}

export async function bootstrapPlatform(): Promise<PlatformRuntime> {
  const [configuration, manifest] = await Promise.all([
    readConfiguration(),
    fetchJson<AssetManifest>(appUrl('config/asset-manifest.json')),
  ]);
  const styleRoot = absoluteRoot(new URLSearchParams(location.search).get('style') ?? '');
  const commonRoot = absoluteRoot(configuration.commonPath ?? '');
  const roots = [styleRoot, commonRoot].filter((root): root is string => Boolean(root));
  const entries = manifest?.assets ?? [];
  const assets: Record<string, string> = {};

  await Promise.all(entries.map(async (entry) => {
    const url = await resolveUrl(entry.relativePath, entry.type, roots);
    assets[entry.id] = url;
    if (entry.cssVariable) document.documentElement.style.setProperty(entry.cssVariable, `url("${url.replaceAll('"', '%22')}")`);
  }));

  const languageFiles: Record<Locale, string> = {
    en: 'config/language/en.json',
    'zh-TW': 'config/language/zh-tw.json',
    'zh-CN': 'config/language/zh-cn.json',
    ja: 'config/language/ja.json',
  };
  const languagePacks = {} as Record<Locale, Record<string, unknown>>;
  await Promise.all((Object.entries(languageFiles) as [Locale, string][]).map(async ([locale, relativePath]) => {
    const url = await resolveUrl(relativePath, 'json', roots);
    languagePacks[locale] = await fetchJson<Record<string, unknown>>(url) ?? {};
  }));

  const byPath = new Map(entries.map((entry) => [stripLeadingSlash(entry.relativePath).toLowerCase(), assets[entry.id]]));
  const serverUrl = new URLSearchParams(location.search).get('server')?.trim() || configuration.serverUrl?.trim() || '';
  return {
    assets,
    languagePacks,
    serverUrl,
    resolveAsset(relativePath: string) {
      return byPath.get(stripLeadingSlash(relativePath).toLowerCase()) ?? appUrl(`common/${stripLeadingSlash(relativePath)}`);
    },
    getPreloadedAudio(relativePath: string) {
      const url = byPath.get(stripLeadingSlash(relativePath).toLowerCase());
      return url ? preloadedAudioByUrl.get(url) ?? null : null;
    },
  };
}
