import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { ASSETS } from './config/assets';
import { CHARACTER_IDS, CHARACTER_SKINS, OUTFIT_THEME_SLUGS, TABLES, TILE_BACKS, lobbyBackgroundForOutfit, uiThemeForOutfit } from './config/catalog';
import { autoPlayCurrentTurn, claimDiscard, concealedKongTiles, createInitialState, declareConcealedKong, declareReady, discardTile, passClaim, readyDiscardIndices, tileLabel, type ClaimOption, type MahjongState } from './game/mahjong';
import { detectMatchActionSignals, matchActionDuration, type MatchActionKind, type MatchActionSignal } from './game/matchActionEvents';
import { I18nProvider, useI18n } from './i18n/I18nProvider';
import { MahjongTable3D } from './MahjongTable3D';
import { taipeiDailyKey } from './services/daily';
import { BgmPlayer, type BgmScene } from './services/BgmPlayer';
import { playMahjongSfx, UiSfxPlayer } from './services/UiSfxPlayer';
import { claimMilestoneChoice, GACHA_COST_ONE, GACHA_COST_TEN, performGacha, type MilestoneChoiceKind } from './services/gacha';
import { MahjongMultiplayerClient, MMSG, subscribeRoom, type MahjongRoom, type OnlineRoomSnapshot, type OpenMahjongRoom } from './services/multiplayer';
import type { PlatformRuntime } from './services/resourceLoader';
import { loadProgress, saveProgress } from './services/storage';
import { exportProgress, importProgress } from './services/transfer';
import { SUPPORTED_LOCALES, type CharacterId, type GachaReward, type Locale, type PlayerProgress } from './types/game';

type ModalName = 'language' | 'characters' | 'equipment' | 'gacha' | 'transfer' | 'online' | 'daily' | null;
const TURN_TIME_SECONDS = 30;
const HOME_DIALOGUE_LINE_COUNT = 10;
const WIN_LINE_COUNT = 5;
const GAME_POINTS_PER_COIN = 10;
const LOW_BALANCE_THRESHOLD = 1_000;
const PORTRAIT_HOLD_DELAY_MS = 220;
const PORTRAIT_MIN_SCALE = 0.48;
const PORTRAIT_MAX_SCALE = 2.5;
const DEFAULT_PORTRAIT_VIEW = { x: 0, y: 0, scale: 1 };
const AI_CHARACTER_SKINS = ['', 'mio_1', 'sora_1', 'aya_1'] as const;
type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

function requestLandscapeOrientation(): void {
  const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
  try {
    void orientation?.lock?.('landscape').catch(() => undefined);
  } catch {
    // Browsers without orientation-lock permission fall back to the CSS gate.
  }
}

function releaseOrientationLock(): void {
  const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
  try {
    orientation?.unlock?.();
  } catch {
    // Some embedded browsers expose the API but do not permit unlocking it.
  }
}

const LOBBY_PORTRAIT_FRAMING: Record<CharacterId, { height: string; maxHeight: string }> = {
  aya: { height: '145dvh', maxHeight: '98rem' },
  mio: { height: '155dvh', maxHeight: '105rem' },
  sora: { height: '147dvh', maxHeight: '100rem' },
};

function randomHomeDialogueLine(current?: number): number {
  if (current === undefined) return Math.floor(Math.random() * HOME_DIALOGUE_LINE_COUNT);
  const offset = 1 + Math.floor(Math.random() * (HOME_DIALOGUE_LINE_COUNT - 1));
  return (current + offset) % HOME_DIALOGUE_LINE_COUNT;
}

function clampPortraitScale(scale: number): number {
  return Math.min(PORTRAIT_MAX_SCALE, Math.max(PORTRAIT_MIN_SCALE, scale));
}

function pointerDistance(points: Map<number, { x: number; y: number }>): number {
  const [first, second] = [...points.values()];
  return first && second ? Math.hypot(second.x - first.x, second.y - first.y) : 0;
}

function Modal({ title, onClose, children, wide = false }: { title: string; onClose(): void; children: ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="round-button close-button" onClick={onClose} aria-label={t('action.close')}>
            <span className="close-icon" aria-hidden="true">✕</span>
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

function characterName(characterId: CharacterId, t: ReturnType<typeof useI18n>['t']): string {
  return t(`character.${characterId}`);
}

function themeName(outfitNumber: number, t: ReturnType<typeof useI18n>['t']): string {
  return t(`theme.${OUTFIT_THEME_SLUGS[outfitNumber - 1] ?? OUTFIT_THEME_SLUGS[0]}`);
}

function CharacterModal({ progress, runtime, updateProgress, onClose }: {
  progress: PlayerProgress; runtime: PlatformRuntime; updateProgress(next: PlayerProgress): void; onClose(): void;
}) {
  const { t } = useI18n();
  const selected = CHARACTER_SKINS.find((skin) => skin.id === progress.selectedCharacterSkin) ?? CHARACTER_SKINS[0];
  const [tab, setTab] = useState<CharacterId>(selected.characterId);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const visible = CHARACTER_SKINS.filter((skin) => skin.characterId === tab && (!ownedOnly || progress.ownedCharacterSkins.includes(skin.id)));
  return (
    <Modal title={t('character.title')} onClose={onClose} wide>
      <div className="modal-toolbar">
        <div className="tab-list">
          {CHARACTER_IDS.map((id) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{characterName(id, t)}</button>)}
        </div>
        <label className="check-label"><input type="checkbox" checked={ownedOnly} onChange={(event) => setOwnedOnly(event.target.checked)} />{t('action.ownedOnly')}</label>
      </div>
      <div className="collection-grid character-grid">
        {visible.map((skin) => {
          const owned = progress.ownedCharacterSkins.includes(skin.id);
          const isSelected = skin.id === progress.selectedCharacterSkin;
          return (
            <button key={skin.id} className={`collection-card ${!owned ? 'locked' : ''} ${isSelected ? 'selected' : ''}`} disabled={!owned}
              onClick={() => updateProgress({ ...progress, selectedCharacterSkin: skin.id })}>
              <div className={`skin-preview tint-${skin.outfitNumber}`}><img src={runtime.resolveAsset(skin.relativePath)} alt="" /></div>
              <strong>{themeName(skin.outfitNumber, t)}</strong>
              <span>{!owned ? `🔒 ${t('character.locked')}` : isSelected ? t('action.selected') : t('action.select')}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function EquipmentModal({ progress, runtime, updateProgress, onClose }: {
  progress: PlayerProgress; runtime: PlatformRuntime; updateProgress(next: PlayerProgress): void; onClose(): void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<'tileBack' | 'table'>('tileBack');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const items = tab === 'tileBack' ? TILE_BACKS : TABLES;
  const owned = tab === 'tileBack' ? progress.ownedTileBacks : progress.ownedTables;
  const selected = tab === 'tileBack' ? progress.selectedTileBack : progress.selectedTable;
  return (
    <Modal title={t('equipment.title')} onClose={onClose} wide>
      <div className="modal-toolbar">
        <div className="tab-list">
          <button className={tab === 'tileBack' ? 'active' : ''} onClick={() => setTab('tileBack')}>{t('equipment.tileBack')}</button>
          <button className={tab === 'table' ? 'active' : ''} onClick={() => setTab('table')}>{t('equipment.table')}</button>
        </div>
        <label className="check-label"><input type="checkbox" checked={ownedOnly} onChange={(event) => setOwnedOnly(event.target.checked)} />{t('action.ownedOnly')}</label>
      </div>
      <div className="collection-grid equipment-grid">
        {items.filter((item) => !ownedOnly || owned.includes(item.id)).map((item) => {
          const isOwned = owned.includes(item.id);
          const isSelected = selected === item.id;
          return (
            <button key={item.id} className={`collection-card ${!isOwned ? 'locked' : ''} ${isSelected ? 'selected' : ''}`} disabled={!isOwned}
              onClick={() => updateProgress(tab === 'tileBack' ? { ...progress, selectedTileBack: item.id } : { ...progress, selectedTable: item.id })}>
              <div className={tab === 'tileBack' ? 'tile-back-preview' : 'table-preview'} style={{ '--preview-texture': `url("${runtime.resolveAsset(item.relativePath)}")` } as CSSProperties} aria-hidden="true" />
              <strong>{t(`theme.${item.theme}`)}</strong>
              <span>{!isOwned ? `🔒 ${t('equipment.locked')}` : isSelected ? t('action.selected') : t('action.select')}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

function rewardName(reward: GachaReward, t: ReturnType<typeof useI18n>['t']): string {
  if (reward.kind === 'coins') return `${reward.amount.toLocaleString()} 🪙`;
  if (reward.kind === 'character') {
    const skin = CHARACTER_SKINS.find((item) => item.id === reward.itemId)!;
    return `${characterName(skin.characterId, t)} · ${themeName(skin.outfitNumber, t)}`;
  }
  const item = (reward.kind === 'tileBack' ? TILE_BACKS : TABLES).find((candidate) => candidate.id === reward.itemId)!;
  return `${t(`equipment.${reward.kind}`)} · ${t(`theme.${item.theme}`)}`;
}

function RewardPreview({ reward, runtime }: { reward: GachaReward; runtime: PlatformRuntime }) {
  if (reward.kind === 'coins') return <span className="reward-coin-preview" aria-hidden="true">🪙</span>;
  const relativePath = reward.kind === 'character'
    ? CHARACTER_SKINS.find((item) => item.id === reward.itemId)?.relativePath
    : (reward.kind === 'tileBack' ? TILE_BACKS : TABLES).find((item) => item.id === reward.itemId)?.relativePath;
  return relativePath
    ? <span className={`reward-preview reward-preview-${reward.kind}`}><img src={runtime.resolveAsset(relativePath)} alt="" /></span>
    : null;
}

function RewardOverlay({ rewards, runtime, onClose }: { rewards: GachaReward[]; runtime: PlatformRuntime; onClose(): void }) {
  const { t } = useI18n();
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="reward-overlay">
      <h2>{t('gacha.result')}</h2>
      <div className={`reward-grid count-${rewards.length} ${revealed ? 'revealed' : ''}`}>
        {rewards.map((reward, index) => (
          <div className={`reward-card reward-${reward.kind}`} style={{ '--reward-index': index } as CSSProperties} key={`${reward.kind}-${index}`}>
            <div className="reward-card-inner">
              <div className="reward-card-face reward-card-back" aria-hidden={revealed}>
                <img src={runtime.resolveAsset(ASSETS.rewardCardBack)} alt="" />
              </div>
              <div className="reward-card-face reward-card-front" aria-hidden={!revealed}>
                <RewardPreview reward={reward} runtime={runtime} />
                <strong>{rewardName(reward, t)}</strong>
                {'duplicate' in reward && <small>{reward.duplicate ? t('gacha.duplicate') : t('gacha.new')}</small>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="primary-button" onClick={revealed ? onClose : () => setRevealed(true)}>{revealed ? t('action.close') : t('gacha.revealAll')}</button>
    </div>
  );
}

function MilestoneChoiceOverlay({ kind, progress, runtime, onClaim, onClose }: {
  kind: MilestoneChoiceKind;
  progress: PlayerProgress;
  runtime: PlatformRuntime;
  onClaim(itemId: string): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [equipmentTab, setEquipmentTab] = useState<'tileBack' | 'table'>('tileBack');
  const [characterTab, setCharacterTab] = useState<CharacterId>('aya');
  const allOwned = kind === 'character'
    ? CHARACTER_SKINS.every((item) => progress.ownedCharacterSkins.includes(item.id))
    : TILE_BACKS.every((item) => progress.ownedTileBacks.includes(item.id)) && TABLES.every((item) => progress.ownedTables.includes(item.id));
  const equipmentItems = equipmentTab === 'tileBack' ? TILE_BACKS : TABLES;
  const characterItems = CHARACTER_SKINS.filter((item) => item.characterId === characterTab);
  return createPortal(
    <div className="milestone-choice-overlay" role="presentation">
      <section className="milestone-choice-panel" role="dialog" aria-modal="true" aria-label={t(kind === 'character' ? 'gacha.characterChoiceTitle' : 'gacha.accessoryChoiceTitle')}>
        <header className="modal-header">
          <h2>{t(kind === 'character' ? 'gacha.characterChoiceTitle' : 'gacha.accessoryChoiceTitle')}</h2>
          <button className="round-button close-button" onClick={onClose} aria-label={t('action.close')}>
            <span className="close-icon" aria-hidden="true">✕</span>
          </button>
        </header>
        <div className="choice-tabs tab-list">
          {kind === 'accessory' ? <>
            <button className={equipmentTab === 'tileBack' ? 'active' : ''} onClick={() => setEquipmentTab('tileBack')}>{t('equipment.tileBack')}</button>
            <button className={equipmentTab === 'table' ? 'active' : ''} onClick={() => setEquipmentTab('table')}>{t('equipment.table')}</button>
          </> : CHARACTER_IDS.map((id) => <button key={id} className={characterTab === id ? 'active' : ''} onClick={() => setCharacterTab(id)}>{characterName(id, t)}</button>)}
        </div>
        <p className="choice-hint">{t(allOwned ? 'gacha.choiceAllOwned' : 'gacha.choiceHint')}</p>
        <div className={`collection-grid choice-collection-grid ${kind === 'character' ? 'character-grid' : 'equipment-grid'}`}>
          {kind === 'accessory' ? equipmentItems.map((item) => {
            const owned = item.kind === 'tileBack' ? progress.ownedTileBacks.includes(item.id) : progress.ownedTables.includes(item.id);
            const disabled = owned && !allOwned;
            return <button key={item.id} className={`collection-card ${disabled ? 'locked' : ''}`} disabled={disabled} onClick={() => onClaim(item.id)}>
              <div className={item.kind === 'tileBack' ? 'tile-back-preview' : 'table-preview'} style={{ '--preview-texture': `url("${runtime.resolveAsset(item.relativePath)}")` } as CSSProperties} aria-hidden="true">
                {owned && <span className="owned-preview-label">{t('gacha.choiceOwned')}</span>}
              </div>
              <strong>{t(`theme.${item.theme}`)}</strong>
              <span>{owned ? t(allOwned ? 'gacha.choiceDuplicateRefund' : 'gacha.choiceOwned') : t('action.select')}</span>
            </button>;
          }) : characterItems.map((skin) => {
            const owned = progress.ownedCharacterSkins.includes(skin.id);
            const disabled = owned && !allOwned;
            return <button key={skin.id} className={`collection-card ${disabled ? 'locked' : ''}`} disabled={disabled} onClick={() => onClaim(skin.id)}>
              <div className={`skin-preview tint-${skin.outfitNumber}`}><img src={runtime.resolveAsset(skin.relativePath)} alt="" />{owned && <span className="owned-preview-label">{t('gacha.choiceOwned')}</span>}</div>
              <strong>{themeName(skin.outfitNumber, t)}</strong>
              <span>{owned ? t(allOwned ? 'gacha.choiceDuplicateRefund' : 'gacha.choiceOwned') : t('action.select')}</span>
            </button>;
          })}
        </div>
      </section>
    </div>,
    document.querySelector('.app-theme') ?? document.body,
  );
}

function GachaModal({ progress, runtime, updateProgress, onClose }: { progress: PlayerProgress; runtime: PlatformRuntime; updateProgress(next: PlayerProgress): void; onClose(): void }) {
  const { t } = useI18n();
  const [rewards, setRewards] = useState<GachaReward[] | null>(null);
  const [choiceKind, setChoiceKind] = useState<MilestoneChoiceKind | null>(null);
  const [choiceMessage, setChoiceMessage] = useState('');
  const [error, setError] = useState('');
  const dailyKey = taipeiDailyKey();
  const freeAvailable = progress.dailyFreeTenKey !== dailyKey;
  const totalCollectibles = CHARACTER_SKINS.length + TILE_BACKS.length + TABLES.length;
  const ownedCollectibles = CHARACTER_SKINS.filter((item) => progress.ownedCharacterSkins.includes(item.id)).length
    + TILE_BACKS.filter((item) => progress.ownedTileBacks.includes(item.id)).length
    + TABLES.filter((item) => progress.ownedTables.includes(item.id)).length;
  const nextAccessory = 50 - (progress.totalDraws % 50 || 0);
  const nextCharacter = 100 - (progress.totalDraws % 100 || 0);
  const draw = (count: 1 | 10) => {
    setError('');
    try {
      const free = count === 10 && freeAvailable;
      const result = performGacha(progress, count, free);
      if (free) result.progress.dailyFreeTenKey = dailyKey;
      updateProgress(result.progress);
      setRewards(result.rewards);
    } catch {
      setError(t('gacha.insufficient'));
    }
  };
  const claimChoice = (itemId: string) => {
    if (!choiceKind) return;
    try {
      const result = claimMilestoneChoice(progress, choiceKind, itemId);
      updateProgress(result.progress);
      setChoiceMessage(t(result.duplicate ? 'gacha.choiceClaimedDuplicate' : 'gacha.choiceClaimed'));
      const remainingChoices = choiceKind === 'character' ? result.progress.pendingCharacterChoices : result.progress.pendingAccessoryChoices;
      if (remainingChoices < 1) setChoiceKind(null);
    } catch {
      setChoiceMessage(t('gacha.choiceUnavailable'));
      setChoiceKind(null);
    }
  };
  return (
    <Modal title={t('gacha.title')} onClose={onClose} wide>
      <div className="gacha-layout">
        <div className="gacha-columns">
          <section className="gacha-left">
            <div className="rate-panel">
              <strong>{t('gacha.probabilityTitle')}</strong>
              <span>{t('gacha.probabilityCharacter')}</span><span>{t('gacha.probabilityTileBack')}</span><span>{t('gacha.probabilityTable')}</span>
              <span>{t('gacha.probabilityCoins77')}</span><span>{t('gacha.probabilityCoins777')}</span><span>{t('gacha.probabilityCoins7777')}</span>
              <small>{t('gacha.guarantee')}</small>
            </div>
            <div className="gacha-collection">
              <p className="collection-progress">{t('gacha.collectionProgress', { owned: ownedCollectibles, total: totalCollectibles })}</p>
              {(progress.pendingAccessoryChoices > 0 || progress.pendingCharacterChoices > 0) && <div className="choice-banner">
                {progress.pendingAccessoryChoices > 0 && <button onClick={() => { setChoiceMessage(''); setChoiceKind('accessory'); }}>{t('gacha.accessoryChoices', { count: progress.pendingAccessoryChoices })}</button>}
                {progress.pendingCharacterChoices > 0 && <button onClick={() => { setChoiceMessage(''); setChoiceKind('character'); }}>{t('gacha.characterChoices', { count: progress.pendingCharacterChoices })}</button>}
              </div>}
            </div>
          </section>
          <section className="gacha-right">
            <div className="gacha-machine" aria-hidden="true" />
            <p className="milestone-label">{t('gacha.milestone', { draws: progress.totalDraws, accessory: nextAccessory, character: nextCharacter })}</p>
            {choiceMessage && <p className={choiceMessage === t('gacha.choiceUnavailable') ? 'error-text' : 'success-text'}>{choiceMessage}</p>}
            <div className="gacha-actions">
              <button className="primary-button" disabled={progress.coins < GACHA_COST_ONE} onClick={() => draw(1)}><strong>{t('gacha.one')}</strong><small>{t('gacha.costOne')}</small></button>
              <button className="primary-button accent" disabled={!freeAvailable && progress.coins < GACHA_COST_TEN} onClick={() => draw(10)}><strong>{t('gacha.ten')}</strong><small>{freeAvailable ? t('gacha.freeTen') : t('gacha.costTen')}</small></button>
            </div>
            {!freeAvailable && <small>{t('gacha.freeUsed')}</small>}
            {error && <p className="error-text">{error}</p>}
          </section>
        </div>
      </div>
      {choiceKind && <MilestoneChoiceOverlay kind={choiceKind} progress={progress} runtime={runtime} onClaim={claimChoice} onClose={() => setChoiceKind(null)} />}
      {rewards && <RewardOverlay rewards={rewards} runtime={runtime} onClose={() => setRewards(null)} />}
    </Modal>
  );
}

function TransferModal({ progress, updateProgress, onClose }: { progress: PlayerProgress; updateProgress(next: PlayerProgress): void; onClose(): void }) {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PlayerProgress | null>(null);
  const output = useMemo(() => exportProgress(progress), [progress]);
  const copy = async () => {
    await navigator.clipboard.writeText(output);
    setMessage(t('action.copied'));
  };
  const validate = () => {
    try { setPending(importProgress(input)); setMessage(''); }
    catch { setMessage(t('transfer.invalid')); }
  };
  return (
    <Modal title={t('transfer.title')} onClose={onClose}>
      <div className="transfer-layout">
        <label>{t('transfer.export')}<textarea readOnly value={output} rows={4} /></label>
        <button className="secondary-button" onClick={copy}>{t('action.copy')}</button>
        <label>{t('transfer.import')}<textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder={t('transfer.placeholder')} rows={4} /></label>
        <button className="primary-button" onClick={validate} disabled={!input.trim()}>{t('action.confirm')}</button>
        {message && <p className={message === t('transfer.invalid') ? 'error-text' : 'success-text'}>{message}</p>}
        {pending && <div className="confirm-panel">
          <strong>{t('transfer.confirmTitle')}</strong><p>{t('transfer.confirmBody')}</p>
          <div><button className="secondary-button" onClick={() => setPending(null)}>{t('action.cancel')}</button><button className="danger-button" onClick={() => { updateProgress(pending); setPending(null); setMessage(t('transfer.success')); }}>{t('action.confirm')}</button></div>
        </div>}
      </div>
    </Modal>
  );
}

function OnlineModal({ runtime, progress, onBgmScene, onClose }: { runtime: PlatformRuntime; progress: PlayerProgress; onBgmScene(scene: BgmScene): void; onClose(): void }) {
  const { t } = useI18n();
  const client = useMemo(() => runtime.serverUrl ? new MahjongMultiplayerClient(runtime.serverUrl) : null, [runtime.serverUrl]);
  const [nickname, setNickname] = useState(t('online.defaultName'));
  const [rooms, setRooms] = useState<OpenMahjongRoom[]>([]);
  const [room, setRoom] = useState<MahjongRoom | null>(null);
  const [snapshot, setSnapshot] = useState<OnlineRoomSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    if (!client) return;
    setBusy(true);
    setError('');
    try { setRooms(await client.listRooms()); }
    catch { setError(t('online.connectionError')); }
    finally { setBusy(false); }
  };

  useEffect(() => { void refresh(); }, [client]);
  useEffect(() => {
    if (!room) return undefined;
    const unsubscribe = subscribeRoom(room, setSnapshot);
    return () => unsubscribe();
  }, [room]);
  useEffect(() => () => { if (room) void room.leave(true); }, [room]);
  useEffect(() => {
    if (!room || !snapshot) onBgmScene('base');
    else if (snapshot.phase === 'playing' && snapshot.players.some((player) => player.ready)) onBgmScene('ready');
    else onBgmScene(snapshot.phase === 'playing' ? 'match' : 'room');
  }, [onBgmScene, room, snapshot]);
  useEffect(() => () => onBgmScene('base'), [onBgmScene]);

  const connect = async (roomId?: string) => {
    if (!client || !nickname.trim()) return;
    setBusy(true);
    setError('');
    try {
      const connected = roomId
        ? await client.join(roomId, nickname.trim(), progress.selectedCharacterSkin)
        : await client.create(nickname.trim(), progress.selectedCharacterSkin);
      setRoom(connected);
    } catch {
      setError(t('online.joinError'));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!runtime.serverUrl) {
    return <Modal title={t('home.online')} onClose={onClose}>
      <div className="online-unavailable"><span>🛰️</span><p>{t('online.serverMissing')}</p><code>config/generalConfiguration.json → serverUrl</code></div>
    </Modal>;
  }

  if (room && snapshot) {
    const slots = Array.from({ length: 4 }, (_, slot) => snapshot.players.find((player) => player.slot === slot));
    const isHost = snapshot.hostSessionId === room.sessionId;
    return <Modal title={`${t('online.room')} ${snapshot.code}`} onClose={onClose} wide>
      <div className="online-room-screen">
        <div className={`connection-badge phase-${snapshot.phase}`}>{t(`online.phase.${snapshot.phase}`)}</div>
        <div className="online-player-grid">
          {slots.map((player, slot) => <article className={`online-player-slot ${player ? 'filled' : ''}`} key={slot}>
            <span className="online-avatar">{player?.bot ? '🤖' : player ? '🧑' : '＋'}</span>
            <strong>{player?.name || t('online.emptySlot')}</strong>
            <small>{player?.host ? t('online.host') : player?.bot ? t('online.computer') : player ? t('online.player') : t('online.waitingPlayer')}</small>
          </article>)}
        </div>
        {snapshot.phase === 'waiting' && <div className="online-room-actions">
          <p>{isHost ? t('online.startHint') : t('online.waitHost')}</p>
          <button className="primary-button" disabled={!isHost} onClick={() => room.send(MMSG.start)}>{t('online.start')}</button>
        </div>}
        {snapshot.phase === 'playing' && <div className="online-sync-notice"><strong>{t('online.matchCreated')}</strong><p>{t('online.ruleEnginePending')}</p><small>Match #{snapshot.matchId} · Seed {snapshot.seed}</small></div>}
      </div>
    </Modal>;
  }

  return <Modal title={t('home.online')} onClose={onClose} wide>
    <div className="online-lobby">
      <label>{t('online.nickname')}<input value={nickname} maxLength={16} onChange={(event) => setNickname(event.target.value)} /></label>
      <div className="online-lobby-actions"><button className="primary-button" disabled={busy || !nickname.trim()} onClick={() => void connect()}>{t('online.create')}</button><button className="secondary-button" disabled={busy} onClick={() => void refresh()}>{t('online.refresh')}</button></div>
      <div className="online-room-list">
        <h3>{t('online.roomList')}</h3>
        {busy && <p>{t('online.loading')}</p>}
        {!busy && rooms.length === 0 && <p>{t('online.noRooms')}</p>}
        {rooms.map((available) => <button className="online-room-card" key={available.roomId} disabled={busy || !nickname.trim()} onClick={() => void connect(available.roomId)}>
          <span><strong>{available.code}</strong><small>{available.hostName || t('online.unnamedHost')}</small></span>
          <span>{available.clients}/{available.maxClients}</span>
        </button>)}
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  </Modal>;
}

function claimLabel(option: ClaimOption, t: ReturnType<typeof useI18n>['t']): string {
  const name = t(`single.claim.${option.kind}`);
  return option.kind === 'chi' ? `${name} · ${option.tiles.map(tileLabel).join(' ')}` : name;
}

type ResultStage = 'cutin' | 'score' | 'coins' | null;
type QueuedMatchAction = MatchActionSignal & { id: number };
type MatchUtilityPanel = 'emote' | 'help' | null;
type MatchEmoteBurst = {
  id: number;
  emote: string;
  seat: 0 | 1 | 2 | 3;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  rotation: number;
};

const MATCH_EMOTES = ['😊', '😄', '😮', '😢', '😤', '🤔', '👏', '✨'] as const;
const TAI_HELP_PATTERNS = [
  ['selfDraw', '1'], ['closed', '1'], ['closedSelfDrawBonus', '1'], ['ready', '1'],
  ['flowers', '×1'], ['allTriplets', '4'], ['allHonors', '16'], ['halfFlush', '4'],
  ['fullFlush', '8'], ['bigThreeDragons', '8'], ['smallThreeDragons', '4'],
  ['redDragon', '1'], ['greenDragon', '1'], ['whiteDragon', '1'], ['seatWind', '1'], ['roundWind', '1'],
] as const;

function matchActionLabel(kind: MatchActionKind, t: ReturnType<typeof useI18n>['t']): string {
  if (kind === 'ready') return t('single.readyMarker');
  if (kind === 'selfDraw') return t('single.selfDrawCall');
  if (kind === 'win') return t('single.ronCall');
  return t(`single.claim.${kind}`);
}

function SinglePlayer({ runtime, progress, updateProgress, onBgmScene, onExit }: { runtime: PlatformRuntime; progress: PlayerProgress; updateProgress(next: PlayerProgress): void; onBgmScene(scene: BgmScene): void; onExit(): void }) {
  const { t } = useI18n();
  const [state, setState] = useState(() => createInitialState());
  const [secondsLeft, setSecondsLeft] = useState(TURN_TIME_SECONDS);
  const [readyMode, setReadyMode] = useState(false);
  const [resultStage, setResultStage] = useState<ResultStage>(null);
  const [winLine, setWinLine] = useState(1);
  const [coinDelta, setCoinDelta] = useState(0);
  const [actionQueue, setActionQueue] = useState<QueuedMatchAction[]>([]);
  const [utilityPanel, setUtilityPanel] = useState<MatchUtilityPanel>(null);
  const [autoPlayEnabled, setAutoPlayEnabled] = useState(false);
  const [emoteBursts, setEmoteBursts] = useState<MatchEmoteBurst[]>([]);
  const [lowBalanceEntry] = useState(() => progress.coins < LOW_BALANCE_THRESHOLD);
  const discardSoundCount = useRef(0);
  const previousActionState = useRef(state);
  const nextActionId = useRef(1);
  const nextEmoteId = useRef(1);
  const activeAction = actionQueue[0] ?? null;
  const actionLocked = activeAction !== null;
  const activeHand = state.players[state.currentPlayer];
  const readyBgmActive = state.readyDeclared.some(Boolean);
  const completedDiscardCount = state.players.reduce((count, hand) => count + hand.discards.length + hand.melds.filter((meld) => !meld.concealed).length, 0);
  const turnToken = [state.currentPlayer, state.phase, state.wall.length, state.pendingDiscard?.player ?? '-', state.pendingDiscard?.tile ?? '-', activeHand?.concealed.length ?? 0, activeHand?.melds.length ?? 0, activeHand?.discards.length ?? 0].join(':');
  useEffect(() => {
    setSecondsLeft(TURN_TIME_SECONDS);
    if (state.settlement || actionLocked) return;
    const deadline = Date.now() + TURN_TIME_SECONDS * 1_000;
    const interval = window.setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1_000))), 250);
    const timeout = window.setTimeout(() => setState((current) => autoPlayCurrentTurn(current)), TURN_TIME_SECONDS * 1_000);
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [actionLocked, turnToken, state.settlement]);
  useEffect(() => {
    if (state.settlement || actionLocked) return;
    const shouldAutoPlay = state.currentPlayer !== 0 || autoPlayEnabled || state.readyDeclared[0];
    if (!shouldAutoPlay) return;
    const timer = window.setTimeout(() => setState((current) => {
      if (current.settlement) return current;
      const stillAutoPlaying = current.currentPlayer !== 0 || autoPlayEnabled || current.readyDeclared[0];
      return stillAutoPlaying ? autoPlayCurrentTurn(current) : current;
    }), state.currentPlayer === 0 ? 320 : 620);
    return () => window.clearTimeout(timer);
  }, [actionLocked, autoPlayEnabled, state]);
  useEffect(() => {
    const signals = detectMatchActionSignals(previousActionState.current, state);
    previousActionState.current = state;
    if (signals.length === 0) return;
    setActionQueue((queue) => [
      ...queue,
      ...signals.map((signal) => ({ ...signal, id: nextActionId.current++ })),
    ]);
  }, [state]);
  useEffect(() => {
    if (!activeAction) return;
    if (activeAction.kind === 'ready') playMahjongSfx('ready');
    else if (activeAction.kind === 'win' || activeAction.kind === 'selfDraw') playMahjongSfx('win');
    else playMahjongSfx('special');
    const timer = window.setTimeout(() => {
      if (activeAction.kind === 'win' || activeAction.kind === 'selfDraw') setResultStage('cutin');
      setActionQueue((queue) => queue[0]?.id === activeAction.id ? queue.slice(1) : queue);
    }, matchActionDuration(activeAction.kind));
    return () => window.clearTimeout(timer);
  }, [activeAction]);
  useEffect(() => { onBgmScene(readyBgmActive ? 'ready' : 'match'); }, [onBgmScene, readyBgmActive]);
  useEffect(() => {
    const timer = window.setTimeout(() => playMahjongSfx('tileArrange'), 180);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (completedDiscardCount > discardSoundCount.current) playMahjongSfx('tileDiscard');
    discardSoundCount.current = completedDiscardCount;
  }, [completedDiscardCount]);
  useEffect(() => {
    if (!state.settlement) return;
    setReadyMode(false);
    setWinLine(1 + Math.floor(Math.random() * WIN_LINE_COUNT));
    if (state.winner === null) setResultStage('score');
  }, [state.settlement]);
  const player = state.players[0];
  const kongs = useMemo(() => concealedKongTiles(state, 0), [state]);
  const readyOptions = useMemo(() => readyDiscardIndices(state, 0), [state]);
  const selectedSkin = CHARACTER_SKINS.find((skin) => skin.id === progress.selectedCharacterSkin) ?? CHARACTER_SKINS[0];
  const winnerSkinId = state.winner === 0 ? selectedSkin.id : state.winner === null ? selectedSkin.id : AI_CHARACTER_SKINS[state.winner];
  const winnerSkin = CHARACTER_SKINS.find((skin) => skin.id === winnerSkinId) ?? selectedSkin;
  const participantName = (index: number) => index === 0 ? t('single.you') : t('single.computer', { number: index });
  const winnerName = state.winner === null ? '' : participantName(state.winner);
  const winQuote = t(`single.winLines.${winnerSkin.characterId}.${winLine}`);

  const status = autoPlayEnabled ? t('matchTools.auto.status') : readyMode ? t('single.chooseReadyDiscard') : state.phase === 'claim' && state.pendingDiscard
    ? t('single.claimPrompt', { tile: tileLabel(state.pendingDiscard.tile) })
    : state.currentPlayer === 0 ? state.readyDeclared[0] ? t('single.readyAutoDiscard') : t('single.yourTurn') : t('single.computerThinking');
  const selectedTable = TABLES.find((item) => item.id === progress.selectedTable) ?? TABLES[0];
  const selectedTileBack = TILE_BACKS.find((item) => item.id === progress.selectedTileBack) ?? TILE_BACKS[0];
  const playableIndices = useMemo(() => player.concealed.flatMap((_, index) => {
    const canAct = !autoPlayEnabled && state.currentPlayer === 0 && state.phase === 'discard' && !state.settlement && !actionLocked;
    const readyCandidate = readyMode && readyOptions.includes(index);
    const allowed = canAct && (readyMode ? readyCandidate : !state.readyDeclared[0] || index === player.concealed.length - 1);
    return allowed ? [index] : [];
  }), [actionLocked, autoPlayEnabled, player.concealed, readyMode, readyOptions, state.currentPlayer, state.phase, state.readyDeclared, state.settlement]);
  const participantNames = useMemo(() => [0, 1, 2, 3].map(participantName) as [string, string, string, string], [t]);
  const participantSkins = useMemo(() => [
    selectedSkin.relativePath,
    ...(AI_CHARACTER_SKINS.slice(1).map((skinId, index) => (CHARACTER_SKINS.find((skin) => skin.id === skinId) ?? CHARACTER_SKINS[index + 1]).relativePath)),
  ] as [string, string, string, string], [selectedSkin.relativePath]);
  const settleCoins = () => {
    const pointDelta = state.settlement?.deltas[0] ?? 0;
    const converted = Math.trunc(pointDelta / GAME_POINTS_PER_COIN);
    const adjusted = converted > 0 && lowBalanceEntry ? Math.floor(converted / 2) : converted;
    const nextCoins = Math.max(0, progress.coins + adjusted);
    setCoinDelta(nextCoins - progress.coins);
    updateProgress({ ...progress, coins: nextCoins });
    setResultStage('coins');
  };
  const handlePlayerTileClick = (index: number) => {
    if (actionLocked || !playableIndices.includes(index)) return;
    if (readyMode) {
      setState((current) => declareReady(current, index));
      setReadyMode(false);
      return;
    }
    setState((current) => discardTile(current, index));
  };
  const restart = () => {
    const nextState = createInitialState();
    previousActionState.current = nextState;
    setState(nextState);
    setActionQueue([]);
    setResultStage(null);
    setReadyMode(false);
    setCoinDelta(0);
    playMahjongSfx('tileArrange');
  };
  const toggleAutoPlay = () => {
    const nextEnabled = !autoPlayEnabled;
    setAutoPlayEnabled(nextEnabled);
    setUtilityPanel(null);
    if (nextEnabled) setReadyMode(false);
  };
  const chooseEmote = (emote: string, seat: MatchEmoteBurst['seat'] = 0) => {
    const spread = () => Math.round((Math.random() - .5) * 18);
    const paths: Record<MatchEmoteBurst['seat'], [number, number, number, number]> = {
      0: [spread(), 38 + Math.random() * 5, spread() * .65, 5 + Math.random() * 6],
      1: [-39 - Math.random() * 5, spread(), -5 - Math.random() * 6, spread() * .65],
      2: [spread(), -38 - Math.random() * 5, spread() * .65, -5 - Math.random() * 6],
      3: [39 + Math.random() * 5, spread(), 5 + Math.random() * 6, spread() * .65],
    };
    const [startX, startY, endX, endY] = paths[seat];
    setEmoteBursts((bursts) => [...bursts, {
      id: nextEmoteId.current++,
      emote,
      seat,
      startX,
      startY,
      endX,
      endY,
      rotation: Math.round((Math.random() - .5) * 22),
    }]);
  };
  const matchToolIconStyle = (relativePath: string) => ({
    '--match-tool-icon': `url("${runtime.resolveAsset(relativePath)}")`,
  } as CSSProperties);
  return (
    <main className="single-screen">
      <section className="orientation-gate" role="status" aria-live="polite">
        <span className="orientation-gate-icon" aria-hidden="true" />
        <strong>{t('single.rotateTitle')}</strong>
        <small>{t('single.rotateHint')}</small>
      </section>
      <header className="game-topbar"><button className="secondary-button" onClick={onExit}>← {t('single.exit')}</button><div><strong>{t('single.title')}</strong><small>{t('single.rulesNote')}</small></div><span>{t('single.wall', { count: state.wall.length })}</span></header>
      <div className="match-table-shell">
        <MahjongTable3D
          runtime={runtime}
          state={state}
          tableTexturePath={selectedTable.relativePath}
          tileBackTexturePath={selectedTileBack.relativePath}
          participantNames={participantNames}
          participantSkins={participantSkins}
          status={status}
          readyLabel={t('single.readyMarker')}
          secondsLeft={secondsLeft}
          playableIndices={playableIndices}
          readySelectionActive={readyMode}
          actionCallout={activeAction ? {
            id: activeAction.id,
            seat: activeAction.seat,
            kind: activeAction.kind,
            label: matchActionLabel(activeAction.kind, t),
            imageSrc: runtime.resolveAsset(ASSETS.matchAction[activeAction.kind]),
          } : undefined}
          onPlayerTileClick={handlePlayerTileClick}
        />
        {(state.phase === 'claim' || kongs.length > 0 || readyOptions.length > 0 || readyMode) && !autoPlayEnabled && !state.settlement && !actionLocked && <div className="match-action-bar">
          {state.phase === 'claim' && state.claimOptions.map((option, index) => <button className={`call-button call-${option.kind}`} key={`${option.kind}-${index}`} onClick={() => setState((current) => claimDiscard(current, index))}>{claimLabel(option, t)}</button>)}
          {state.phase === 'claim' && <button className="call-button call-pass" onClick={() => setState(passClaim)}>{t('single.claim.pass')}</button>}
          {state.phase === 'discard' && kongs.map((tile) => <button className="call-button call-kong" key={tile} onClick={() => setState((current) => declareConcealedKong(current, tile))}>{t('single.claim.kong')} · {tileLabel(tile)}</button>)}
          {state.phase === 'discard' && readyOptions.length > 0 && <button className={`call-button call-ready ${readyMode ? 'active' : ''}`} onClick={() => setReadyMode((active) => !active)}>{readyMode ? t('action.cancel') : t('single.declareReady')}</button>}
        </div>}
        <div className="match-emote-flight-layer" aria-live="polite">
          {emoteBursts.map((burst) => <span
            className="match-emote-burst"
            key={burst.id}
            role="status"
            style={{
              '--emote-start-x': `${burst.startX}vw`,
              '--emote-start-y': `${burst.startY}vh`,
              '--emote-end-x': `${burst.endX}vw`,
              '--emote-end-y': `${burst.endY}vh`,
              '--emote-rotation': `${burst.rotation}deg`,
              '--emote-rotation-reverse': `${-burst.rotation}deg`,
              '--emote-rotation-soft': `${Math.round(burst.rotation * .2)}deg`,
              '--emote-rotation-exit': `${Math.round(burst.rotation * -.2)}deg`,
            } as CSSProperties}
            onAnimationEnd={() => setEmoteBursts((bursts) => bursts.filter((item) => item.id !== burst.id))}
          >{burst.emote}</span>)}
        </div>
        {utilityPanel === 'emote' && <section className="match-emote-panel" role="dialog" aria-label={t('matchTools.emote.title')}>
          <header><strong>{t('matchTools.emote.title')}</strong><button onClick={() => setUtilityPanel(null)} aria-label={t('action.close')}>✕</button></header>
          <div>{MATCH_EMOTES.map((emote) => <button key={emote} onClick={() => chooseEmote(emote)} aria-label={t('matchTools.emote.send', { emote })}>{emote}</button>)}</div>
        </section>}
        <nav className="match-tools" aria-label={t('matchTools.label')}>
          <button className={utilityPanel === 'emote' ? 'active' : ''} onClick={() => setUtilityPanel((panel) => panel === 'emote' ? null : 'emote')} title={t('matchTools.emote.title')} aria-label={t('matchTools.emote.title')} aria-pressed={utilityPanel === 'emote'}>
            <span style={matchToolIconStyle(ASSETS.matchEmote)} aria-hidden="true" />
          </button>
          <button className={autoPlayEnabled ? 'active' : ''} onClick={toggleAutoPlay} title={autoPlayEnabled ? t('matchTools.auto.disable') : t('matchTools.auto.enable')} aria-label={autoPlayEnabled ? t('matchTools.auto.disable') : t('matchTools.auto.enable')} aria-pressed={autoPlayEnabled}>
            <span style={matchToolIconStyle(ASSETS.matchAuto)} aria-hidden="true" />
          </button>
          <button onClick={() => setUtilityPanel('help')} title={t('matchTools.help.title')} aria-label={t('matchTools.help.title')}>
            <span style={matchToolIconStyle(ASSETS.matchHelp)} aria-hidden="true" />
          </button>
        </nav>
      </div>

      {utilityPanel === 'help' && <Modal title={t('matchTools.help.title')} onClose={() => setUtilityPanel(null)} wide>
        <div className="match-help">
          <section>
            <h3>{t('matchTools.help.rulesTitle')}</h3>
            <ul>
              <li>{t('matchTools.help.ruleGoal')}</li>
              <li>{t('matchTools.help.ruleTurn')}</li>
              <li>{t('matchTools.help.ruleFlowers')}</li>
              <li>{t('matchTools.help.ruleCalls')}</li>
              <li>{t('matchTools.help.ruleReady')}</li>
            </ul>
          </section>
          <section>
            <h3>{t('matchTools.help.taiTitle')}</h3>
            <div className="match-help-tai-list">{TAI_HELP_PATTERNS.map(([pattern, value]) => <div key={pattern}><span>{t(`single.tai.${pattern}`)}</span><b>{value} {t('single.taiUnit')}</b></div>)}</div>
          </section>
          <section>
            <h3>{t('matchTools.help.scoringTitle')}</h3>
            <p>{t('matchTools.help.scoringFormula')}</p>
            <p>{t('matchTools.help.scoringDiscard')}</p>
            <p>{t('matchTools.help.scoringSelfDraw')}</p>
            <p>{t('matchTools.help.scoringCoins', { points: GAME_POINTS_PER_COIN })}</p>
          </section>
        </div>
      </Modal>}

      {resultStage === 'cutin' && state.winner !== null && <div className="winner-cutin" role="dialog" aria-modal="true" data-ui-sfx="special" onClick={() => setResultStage('score')}>
        <div className="winner-speed-lines" aria-hidden="true" />
        <img src={runtime.resolveAsset(winnerSkin.relativePath)} alt="" />
        <div className="winner-call"><span>{state.winnerBy === 'selfDraw' ? t('single.selfDrawCall') : t('single.ronCall')}</span><strong>{winnerName}</strong><blockquote>「{winQuote}」</blockquote><small>{t('single.tapToContinue')}</small></div>
      </div>}

      {resultStage === 'score' && state.settlement && <div className="result-backdrop"><section className="settlement-panel" role="dialog" aria-modal="true">
        <header><span className="result-emblem">{state.exhausted ? '流' : '和'}</span><div><h2>{state.exhausted ? t('single.draw') : t('single.winner', { name: winnerName })}</h2><p>{state.winnerBy === 'selfDraw' ? t('single.selfDraw') : state.winnerBy === 'discard' ? t('single.ron') : t('single.exhaustiveDraw')}</p></div></header>
        {state.winner !== null && <><div className="tai-total"><span>{t('single.taiTotal')}</span><strong>{state.settlement.tai} {t('single.taiUnit')}</strong></div><div className="tai-patterns">{state.settlement.patterns.map((pattern) => <span key={pattern.id}>{t(`single.tai.${pattern.id}`)} <b>+{pattern.tai}</b></span>)}</div></>}
        <div className="fund-settlement"><h3>{t('single.fundSettlement')}</h3>{state.settlement.deltas.map((delta, index) => <div key={index} className={delta > 0 ? 'positive' : delta < 0 ? 'negative' : ''}><span>{participantName(index)}{state.settlement?.bankruptPlayer === index && <em>{t('single.bankrupt')}</em>}</span><b>{state.points[index].toLocaleString()}</b><strong>{delta > 0 ? '+' : ''}{delta.toLocaleString()}</strong></div>)}</div>
        {state.settlement.bankruptPlayer !== null && <p className="bankruptcy-notice">{t('single.bankruptcyEnd', { name: participantName(state.settlement.bankruptPlayer) })}</p>}
        <button className="primary-button" onClick={settleCoins}>{t('single.confirmSettlement')}</button>
      </section></div>}

      {resultStage === 'coins' && <div className="result-backdrop"><section className="coin-result-panel" role="dialog" aria-modal="true">
        <span>🪙</span><h2>{coinDelta > 0 ? t('single.coinProfit') : coinDelta < 0 ? t('single.coinLoss') : t('single.coinEven')}</h2>
        <div className={`score-delta ${coinDelta >= 0 ? 'positive' : 'negative'}`}>{coinDelta > 0 ? '+' : ''}{coinDelta.toLocaleString()} 🪙</div>
        <small>{t('single.coinConversion', { points: GAME_POINTS_PER_COIN })}</small>
        {lowBalanceEntry && coinDelta > 0 && <p>{t('single.lowBalancePenalty')}</p>}
        <div><button className="primary-button" onClick={restart}>{t('single.restart')}</button><button className="secondary-button" onClick={onExit}>{t('action.back')}</button></div>
      </section></div>}
    </main>
  );
}

function Lobby({ progress, updateProgress, runtime, openModal, startSingle }: {
  progress: PlayerProgress; updateProgress(next: PlayerProgress): void; runtime: PlatformRuntime; openModal(name: ModalName): void; startSingle(): void;
}) {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const skin = CHARACTER_SKINS.find((item) => item.id === progress.selectedCharacterSkin) ?? CHARACTER_SKINS[0];
  const [dialogueLine, setDialogueLine] = useState(() => randomHomeDialogueLine());
  const [bounceCycle, setBounceCycle] = useState(0);
  const [portraitView, setPortraitView] = useState(DEFAULT_PORTRAIT_VIEW);
  const [portraitDragging, setPortraitDragging] = useState(false);
  const portraitPointers = useRef(new Map<number, { x: number; y: number }>());
  const portraitHoldTimer = useRef<number | null>(null);
  const portraitDrag = useRef({ pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0, active: false });
  const portraitPinch = useRef<{ distance: number; scale: number } | null>(null);
  const suppressDialogueClick = useRef(false);
  const characterAsset = runtime.resolveAsset(skin.relativePath);
  const lobbyBackground = runtime.resolveAsset(lobbyBackgroundForOutfit(skin.outfitNumber));
  const logoAsset = runtime.resolveAsset(ASSETS.logoHome);
  const visibilityIcon = runtime.resolveAsset(hidden ? ASSETS.visibilityHide : ASSETS.visibilityView);
  const offlineIcon = runtime.resolveAsset(ASSETS.modeOffline);
  const onlineIcon = runtime.resolveAsset(ASSETS.modeOnline);
  const gachaIcon = runtime.resolveAsset(ASSETS.modeGacha);
  const charaIcon = runtime.resolveAsset(ASSETS.featureChara);
  const equipmentIcon = runtime.resolveAsset(ASSETS.featureEquipment);
  const languageIcon = runtime.resolveAsset(ASSETS.utilityLanguage);
  const sfxIcon = runtime.resolveAsset(progress.settings.sfxEnabled ? ASSETS.utilitySfxOn : ASSETS.utilitySfxOff);
  const bgmIcon = runtime.resolveAsset(progress.settings.bgmEnabled ? ASSETS.utilityBgmOn : ASSETS.utilityBgmOff);
  const transferIcon = runtime.resolveAsset(ASSETS.utilityTransfer);
  const portraitFraming = LOBBY_PORTRAIT_FRAMING[skin.characterId];
  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);
  useEffect(() => {
    setDialogueLine(randomHomeDialogueLine());
    setBounceCycle(0);
  }, [skin.characterId]);
  const clearPortraitHold = () => {
    if (portraitHoldTimer.current !== null) window.clearTimeout(portraitHoldTimer.current);
    portraitHoldTimer.current = null;
  };
  useEffect(() => () => clearPortraitHold(), []);
  useEffect(() => {
    if (hidden) return;
    clearPortraitHold();
    portraitPointers.current.clear();
    portraitPinch.current = null;
    portraitDrag.current.active = false;
    setPortraitDragging(false);
  }, [hidden]);
  const rerollDialogue = () => {
    setDialogueLine((current) => randomHomeDialogueLine(current));
    setBounceCycle((current) => current + 1);
  };
  const beginPortraitGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!hidden) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can be unavailable in some embedded WebViews.
    }
    suppressDialogueClick.current = false;
    portraitPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (portraitPointers.current.size >= 2) {
      clearPortraitHold();
      portraitDrag.current.active = false;
      setPortraitDragging(false);
      portraitPinch.current = { distance: pointerDistance(portraitPointers.current), scale: portraitView.scale };
      suppressDialogueClick.current = true;
      return;
    }
    portraitDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: portraitView.x,
      originY: portraitView.y,
      active: false,
    };
    clearPortraitHold();
    portraitHoldTimer.current = window.setTimeout(() => {
      portraitDrag.current.active = true;
      suppressDialogueClick.current = true;
      setPortraitDragging(true);
    }, PORTRAIT_HOLD_DELAY_MS);
  };
  const movePortraitGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!hidden || !portraitPointers.current.has(event.pointerId)) return;
    portraitPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (portraitPointers.current.size >= 2 && portraitPinch.current) {
      event.preventDefault();
      const distance = pointerDistance(portraitPointers.current);
      const scale = clampPortraitScale(portraitPinch.current.scale * distance / Math.max(1, portraitPinch.current.distance));
      setPortraitView((current) => ({ ...current, scale }));
      suppressDialogueClick.current = true;
      return;
    }
    if (!portraitDrag.current.active || portraitDrag.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPortraitView((current) => ({
      ...current,
      x: portraitDrag.current.originX + event.clientX - portraitDrag.current.startX,
      y: portraitDrag.current.originY + event.clientY - portraitDrag.current.startY,
    }));
  };
  const endPortraitGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!hidden) return;
    clearPortraitHold();
    portraitPointers.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been cancelled by the operating system.
    }
    if (portraitDrag.current.pointerId === event.pointerId) portraitDrag.current.active = false;
    if (portraitPointers.current.size < 2) portraitPinch.current = null;
    if (portraitPointers.current.size === 0) setPortraitDragging(false);
  };
  const zoomPortrait = (event: ReactWheelEvent<HTMLButtonElement>) => {
    if (!hidden) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0014);
    setPortraitView((current) => ({ ...current, scale: clampPortraitScale(current.scale * factor) }));
  };
  const handleCharacterClick = () => {
    if (suppressDialogueClick.current) {
      suppressDialogueClick.current = false;
      return;
    }
    rerollDialogue();
  };
  const toggleUiVisibility = () => {
    if (!hidden) {
      clearPortraitHold();
      portraitPointers.current.clear();
      portraitPinch.current = null;
      portraitDrag.current.active = false;
      suppressDialogueClick.current = false;
      setPortraitDragging(false);
      setPortraitView({ ...DEFAULT_PORTRAIT_VIEW });
    }
    setHidden((value) => !value);
  };
  const utilityActions = [
    { id: 'language', icon: languageIcon, label: t('action.language'), onClick: () => openModal('language') },
    { id: 'sfx', icon: sfxIcon, label: t('action.sfx'), onClick: () => updateProgress({ ...progress, settings: { ...progress.settings, sfxEnabled: !progress.settings.sfxEnabled } }) },
    { id: 'bgm', icon: bgmIcon, label: t('action.bgm'), onClick: () => updateProgress({ ...progress, settings: { ...progress.settings, bgmEnabled: !progress.settings.bgmEnabled } }) },
    { id: 'transfer', icon: transferIcon, label: t('action.transfer'), onClick: () => openModal('transfer') },
  ];
  return (
    <main className={`lobby-shell ${hidden ? 'ui-hidden' : ''}`} style={{
      '--lobby-background': `url("${lobbyBackground}")`,
      '--portrait-height': portraitFraming.height,
      '--portrait-max-height': portraitFraming.maxHeight,
    } as CSSProperties}>
      <button
        className="eye-toggle"
        style={{ '--eye-icon': `url("${visibilityIcon}")` } as CSSProperties}
        onClick={toggleUiVisibility}
        aria-label={hidden ? t('home.showUi') : t('home.hideUi')}
      />
      <section className="character-stage">
        <div className={`character-aura tint-${skin.outfitNumber}`} />
        <button
          className={`character-reroll ${hidden ? 'is-inspectable' : ''} ${portraitDragging ? 'is-dragging' : ''}`}
          type="button"
          onClick={handleCharacterClick}
          onPointerDown={beginPortraitGesture}
          onPointerMove={movePortraitGesture}
          onPointerUp={endPortraitGesture}
          onPointerCancel={endPortraitGesture}
          onWheel={zoomPortrait}
          onContextMenu={(event) => { if (hidden) event.preventDefault(); }}
          aria-label={t('home.rerollLine')}
        >
          <span className="character-pan-layer" style={{ transform: `translate3d(${hidden ? portraitView.x : 0}px, ${hidden ? portraitView.y : 0}px, 0)` }}>
            <span className="character-zoom-layer" style={{ transform: `scale(${hidden ? portraitView.scale : 1})` }}>
              <span key={`${skin.id}-${bounceCycle}`} className={`character-bounce-layer ${bounceCycle > 0 ? 'is-bouncing' : ''}`}>
                <img className="character-art" src={characterAsset} alt={characterName(skin.characterId, t)} />
              </span>
            </span>
          </span>
        </button>
        <div className="character-dialogue" aria-live="polite">
          <strong>{characterName(skin.characterId, t)}</strong>
          <span key={`${skin.characterId}-${dialogueLine}`}>{t(`home.line.${skin.characterId}.${dialogueLine + 1}`)}</span>
        </div>
      </section>
      <section className="lobby-ui">
        <header className="lobby-header">
          <div className="coin-display"><span>🪙</span><div><small>{t('home.coins')}</small><strong>{progress.coins.toLocaleString()}</strong></div></div>
          <div className="brand-block"><img className="brand-logo" src={logoAsset} alt={`${t('app.subtitle')} ${t('app.title')}`} /></div>
        </header>
        <div className="lobby-main-actions">
          <div className="mode-actions">
            <button className="mode-button offline" onClick={startSingle}><span className="mode-icon" style={{ '--mode-icon': `url("${offlineIcon}")` } as CSSProperties} aria-hidden="true" /><strong>{t('home.offline')}</strong></button>
            <button className="mode-button online" onClick={() => openModal('online')}><span className="mode-icon" style={{ '--mode-icon': `url("${onlineIcon}")` } as CSSProperties} aria-hidden="true" /><strong>{t('home.online')}</strong></button>
            <button className="mode-button gacha" onClick={() => openModal('gacha')}><span className="mode-icon" style={{ '--mode-icon': `url("${gachaIcon}")` } as CSSProperties} aria-hidden="true" /><strong>{t('action.gacha')}</strong></button>
          </div>
          <div className="feature-actions">
            <button className="feature-button characters" onClick={() => openModal('characters')}><span className="feature-icon" style={{ '--feature-icon': `url("${charaIcon}")` } as CSSProperties} aria-hidden="true" /><strong>{t('action.characters')}</strong></button>
            <button className="feature-button equipment" onClick={() => openModal('equipment')}><span className="feature-icon" style={{ '--feature-icon': `url("${equipmentIcon}")` } as CSSProperties} aria-hidden="true" /><strong>{t('action.equipment')}</strong></button>
          </div>
        </div>
        <nav className="utility-actions">{utilityActions.map((action) => <button key={action.id} className="utility-button" data-ui-sfx-toggle={action.id === 'sfx' ? '' : undefined} onClick={action.onClick} title={action.label}><span className="utility-icon" style={{ '--utility-icon': `url("${action.icon}")` } as CSSProperties} aria-hidden="true" /><small>{action.label}</small></button>)}</nav>
      </section>
    </main>
  );
}

function GameApp({ runtime, progress, updateProgress }: { runtime: PlatformRuntime; progress: PlayerProgress; updateProgress(next: PlayerProgress): void }) {
  const { t } = useI18n();
  const [modal, setModal] = useState<ModalName>(null);
  const [screen, setScreen] = useState<'lobby' | 'single'>('lobby');
  const [bgmScene, setBgmScene] = useState<BgmScene>('base');
  return <>
    <BgmPlayer runtime={runtime} scene={bgmScene} enabled={progress.settings.bgmEnabled} />
    <UiSfxPlayer runtime={runtime} enabled={progress.settings.sfxEnabled} />
    {screen === 'single'
      ? <SinglePlayer runtime={runtime} progress={progress} updateProgress={updateProgress} onBgmScene={setBgmScene} onExit={() => { releaseOrientationLock(); setBgmScene('base'); setScreen('lobby'); }} />
      : <>
        <Lobby progress={progress} updateProgress={updateProgress} runtime={runtime} openModal={setModal} startSingle={() => { requestLandscapeOrientation(); setBgmScene('match'); setScreen('single'); }} />
        {modal === 'language' && <Modal title={t('language.title')} onClose={() => setModal(null)}><div className="language-list">{SUPPORTED_LOCALES.map((locale) => <button key={locale} className={progress.settings.locale === locale ? 'active' : ''} onClick={() => updateProgress({ ...progress, settings: { ...progress.settings, locale } })}>{t(`language.${locale}`)}</button>)}</div></Modal>}
        {modal === 'characters' && <CharacterModal progress={progress} runtime={runtime} updateProgress={updateProgress} onClose={() => setModal(null)} />}
        {modal === 'equipment' && <EquipmentModal progress={progress} runtime={runtime} updateProgress={updateProgress} onClose={() => setModal(null)} />}
        {modal === 'gacha' && <GachaModal progress={progress} runtime={runtime} updateProgress={updateProgress} onClose={() => setModal(null)} />}
        {modal === 'transfer' && <TransferModal progress={progress} updateProgress={updateProgress} onClose={() => setModal(null)} />}
        {modal === 'online' && <OnlineModal runtime={runtime} progress={progress} onBgmScene={setBgmScene} onClose={() => { setBgmScene('base'); setModal(null); }} />}
        {modal === 'daily' && <Modal title={t('daily.reward')} onClose={() => setModal(null)}><div className="daily-reward"><span>🪙</span><strong>30,000</strong><p>{t('daily.claimed')}</p><small>{t('daily.reset')}</small></div><button className="primary-button" onClick={() => setModal(null)}>{t('action.confirm')}</button></Modal>}
      </>}
  </>;
}

export function App({ runtime }: { runtime: PlatformRuntime }) {
  const [initial] = useState(() => {
    const loaded = loadProgress();
    const key = taipeiDailyKey();
    if (loaded.dailyRewardKey === key) return { progress: loaded, showDaily: false };
    return { progress: { ...loaded, coins: loaded.coins + 30_000, dailyRewardKey: key }, showDaily: true };
  });
  const [progress, setProgress] = useState<PlayerProgress>(initial.progress);
  const [showDaily, setShowDaily] = useState(initial.showDaily);
  useEffect(() => { saveProgress(progress); }, [progress]);
  const locale: Locale = progress.settings.locale;
  const selectedSkin = CHARACTER_SKINS.find((skin) => skin.id === progress.selectedCharacterSkin) ?? CHARACTER_SKINS[0];
  const uiTheme = uiThemeForOutfit(selectedSkin.outfitNumber);
  return (
    <I18nProvider locale={locale} packs={runtime.languagePacks}>
      <div className="app-theme" style={{
        '--theme-accent': uiTheme.accent,
        '--theme-accent-deep': uiTheme.accentDeep,
        '--theme-secondary': uiTheme.secondary,
        '--theme-tint-rgb': uiTheme.tintRgb,
        '--asset-ui-sparkle': `url("${runtime.resolveAsset(ASSETS.uiSparkle)}")`,
      } as CSSProperties}>
        <GameApp runtime={runtime} progress={progress} updateProgress={setProgress} />
        {showDaily && <DailyBridge onClose={() => setShowDaily(false)} />}
      </div>
    </I18nProvider>
  );
}

function DailyBridge({ onClose }: { onClose(): void }) {
  const { t } = useI18n();
  return <Modal title={t('daily.reward')} onClose={onClose}><div className="daily-reward"><span>🪙</span><strong>30,000</strong><p>{t('daily.claimed')}</p><small>{t('daily.reset')}</small></div><button className="primary-button" onClick={onClose}>{t('action.confirm')}</button></Modal>;
}
