import { useEffect, useRef, type CSSProperties } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { tileFaceAsset } from './config/assets';
import type { MahjongState, Meld, PlayerHand, TileId } from './game/mahjong';
import type { MatchActionKind, MatchSeat } from './game/matchActionEvents';
import { MatchActionCallout } from './MatchActionCallout';
import type { PlatformRuntime } from './services/resourceLoader';
import { playMahjongSfx } from './services/UiSfxPlayer';
import './MahjongTable3D.css';

const TABLE_SIZE = 15.4;
const TILE_WIDTH = 0.66;
const TILE_HEIGHT = 0.92;
const TILE_DEPTH = 0.18;
const PLAYER_TILE_SCALE = 0.86;
const OPPONENT_HAND_TILE_SCALE = 0.86;
const RIVER_TILE_SCALE = 0.67;
const OPEN_TILE_SCALE = 0.8;
const FLOWER_TILE_SCALE = 0.68;
const WALL_TILE_SCALE = 0.54;
const PLAYER_HAND_LEFT = -4.7;
const PLAYER_HAND_CAMERA_Y = -3.24;
const PLAYER_HAND_CAMERA_Z = -11;
const SEAT_HAND_Z = 6.02;
const SEAT_FLOWER_Z = 5.55;
const SEAT_WALL_Z = 4.96;
const SELF_DRAW_TILE_Z = 4.3;
const STATUS_HINT_Z = 4.48;
const SEAT_ROW_LEFT = -5.45;
const SEAT_ROW_RIGHT = 5.45;
const SEAT_ROTATIONS = [0, -Math.PI / 2, Math.PI, Math.PI / 2] as const;
const RIVER_COLUMNS = 5;
const RIVER_ROWS = 4;
const RIVER_STEP_X = 0.485;
const RIVER_STEP_Z = 0.625;
const RIVER_ORIGIN_Z = 1.64;
const RIVER_CENTER_X = ((RIVER_COLUMNS - 1) / 2 - 2.5) * RIVER_STEP_X;
const RIVER_CENTER_Z = RIVER_ORIGIN_Z + ((RIVER_ROWS - 1) / 2) * RIVER_STEP_Z;
const CAMERA_FOV = 35;
const CAMERA_HEIGHT = 15.1;
const CAMERA_DISTANCE = 12.15;
const CAMERA_TARGET_Z = 1.65;
const CENTER_DISPLAY_RESOLUTION = 512;

type SeatIndex = 0 | 1 | 2 | 3;

interface MahjongTable3DProps {
  runtime: PlatformRuntime;
  state: MahjongState;
  tableTexturePath: string;
  tileBackTexturePath: string;
  participantNames: [string, string, string, string];
  participantSkins: [string, string, string, string];
  status: string;
  readyLabel: string;
  secondsLeft: number;
  playableIndices: number[];
  readySelectionActive: boolean;
  actionCallout?: {
    id: number;
    seat: MatchSeat;
    kind: MatchActionKind;
    label: string;
    imageSrc: string;
  };
  onPlayerTileClick(index: number): void;
}

interface TableScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  content: THREE.Group;
  playerHand: THREE.Group;
  raycaster: THREE.Raycaster;
  pointer: THREE.Vector2;
  selectableMeshes: THREE.Mesh[];
  hovered: THREE.Object3D | null;
  textureLoader: THREE.TextureLoader;
  textures: Map<string, THREE.Texture>;
  centerDisplayCanvas: HTMLCanvasElement;
  centerDisplayTexture: THREE.CanvasTexture;
  winningTileGlowTexture: THREE.CanvasTexture;
}

interface TileVisualOptions {
  tile?: TileId;
  faceDown?: boolean;
  scale: number;
  flat?: boolean;
  rotation?: number;
  interactiveIndex?: number;
  highlighted?: boolean;
  disabled?: boolean;
  winning?: boolean;
}

const bodyGeometry = new RoundedBoxGeometry(TILE_WIDTH, TILE_HEIGHT, TILE_DEPTH, 3, 0.055);
const faceGeometry = new THREE.PlaneGeometry(TILE_WIDTH * 0.84, TILE_HEIGHT * 0.84);
const winningGlowGeometry = new THREE.PlaneGeometry(TILE_WIDTH * 2.45, TILE_HEIGHT * 1.95);

function createWinningTileGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 192;
  const context = canvas.getContext('2d');
  if (context) {
    const glow = context.createRadialGradient(96, 96, 12, 96, 96, 96);
    glow.addColorStop(0, 'rgba(255, 255, 235, 1)');
    glow.addColorStop(0.24, 'rgba(255, 224, 112, .94)');
    glow.addColorStop(0.52, 'rgba(255, 174, 42, .62)');
    glow.addColorStop(0.78, 'rgba(255, 119, 18, .2)');
    glow.addColorStop(1, 'rgba(255, 106, 0, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function setObjectPosition(object: THREE.Object3D, x: number, z: number): void {
  object.position.x = x;
  object.position.z = z;
}

function createSeatGroup(parent: THREE.Group, seat: SeatIndex): THREE.Group {
  const group = new THREE.Group();
  group.rotation.y = SEAT_ROTATIONS[seat];
  parent.add(group);
  return group;
}

function tableCoverTexture(texture: THREE.Texture): void {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = image?.width ?? 1;
  const height = image?.height ?? 1;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  if (width > height) {
    const visible = height / width;
    texture.repeat.set(visible, 1);
    texture.offset.set((1 - visible) / 2, 0);
  } else if (height > width) {
    const visible = width / height;
    texture.repeat.set(1, visible);
    texture.offset.set(0, (1 - visible) / 2);
  }
  texture.needsUpdate = true;
}

function loadTexture(tableScene: TableScene, url: string, cover = false): Promise<THREE.Texture> {
  const cached = tableScene.textures.get(url);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve, reject) => {
    tableScene.textureLoader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, tableScene.renderer.capabilities.getMaxAnisotropy());
      if (cover) tableCoverTexture(texture);
      tableScene.textures.set(url, texture);
      resolve(texture);
    }, undefined, reject);
  });
}

function makeTile(
  tableScene: TableScene,
  faceTextures: Map<TileId, THREE.Texture>,
  backTexture: THREE.Texture,
  options: TileVisualOptions,
): THREE.Group {
  const scale = options.scale;
  const tile = new THREE.Group();
  // Seat direction is a world-space yaw, while a table tile's face-down pose is
  // a local pitch. YXZ keeps those two rotations independent for the side seats.
  tile.rotation.order = 'YXZ';
  const body = new THREE.Mesh(bodyGeometry, new THREE.MeshStandardMaterial({
    color: options.disabled ? 0x747b82 : 0xfffdf6,
    roughness: 0.42,
    metalness: 0.02,
    emissive: options.winning ? 0xffa820 : 0x000000,
    emissiveIntensity: options.winning ? 0.9 : 0,
  }));
  body.castShadow = true;
  body.receiveShadow = true;
  tile.add(body);

  const texture = options.faceDown ? backTexture : options.tile ? faceTextures.get(options.tile) : undefined;
  if (texture) {
    const face = new THREE.Mesh(faceGeometry, new THREE.MeshStandardMaterial({
      map: texture,
      color: options.disabled ? 0x666b70 : 0xffffff,
      transparent: true,
      roughness: 0.34,
      metalness: 0,
      depthWrite: true,
      emissive: options.winning ? 0xffad21 : 0x000000,
      emissiveIntensity: options.winning ? 0.52 : 0,
    }));
    face.position.z = TILE_DEPTH / 2 + 0.006;
    face.renderOrder = 2;
    tile.add(face);
  }

  if (options.highlighted || options.winning) {
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(bodyGeometry, 28),
      new THREE.LineBasicMaterial({ color: options.winning ? 0xffbd25 : 0xffd766, transparent: true, opacity: 0.96 }),
    );
    tile.add(edge);
  }

  if (options.winning) {
    const halo = new THREE.Mesh(
      winningGlowGeometry,
      new THREE.MeshBasicMaterial({
        map: tableScene.winningTileGlowTexture,
        color: 0xffd36a,
        transparent: true,
        opacity: 0.94,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    halo.position.z = -TILE_DEPTH / 2 - 0.008;
    tile.add(halo);
    const winLight = new THREE.PointLight(0xffc24a, 4.6, 3.15, 1.7);
    winLight.position.set(0, 0.24, 0.42);
    tile.add(winLight);
  }

  if (options.flat) {
    tile.rotation.x = -Math.PI / 2;
    tile.position.y = TILE_DEPTH * scale / 2 + 0.018;
  } else {
    tile.position.y = TILE_HEIGHT * scale / 2 + 0.018;
  }
  tile.rotation.y = options.rotation ?? 0;
  tile.scale.setScalar(scale);

  if (options.interactiveIndex !== undefined) {
    tile.userData.playerTileIndex = options.interactiveIndex;
    tile.userData.baseY = tile.position.y;
    body.userData.playerTileIndex = options.interactiveIndex;
    body.userData.tileRoot = tile;
    tableScene.selectableMeshes.push(body);
  }
  return tile;
}

function addLineup(parent: THREE.Group, objects: THREE.Object3D[], originX: number, originZ: number, stepX: number, stepZ: number, rotation = 0): void {
  objects.forEach((object, index) => {
    setObjectPosition(object, originX + stepX * index, originZ + stepZ * index);
    object.rotation.y = rotation;
    parent.add(object);
  });
}

function setHudRendering(object: THREE.Object3D): void {
  let renderOrder = 100;
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments)) return;
    child.castShadow = false;
    child.receiveShadow = false;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.depthTest = false;
      material.depthWrite = false;
      material.transparent = true;
    });
    child.renderOrder = renderOrder;
    renderOrder += 1;
  });
}

function drawCenterDisplay(tableScene: TableScene, wallCount: number, secondsLeft: number): void {
  const canvas = tableScene.centerDisplayCanvas;
  const context = canvas.getContext('2d');
  if (!context) return;
  const warning = secondsLeft <= 10;
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = 'rgba(8, 22, 40, .9)';
  context.strokeStyle = 'rgba(169, 235, 255, .88)';
  context.lineWidth = 7;
  context.beginPath();
  context.roundRect(22, 22, 468, 468, 54);
  context.fill();
  context.stroke();

  context.strokeStyle = 'rgba(93, 191, 225, .36)';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(38, 38, 436, 436, 42);
  context.stroke();
  context.beginPath();
  context.moveTo(256, 58);
  context.lineTo(256, 454);
  context.stroke();

  context.fillStyle = '#9cecff';
  context.font = '700 178px "Noto Serif TC", "Microsoft JhengHei", serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('東', 145, 278);

  context.fillStyle = '#fff0a3';
  context.font = '800 86px system-ui, sans-serif';
  context.fillText(String(wallCount), 365, 157);

  context.fillStyle = warning ? 'rgba(190, 53, 72, .94)' : 'rgba(17, 48, 72, .94)';
  context.strokeStyle = warning ? '#ff9aa8' : '#8fe7fa';
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(278, 238, 177, 118, 59);
  context.fill();
  context.stroke();

  context.strokeStyle = '#9cecff';
  context.lineWidth = 8;
  context.beginPath();
  context.arc(321, 297, 25, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(321, 297);
  context.lineTo(321, 278);
  context.moveTo(321, 297);
  context.lineTo(337, 297);
  context.stroke();

  context.fillStyle = '#f8fdff';
  context.font = '800 58px system-ui, sans-serif';
  context.fillText(String(secondsLeft), 402, 300);

  tableScene.centerDisplayTexture.needsUpdate = true;
}

function addRiver(
  parent: THREE.Group,
  tableScene: TableScene,
  faceTextures: Map<TileId, THREE.Texture>,
  backTexture: THREE.Texture,
  tiles: TileId[],
  highlightLast: boolean,
): void {
  tiles.forEach((tileId, index) => {
    const column = index % RIVER_COLUMNS;
    const row = Math.floor(index / RIVER_COLUMNS);
    const tile = makeTile(tableScene, faceTextures, backTexture, {
      tile: tileId,
      flat: true,
      scale: RIVER_TILE_SCALE,
      winning: highlightLast && index === tiles.length - 1,
    });
    setObjectPosition(tile, (column - 2.5) * RIVER_STEP_X, RIVER_ORIGIN_Z + row * RIVER_STEP_Z);
    parent.add(tile);
  });
}

function flattenedMeldTiles(melds: Meld[]): { tile: TileId; faceDown: boolean }[] {
  return melds.flatMap((meld) => meld.tiles.map((tile, index) => ({
    tile,
    faceDown: meld.concealed && (index === 0 || index === meld.tiles.length - 1),
  })));
}

function addOpenTiles(
  parent: THREE.Group,
  tableScene: TableScene,
  faceTextures: Map<TileId, THREE.Texture>,
  backTexture: THREE.Texture,
  hand: PlayerHand,
): void {
  const openTiles = flattenedMeldTiles(hand.melds);
  if (openTiles.length === 0) return;
  const step = TILE_WIDTH * OPEN_TILE_SCALE;
  openTiles.forEach((entry, index) => {
    const tile = makeTile(tableScene, faceTextures, backTexture, { tile: entry.tile, faceDown: entry.faceDown, flat: true, scale: OPEN_TILE_SCALE });
    setObjectPosition(tile, SEAT_ROW_RIGHT - index * step, SEAT_HAND_Z);
    parent.add(tile);
  });
}

function addFlowers(
  parent: THREE.Group,
  tableScene: TableScene,
  faceTextures: Map<TileId, THREE.Texture>,
  backTexture: THREE.Texture,
  flowers: TileId[],
): void {
  const step = 0.49;
  flowers.forEach((tileId, index) => {
    const tile = makeTile(tableScene, faceTextures, backTexture, { tile: tileId, flat: true, scale: FLOWER_TILE_SCALE });
    setObjectPosition(tile, (index - (flowers.length - 1) / 2) * step, SEAT_FLOWER_Z);
    parent.add(tile);
  });
}

function wallCountForSeat(total: number, seat: SeatIndex): number {
  const base = Math.floor(total / 4);
  return base + (seat < total % 4 ? 1 : 0);
}

function addWall(
  parent: THREE.Group,
  tableScene: TableScene,
  faceTextures: Map<TileId, THREE.Texture>,
  backTexture: THREE.Texture,
  count: number,
): void {
  const stacks = Math.ceil(count / 2);
  const step = TILE_WIDTH * WALL_TILE_SCALE * 0.98;
  for (let index = 0; index < count; index += 1) {
    const stack = Math.floor(index / 2);
    const level = index % 2;
    const tile = makeTile(tableScene, faceTextures, backTexture, { faceDown: true, flat: true, scale: WALL_TILE_SCALE });
    tile.position.y += level * TILE_DEPTH * WALL_TILE_SCALE * 0.92;
    setObjectPosition(tile, (stack - (stacks - 1) / 2) * step, SEAT_WALL_Z);
    parent.add(tile);
  }
}

function addPlayerHand(
  parent: THREE.Group,
  tableScene: TableScene,
  faceTextures: Map<TileId, THREE.Texture>,
  backTexture: THREE.Texture,
  state: MahjongState,
  playableIndices: Set<number>,
  readySelectionActive: boolean,
): void {
  const revealWinner = state.settlement?.reason === 'win' && state.winner === 0;
  const tiles = state.players[0].concealed;
  const step = TILE_WIDTH * PLAYER_TILE_SCALE * 1.02;
  const drawnIndex = state.lastDrawn === null ? -1 : tiles.lastIndexOf(state.lastDrawn);
  const winningTile = revealWinner && state.winnerBy === 'selfDraw' ? state.lastDrawn : null;
  const winningIndex = winningTile === null ? -1 : tiles.lastIndexOf(winningTile);
  const separatedIndex = revealWinner ? -1 : drawnIndex;
  const separatedGap = separatedIndex >= 0 ? 0.28 : 0;
  const visibleTiles = tiles
    .map((tileId, index) => ({ tileId, index }))
    .filter(({ index }) => index !== winningIndex);
  visibleTiles.forEach(({ tileId, index }, displayIndex) => {
    const isDrawn = index === drawnIndex;
    const tile = makeTile(tableScene, faceTextures, backTexture, {
      tile: tileId,
      scale: PLAYER_TILE_SCALE,
      interactiveIndex: playableIndices.has(index) ? index : undefined,
      highlighted: !readySelectionActive && isDrawn && !revealWinner,
      disabled: readySelectionActive && !playableIndices.has(index),
    });
    setObjectPosition(tile, PLAYER_HAND_LEFT + displayIndex * step + (index === separatedIndex ? separatedGap : 0), 0);
    setHudRendering(tile);
    parent.add(tile);
  });
}

function addOpponentConcealedHand(
  parent: THREE.Group,
  tableScene: TableScene,
  faceTextures: Map<TileId, THREE.Texture>,
  backTexture: THREE.Texture,
  state: MahjongState,
  seat: SeatIndex,
): void {
  const revealWinner = state.settlement?.reason === 'win' && state.winner === seat;
  const tiles = state.players[seat].concealed;
  const winningTile = revealWinner && state.winnerBy === 'selfDraw' ? state.lastDrawn : null;
  const winningIndex = winningTile === null ? -1 : tiles.lastIndexOf(winningTile);
  const scale = OPPONENT_HAND_TILE_SCALE;
  const step = TILE_WIDTH * scale * 0.96;
  const visibleTiles = tiles
    .map((tileId, index) => ({ tileId, index }))
    .filter(({ index }) => index !== winningIndex);
  visibleTiles.forEach(({ tileId }, displayIndex) => {
    const tile = makeTile(tableScene, faceTextures, backTexture, {
      tile: tileId,
      faceDown: !revealWinner,
      scale,
    });
    setObjectPosition(tile, SEAT_ROW_LEFT + displayIndex * step, SEAT_HAND_Z);
    tile.rotation.y = Math.PI;
    parent.add(tile);
  });
}

function addSelfDrawWinningTile(
  parent: THREE.Group,
  tableScene: TableScene,
  faceTextures: Map<TileId, THREE.Texture>,
  backTexture: THREE.Texture,
  state: MahjongState,
  seat: SeatIndex,
): void {
  if (
    state.settlement?.reason !== 'win'
    || state.winnerBy !== 'selfDraw'
    || state.winner !== seat
    || state.lastDrawn === null
  ) return;
  const tile = makeTile(tableScene, faceTextures, backTexture, {
    tile: state.lastDrawn,
    flat: true,
    scale: PLAYER_TILE_SCALE,
    winning: true,
  });
  setObjectPosition(tile, 0, SELF_DRAW_TILE_Z);
  tile.position.y += 0.05;
  parent.add(tile);
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh || child instanceof THREE.LineSegments)) return;
    const material = child.material as THREE.Material | THREE.Material[];
    (Array.isArray(material) ? material : [material]).forEach((entry) => entry.dispose());
  });
}

function participantStyle(seat: SeatIndex): CSSProperties {
  return { '--seat-index': seat } as CSSProperties;
}

export function MahjongTable3D({
  runtime,
  state,
  tableTexturePath,
  tileBackTexturePath,
  participantNames,
  participantSkins,
  status,
  readyLabel,
  secondsLeft,
  playableIndices,
  readySelectionActive,
  actionCallout,
  onPlayerTileClick,
}: MahjongTable3DProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const statusHintRef = useRef<HTMLDivElement>(null);
  const tableSceneRef = useRef<TableScene | null>(null);
  const onPlayerTileClickRef = useRef(onPlayerTileClick);
  onPlayerTileClickRef.current = onPlayerTileClick;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'match-three-canvas';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 80);
    camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
    camera.lookAt(0, 0, CAMERA_TARGET_Z);
    scene.add(new THREE.HemisphereLight(0xf8fbff, 0x31435d, 2));
    const key = new THREE.DirectionalLight(0xffffff, 2.45);
    key.position.set(-5, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8edbff, 0.8);
    fill.position.set(8, 6, -7);
    scene.add(fill);

    const content = new THREE.Group();
    scene.add(content);
    const playerHand = new THREE.Group();
    playerHand.position.set(0, PLAYER_HAND_CAMERA_Y, PLAYER_HAND_CAMERA_Z);
    camera.localToWorld(playerHand.position);
    playerHand.quaternion.copy(camera.quaternion);
    scene.add(playerHand);
    const centerDisplayCanvas = document.createElement('canvas');
    centerDisplayCanvas.width = CENTER_DISPLAY_RESOLUTION;
    centerDisplayCanvas.height = CENTER_DISPLAY_RESOLUTION;
    const centerDisplayTexture = new THREE.CanvasTexture(centerDisplayCanvas);
    centerDisplayTexture.colorSpace = THREE.SRGBColorSpace;
    centerDisplayTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const winningTileGlowTexture = createWinningTileGlowTexture();
    winningTileGlowTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const tableScene: TableScene = {
      renderer,
      scene,
      camera,
      content,
      playerHand,
      raycaster: new THREE.Raycaster(),
      pointer: new THREE.Vector2(),
      selectableMeshes: [],
      hovered: null,
      textureLoader: new THREE.TextureLoader(),
      textures: new Map(),
      centerDisplayCanvas,
      centerDisplayTexture,
      winningTileGlowTexture,
    };
    tableSceneRef.current = tableScene;
    drawCenterDisplay(tableScene, state.wall.length, secondsLeft);

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const statusHintPosition = new THREE.Vector3(0, 0.35, STATUS_HINT_Z).project(camera);
      statusHintRef.current?.style.setProperty('--match-status-x', `${(statusHintPosition.x * 0.5 + 0.5) * 100}%`);
      statusHintRef.current?.style.setProperty('--match-status-y', `${(-statusHintPosition.y * 0.5 + 0.5) * 100}%`);
      ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
        const riverCenter = new THREE.Vector3(RIVER_CENTER_X, 0.35, RIVER_CENTER_Z)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), SEAT_ROTATIONS[seat])
          .project(camera);
        stageRef.current?.style.setProperty(`--match-action-${seat}-x`, `${(riverCenter.x * 0.5 + 0.5) * 100}%`);
        stageRef.current?.style.setProperty(`--match-action-${seat}-y`, `${(-riverCenter.y * 0.5 + 0.5) * 100}%`);
      });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const pointerFromEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      tableScene.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      tableScene.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      tableScene.raycaster.setFromCamera(tableScene.pointer, camera);
      return tableScene.raycaster.intersectObjects(tableScene.selectableMeshes, false)[0]?.object ?? null;
    };
    const onPointerMove = (event: PointerEvent) => {
      const mesh = pointerFromEvent(event);
      const root = (mesh?.userData.tileRoot as THREE.Object3D | undefined) ?? null;
      if (tableScene.hovered && tableScene.hovered !== root) {
        tableScene.hovered.position.y = tableScene.hovered.userData.baseY as number;
        tableScene.hovered = null;
      }
      if (root) {
        if (tableScene.hovered !== root && event.pointerType !== 'touch') playMahjongSfx('tileHover');
        root.position.y = (root.userData.baseY as number) + 0.2;
        tableScene.hovered = root;
        renderer.domElement.style.cursor = 'pointer';
      } else {
        renderer.domElement.style.cursor = 'default';
      }
    };
    const onPointerLeave = () => {
      if (tableScene.hovered) tableScene.hovered.position.y = tableScene.hovered.userData.baseY as number;
      tableScene.hovered = null;
      renderer.domElement.style.cursor = 'default';
    };
    const onClick = (event: PointerEvent) => {
      const mesh = pointerFromEvent(event);
      const index = mesh?.userData.playerTileIndex as number | undefined;
      if (index !== undefined) onPlayerTileClickRef.current(index);
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    renderer.domElement.addEventListener('pointerup', onClick);

    let frame = 0;
    const render = () => {
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      renderer.domElement.removeEventListener('pointerup', onClick);
      disposeObject(content);
      disposeObject(playerHand);
      tableScene.textures.forEach((texture) => texture.dispose());
      tableScene.centerDisplayTexture.dispose();
      tableScene.winningTileGlowTexture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      tableSceneRef.current = null;
    };
  }, [CAMERA_DISTANCE, CAMERA_FOV, CAMERA_HEIGHT, CAMERA_TARGET_Z]);

  useEffect(() => {
    const tableScene = tableSceneRef.current;
    if (tableScene) drawCenterDisplay(tableScene, state.wall.length, secondsLeft);
  }, [secondsLeft, state.wall.length]);

  useEffect(() => {
    const tableScene = tableSceneRef.current;
    if (!tableScene) return;
    let cancelled = false;
    const rebuild = async () => {
      const tileIds = new Set<TileId>();
      state.players.forEach((hand) => {
        hand.concealed.forEach((tile) => tileIds.add(tile));
        hand.discards.forEach((tile) => tileIds.add(tile));
        hand.flowers.forEach((tile) => tileIds.add(tile));
        hand.melds.forEach((meld) => meld.tiles.forEach((tile) => tileIds.add(tile)));
      });
      const tableUrl = runtime.resolveAsset(tableTexturePath);
      const backUrl = runtime.resolveAsset(tileBackTexturePath);
      const [tableTexture, backTexture, ...loadedFaces] = await Promise.all([
        loadTexture(tableScene, tableUrl, true),
        loadTexture(tableScene, backUrl, true),
        ...[...tileIds].map((tile) => loadTexture(tableScene, runtime.resolveAsset(tileFaceAsset(tile)))),
      ]);
      if (cancelled) return;
      const faceTextures = new Map<TileId, THREE.Texture>();
      [...tileIds].forEach((tile, index) => faceTextures.set(tile, loadedFaces[index]));

      if (tableScene.hovered) tableScene.hovered = null;
      tableScene.selectableMeshes.length = 0;
      disposeObject(tableScene.content);
      tableScene.content.clear();
      disposeObject(tableScene.playerHand);
      tableScene.playerHand.clear();

      const tableMaterial = new THREE.MeshStandardMaterial({ map: tableTexture, roughness: 0.8, metalness: 0.02 });
      const tableTop = new THREE.Mesh(new RoundedBoxGeometry(TABLE_SIZE, 0.34, TABLE_SIZE, 4, 0.28), tableMaterial);
      tableTop.position.y = -0.2;
      tableTop.receiveShadow = true;
      tableScene.content.add(tableTop);

      const railMaterial = new THREE.MeshStandardMaterial({ color: 0xe6f3f8, roughness: 0.26, metalness: 0.26 });
      const railDepth = 0.6;
      const railWidth = 0.36;
      const horizontalRail = new RoundedBoxGeometry(TABLE_SIZE + railDepth, railWidth, railDepth, 3, 0.15);
      const verticalRail = new RoundedBoxGeometry(railDepth, railWidth, TABLE_SIZE + railDepth, 3, 0.15);
      const topRail = new THREE.Mesh(horizontalRail, railMaterial);
      topRail.position.set(0, 0.02, -TABLE_SIZE / 2);
      const bottomRail = topRail.clone();
      bottomRail.position.z = TABLE_SIZE / 2;
      const leftRail = new THREE.Mesh(verticalRail, railMaterial);
      leftRail.position.set(-TABLE_SIZE / 2, 0.02, 0);
      const rightRail = leftRail.clone();
      rightRail.position.x = TABLE_SIZE / 2;
      [topRail, bottomRail, leftRail, rightRail].forEach((rail) => { rail.castShadow = true; tableScene.content.add(rail); });

      const centerBase = new THREE.Mesh(
        new RoundedBoxGeometry(2.35, 0.24, 2.35, 3, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x253449, roughness: 0.36, metalness: 0.38 }),
      );
      centerBase.position.y = 0.08;
      centerBase.castShadow = true;
      tableScene.content.add(centerBase);
      const centerDisplay = new THREE.Mesh(
        new THREE.PlaneGeometry(2.08, 2.08),
        new THREE.MeshBasicMaterial({
          map: tableScene.centerDisplayTexture,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
        }),
      );
      centerDisplay.position.y = 0.206;
      centerDisplay.rotation.x = -Math.PI / 2;
      centerDisplay.renderOrder = 3;
      tableScene.content.add(centerDisplay);

      const playable = new Set(playableIndices);
      ([0, 1, 2, 3] as SeatIndex[]).forEach((seat) => {
        const seatGroup = createSeatGroup(tableScene.content, seat);
        if (seat !== 0) addOpponentConcealedHand(seatGroup, tableScene, faceTextures, backTexture, state, seat);
        addRiver(
          seatGroup,
          tableScene,
          faceTextures,
          backTexture,
          state.players[seat].discards,
          state.settlement?.reason === 'win' && state.winnerBy === 'discard' && state.loser === seat,
        );
        addOpenTiles(seatGroup, tableScene, faceTextures, backTexture, state.players[seat]);
        addFlowers(seatGroup, tableScene, faceTextures, backTexture, state.players[seat].flowers);
        addWall(seatGroup, tableScene, faceTextures, backTexture, wallCountForSeat(state.wall.length, seat));
        addSelfDrawWinningTile(seatGroup, tableScene, faceTextures, backTexture, state, seat);
      });
      addPlayerHand(tableScene.playerHand, tableScene, faceTextures, backTexture, state, playable, readySelectionActive);
    };
    void rebuild().catch((error) => console.error('Unable to rebuild 3D mahjong table.', error));
    return () => { cancelled = true; };
  }, [playableIndices, readySelectionActive, runtime, state, tableTexturePath, tileBackTexturePath]);

  return (
    <div className="match-table-stage" ref={stageRef}>
      <div className="match-three-mount" ref={mountRef} role="application" aria-label={status} />
      <div className="match-status-hint" ref={statusHintRef} aria-live="polite">{status}</div>
      {actionCallout && <MatchActionCallout
        key={actionCallout.id}
        seat={actionCallout.seat}
        kind={actionCallout.kind}
        label={actionCallout.label}
        imageSrc={actionCallout.imageSrc}
      />}
      <div className="match-seat-profiles">
        {([0, 1, 2, 3] as SeatIndex[]).map((seat) => (
          <article className={`match-seat-profile match-seat-${seat} ${state.currentPlayer === seat ? 'active-turn' : ''}`} key={seat} style={participantStyle(seat)}>
            <span className="match-seat-avatar"><img src={runtime.resolveAsset(participantSkins[seat])} alt="" /></span>
            <div><strong>{participantNames[seat]}</strong><b>{state.points[seat].toLocaleString()}</b></div>
            {state.readyDeclared[seat] && <i>{readyLabel}</i>}
          </article>
        ))}
      </div>
    </div>
  );
}
