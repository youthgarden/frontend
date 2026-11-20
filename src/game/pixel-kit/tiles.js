// 32x32 바닥 타일. 시드 고정 난수를 써서 몇 번을 그려도 같은 무늬가 나온다.

import { Grid, makeCanvas, rng } from './grid.js';
import { OUTLINE } from './palette.js';

export const TILE = 32;

function speckle(g, r, color, n, w = 1) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(r() * TILE);
    const y = Math.floor(r() * TILE);
    g.hline(x, x + w - 1, y, color);
  }
}

function grass(seed = 1) {
  const g = new Grid(TILE, TILE);
  const r = rng(seed * 7919);
  g.rect(0, 0, TILE, TILE, '#86d35f');
  speckle(g, r, '#74c451', 26);
  speckle(g, r, '#9fe274', 14);
  for (let i = 0; i < 4; i++) {
    const x = 2 + Math.floor(r() * 27);
    const y = 3 + Math.floor(r() * 26);
    g.set(x, y, '#5aa83e');
    g.set(x + 2, y, '#5aa83e');
    g.set(x + 1, y + 1, '#5aa83e');
  }
  return g;
}

function grassFlower(seed = 3) {
  const g = grass(seed);
  const r = rng(seed * 104729);
  const colors = ['#ffffff', '#ffe66b', '#ff9fc4', '#b9a3ff'];
  for (let i = 0; i < 4; i++) {
    const x = 3 + Math.floor(r() * 25);
    const y = 3 + Math.floor(r() * 25);
    const c = colors[i % colors.length];
    g.set(x, y - 1, c);
    g.set(x - 1, y, c);
    g.set(x + 1, y, c);
    g.set(x, y + 1, c);
    g.set(x, y, '#ffcf2e');
  }
  return g;
}

function path(seed = 5) {
  const g = new Grid(TILE, TILE);
  const r = rng(seed * 31337);
  g.rect(0, 0, TILE, TILE, '#ecd09a');
  speckle(g, r, '#dcb97c', 22);
  speckle(g, r, '#f6e2b8', 14, 2);
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(r() * 29);
    const y = Math.floor(r() * 30);
    g.hline(x, x + 1, y, '#c9a36a');
    g.hline(x, x + 1, y + 1, '#b38a55');
  }
  return g;
}

function plaza() {
  const g = new Grid(TILE, TILE);
  g.rect(0, 0, TILE, TILE, '#efe3cb');
  const line = '#d2c09d';
  const hi = '#faf3e4';
  // 엇갈린 돌판 두 줄
  for (const [y0, off] of [[0, 0], [16, 8]]) {
    g.hline(0, 31, y0 + 15, line);
    for (let x = off; x < 32 + 16; x += 16) {
      const lx = x % 32;
      g.vline(lx, y0, y0 + 14, line);
      g.hline(lx + 1, Math.min(lx + 6, 31), y0, hi);
      g.vline(lx + 1, y0 + 1, y0 + 3, hi);
    }
  }
  return g;
}

function water(frame = 0, seed = 9) {
  const g = new Grid(TILE, TILE);
  const r = rng(seed * 6007);
  g.rect(0, 0, TILE, TILE, '#58b9f2');
  speckle(g, r, '#4aa9e6', 18, 2);
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(r() * 26);
    const y = Math.floor(r() * 30);
    const sx = (x + frame * 2) % 28;
    g.hline(sx, sx + 3, y, '#b4e6ff');
    g.hline(sx + 1, sx + 2, y + 1, '#8fd4fb');
  }
  return g;
}

// 물 타일 가장자리에 땅이 붙는 쪽을 그린다. edges = { t, b, l, r } (true면 그쪽이 땅)
export function drawWaterEdges(g, edges) {
  const lip = (pts) => pts.forEach(([x, y, c]) => g.set(x, y, c));
  for (let i = 0; i < TILE; i++) {
    if (edges.t) lip([[i, 0, '#86d35f'], [i, 1, '#86d35f'], [i, 2, OUTLINE], [i, 3, '#e9f8ff']]);
    if (edges.b) lip([[i, 31, '#86d35f'], [i, 30, '#c9a36a'], [i, 29, OUTLINE], [i, 28, '#e9f8ff']]);
    if (edges.l) lip([[0, i, '#86d35f'], [1, i, '#86d35f'], [2, i, OUTLINE], [3, i, '#e9f8ff']]);
    if (edges.r) lip([[31, i, '#86d35f'], [30, i, '#86d35f'], [29, i, OUTLINE], [28, i, '#e9f8ff']]);
  }
  return g;
}

function wood() {
  const g = new Grid(TILE, TILE);
  g.rect(0, 0, TILE, TILE, '#dca46a');
  for (let row = 0; row < 4; row++) {
    const y = row * 8;
    g.hline(0, 31, y + 7, '#b07a44');
    g.hline(0, 31, y, '#e8b984');
    const joint = row % 2 ? 9 : 25;
    g.vline(joint, y, y + 6, '#b07a44');
    g.hline(3 + row * 5, 8 + row * 5, y + 3, '#cf9358');
  }
  return g;
}

function floorTile() {
  const g = new Grid(TILE, TILE);
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) g.rect(i * 16, j * 16, 16, 16, (i + j) % 2 ? '#e6d6b6' : '#f5ecd8');
  return g;
}

function carpet() {
  const g = new Grid(TILE, TILE);
  g.rect(0, 0, TILE, TILE, '#d9576b');
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const d = Math.abs((x % 16) - 8) + Math.abs((y % 16) - 8);
      if (d === 6) g.set(x, y, '#f3c45a');
      if (d < 2) g.set(x, y, '#ef8a9a');
    }
  return g;
}

function bridge() {
  const g = new Grid(TILE, TILE);
  g.rect(0, 0, TILE, TILE, '#c98f56');
  for (let y = 0; y < TILE; y += 6) {
    g.hline(0, 31, y, '#8a5a30');
    g.hline(4, 27, y + 2, '#d9a56e');
  }
  g.rect(0, 0, 3, TILE, '#8a5a30');
  g.rect(29, 0, 3, TILE, '#8a5a30');
  g.vline(1, 0, 31, '#a8723f');
  g.vline(30, 0, 31, '#a8723f');
  return g;
}

function sand(seed = 11) {
  const g = new Grid(TILE, TILE);
  const r = rng(seed * 2711);
  g.rect(0, 0, TILE, TILE, '#f6e3a8');
  speckle(g, r, '#e8cf8a', 20);
  speckle(g, r, '#fff3cc', 10);
  return g;
}

function hedge() {
  const g = new Grid(TILE, TILE);
  g.rect(0, 0, TILE, TILE, '#3f9a48');
  for (let y = 0; y < TILE; y += 8)
    for (let x = (y / 8) % 2 ? 4 : 0; x < TILE; x += 8) {
      g.ellipse(x, y, x + 7, y + 7, '#4fb052');
      g.hline(x + 2, x + 3, y + 2, '#7dd35f');
    }
  g.hline(0, 31, 31, '#2c7a36');
  return g;
}

export const TILES = {
  grass: { label: '잔디', draw: () => grass(1) },
  grass2: { label: '잔디 2', draw: () => grass(2) },
  grass_flower: { label: '꽃 잔디', draw: () => grassFlower(3) },
  path: { label: '흙길', draw: () => path(5) },
  plaza: { label: '광장 돌바닥', draw: plaza },
  water: { label: '물', draw: () => water(0), frames: 3, drawFrame: (f) => water(f) },
  wood: { label: '나무 마루', draw: wood },
  floor: { label: '교실 바닥', draw: floorTile },
  carpet: { label: '카펫', draw: carpet },
  bridge: { label: '다리', draw: bridge },
  sand: { label: '모래', draw: () => sand(11) },
  hedge: { label: '울타리 나무', draw: hedge },
};

export const TILE_KEYS = Object.keys(TILES);

// 타일셋 한 장 (가로로 나열). Tiled 같은 맵 편집기에 바로 넣을 수 있다.
export function buildTileset(cols = 6) {
  const keys = TILE_KEYS;
  const rows = Math.ceil(keys.length / cols);
  const c = makeCanvas(cols * TILE, rows * TILE);
  const ctx = c.getContext('2d');
  keys.forEach((k, i) => TILES[k].draw().drawTo(ctx, (i % cols) * TILE, Math.floor(i / cols) * TILE));
  return { canvas: c, index: Object.fromEntries(keys.map((k, i) => [k, i])) };
}
