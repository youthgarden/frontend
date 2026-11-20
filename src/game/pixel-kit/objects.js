// 맵 위에 올리는 오브젝트. 각 함수는 Grid를 돌려준다.
// 배치 기준점은 바닥 가운데(anchor: x 0.5, y 1)라서, 캐릭터와 같은 y로 앞뒤 정렬하면 된다.

import { Grid, rng } from './grid.js';
import { OUTLINE } from './palette.js';

const WOOD = ['#e8b984', '#c98f56', '#9a6a45', '#6b4428'];
const STONE = ['#f4ecdc', '#ddd0b6', '#bfae8c', '#9a8a6a'];

function done(g) {
  return g.outline(OUTLINE);
}

// 그림이 Grid 가장자리까지 닿으면 outline이 그 바깥에 선을 그릴 자리가 없어 테두리가 끊긴다.
// 사방에 한 칸씩 여유를 두고 옮겨 그린 뒤 테두리를 두른다.
function doneFramed(g) {
  const framed = new Grid(g.w + 2, g.h + 2);
  framed.blit(g, 1, 1);
  return framed.outline(OUTLINE);
}

function treeRound(seed = 1) {
  const g = new Grid(36, 46);
  const r = rng(seed * 977);
  g.rect(15, 30, 6, 14, WOOD[2]);
  g.vline(19, 30, 43, WOOD[3]);
  g.hline(13, 22, 44, WOOD[3]);
  g.ellipse(1, 2, 34, 34, '#3f9a48');
  g.ellipse(2, 1, 30, 29, '#52b54f');
  g.ellipse(5, 3, 20, 16, '#6fcb5c');
  g.ellipse(8, 5, 14, 10, '#93df74');
  for (let i = 0; i < 6; i++) {
    const x = 6 + Math.floor(r() * 22);
    const y = 18 + Math.floor(r() * 12);
    g.hline(x, x + 2, y, '#2f8040');
  }
  return done(g);
}

function treePine() {
  const g = new Grid(30, 48);
  g.rect(13, 38, 4, 8, WOOD[2]);
  g.vline(16, 38, 45, WOOD[3]);
  const tiers = [[2, 14], [10, 24], [20, 36]];
  tiers.forEach(([top, bottom], i) => {
    const half = 7 + i * 3;
    for (let y = top; y <= bottom; y++) {
      const w = Math.round(((y - top + 1) / (bottom - top + 1)) * half);
      g.hline(15 - w, 14 + w, y, '#3f9a55');
      g.hline(15 - w, 14, y, '#52b56a');
      if (y === bottom) g.hline(15 - w, 14 + w, y, '#2c7a42');
    }
    g.hline(12, 13, top + 4, '#7dd38a');
  });
  return done(g);
}

function bush() {
  const g = new Grid(30, 20);
  g.ellipse(1, 3, 16, 19, '#3f9a48');
  g.ellipse(12, 1, 28, 19, '#4fae4a');
  g.ellipse(4, 3, 12, 10, '#6fcb5c');
  g.ellipse(15, 3, 22, 9, '#7dd35f');
  [[8, 13], [20, 12], [24, 15]].forEach(([x, y]) => {
    g.set(x, y, '#ff5d6c');
    g.set(x + 1, y, '#ff8f99');
  });
  return done(g);
}

function flowerPatch() {
  const g = new Grid(30, 18);
  const colors = ['#ff9fc4', '#ffe66b', '#ffffff', '#b9a3ff', '#ff8a5c'];
  const spots = [[3, 6], [9, 3], [15, 7], [21, 2], [26, 6], [6, 12], [13, 13], [20, 11], [25, 13]];
  spots.forEach(([x, y], i) => {
    g.vline(x, y + 2, y + 4, '#3f9a48');
    g.set(x + 1, y + 3, '#52b54f');
    const c = colors[i % colors.length];
    g.set(x, y - 1, c);
    g.set(x - 1, y, c);
    g.set(x + 1, y, c);
    g.set(x, y + 1, c);
    g.set(x, y, '#ffcf2e');
  });
  return g;
}

function rock() {
  const g = new Grid(22, 15);
  g.ellipse(1, 2, 20, 14, '#a9a6b0');
  g.ellipse(3, 2, 14, 8, '#c8c6ce');
  g.hline(5, 8, 4, '#e4e2e8');
  g.hline(8, 18, 13, '#85828e');
  return done(g);
}

function fence() {
  const g = new Grid(32, 22);
  for (const x of [2, 15, 28]) {
    g.rect(x, 2, 3, 19, WOOD[0]);
    g.vline(x + 2, 2, 20, WOOD[1]);
    g.set(x + 1, 1, WOOD[0]);
  }
  g.rect(0, 6, 32, 3, WOOD[1]);
  g.hline(0, 31, 6, WOOD[0]);
  g.rect(0, 13, 32, 3, WOOD[1]);
  g.hline(0, 31, 13, WOOD[0]);
  return done(g);
}

function bench() {
  const g = new Grid(34, 24);
  g.rect(2, 2, 30, 4, WOOD[1]);
  g.hline(2, 31, 2, WOOD[0]);
  g.rect(2, 8, 30, 3, WOOD[1]);
  g.rect(1, 12, 32, 4, WOOD[0]);
  g.hline(1, 32, 15, WOOD[2]);
  for (const x of [4, 28]) g.rect(x, 16, 3, 7, '#5a5a6a');
  g.vline(5, 6, 8, '#5a5a6a');
  g.vline(29, 6, 8, '#5a5a6a');
  return done(g);
}

function lamp() {
  const g = new Grid(14, 46);
  g.rect(5, 12, 4, 32, '#4a4a5c');
  g.vline(6, 12, 43, '#6a6a80');
  g.rect(3, 42, 8, 3, '#4a4a5c');
  g.rect(2, 2, 10, 10, '#4a4a5c');
  g.rect(3, 3, 8, 7, '#ffe680');
  g.rect(4, 4, 3, 3, '#fffbe0');
  g.hline(1, 12, 1, '#4a4a5c');
  g.set(6, 0, '#4a4a5c');
  g.set(7, 0, '#4a4a5c');
  return done(g);
}

function fountain(frame = 0) {
  const g = new Grid(84, 66);
  // 바깥 수반
  g.ellipse(2, 26, 81, 63, STONE[2]);
  g.ellipse(2, 24, 81, 59, STONE[1]);
  g.ellipse(4, 25, 79, 56, STONE[0]);
  g.ellipse(9, 29, 74, 55, '#58b9f2');
  g.ellipse(12, 31, 71, 52, '#6fc6f6');
  // 물결
  const off = frame * 3;
  [[20, 40], [48, 46], [30, 49], [58, 37]].forEach(([x, y]) => g.hline(x + (off % 6), x + 5 + (off % 6), y, '#c4ecff'));
  // 가운데 기둥과 위쪽 그릇
  g.rect(37, 20, 10, 22, STONE[1]);
  g.vline(45, 20, 41, STONE[2]);
  g.vline(38, 20, 41, STONE[0]);
  g.ellipse(26, 14, 57, 25, STONE[2]);
  g.ellipse(26, 12, 57, 22, STONE[0]);
  g.ellipse(29, 14, 54, 20, '#6fc6f6');
  // 솟는 물
  g.rect(40, 2, 4, 14, '#b4e6ff');
  g.vline(41, 2, 15, '#ffffff');
  const drops = frame % 2 === 0 ? [[36, 6], [47, 7], [33, 10], [50, 11]] : [[35, 8], [48, 5], [31, 13], [52, 9]];
  drops.forEach(([x, y]) => g.rect(x, y, 2, 2, '#b4e6ff'));
  [[24, 26], [58, 27], [22, 30], [61, 31]].forEach(([x, y], i) => {
    if ((i + frame) % 2 === 0) g.rect(x, y, 2, 3, '#b4e6ff');
  });
  return done(g);
}

function signpost(color = '#ffd23d') {
  const g = new Grid(26, 30);
  g.rect(11, 12, 4, 17, WOOD[2]);
  g.vline(14, 12, 28, WOOD[3]);
  g.rect(1, 2, 24, 11, WOOD[1]);
  g.rect(2, 3, 22, 9, WOOD[0]);
  g.hline(5, 20, 6, color);
  g.hline(5, 16, 9, WOOD[2]);
  return done(g);
}

function flag() {
  const g = new Grid(22, 46);
  g.rect(2, 2, 2, 42, '#7a7a8e');
  g.rect(1, 1, 4, 2, '#ffd23d');
  g.rect(0, 43, 6, 2, '#5a5a6a');
  g.rect(4, 4, 16, 11, '#ffcf2e');
  g.hline(4, 19, 4, '#ffeb8a');
  g.rect(16, 8, 4, 7, '#e39b12');
  g.ellipse(8, 7, 13, 12, '#ffffff');
  g.vline(10, 8, 11, '#4fc23c');
  g.set(9, 8, '#4fc23c');
  g.set(11, 8, '#4fc23c');
  return done(g);
}

function balloons() {
  const g = new Grid(28, 46);
  const ball = (x, y, c, hi) => {
    g.ellipse(x, y, x + 9, y + 11, c);
    g.rect(x + 2, y + 2, 2, 3, hi);
    g.set(x + 4, y + 12, c);
  };
  for (const [x0, x1] of [[6, 13], [14, 13], [21, 14]]) {
    for (let y = 14; y < 44; y++) g.set(Math.round(x0 + ((x1 - x0) * (y - 14)) / 30), y, '#ffffff');
  }
  ball(1, 4, '#ff6b8a', '#ffc0cf');
  ball(16, 4, '#4fc3ff', '#c4ecff');
  ball(9, 0, '#ffcf2e', '#fff3ad');
  g.rect(11, 42, 6, 3, '#ef3d3d');
  return done(g);
}

function desk() {
  const g = new Grid(34, 24);
  g.rect(1, 2, 32, 9, WOOD[0]);
  g.hline(1, 32, 2, '#f5d4a8');
  g.rect(1, 11, 32, 5, WOOD[1]);
  g.hline(1, 32, 15, WOOD[2]);
  for (const x of [2, 29]) g.rect(x, 16, 3, 7, WOOD[2]);
  g.rect(6, 4, 8, 5, '#ffffff');
  g.hline(7, 12, 6, '#9ab0d0');
  g.rect(20, 5, 7, 4, '#4f7fe0');
  return done(g);
}

function chair() {
  const g = new Grid(18, 22);
  g.rect(2, 1, 14, 9, '#ef7a3d');
  g.hline(2, 15, 1, '#ffa66b');
  g.rect(2, 10, 14, 4, '#d9622a');
  g.rect(3, 14, 2, 7, '#5a5a6a');
  g.rect(13, 14, 2, 7, '#5a5a6a');
  return done(g);
}

function chalkboard() {
  const g = new Grid(66, 46);
  g.rect(1, 1, 64, 38, WOOD[1]);
  g.rect(3, 3, 60, 34, '#3f7d5a');
  g.rect(4, 4, 58, 2, '#4f8f6a');
  const chalk = '#f2f6ee';
  // 칠판 글씨 흉내 (점선과 도형)
  g.hline(8, 22, 10, chalk);
  g.hline(8, 16, 14, chalk);
  g.hline(26, 40, 12, chalk);
  g.ellipse(46, 9, 56, 19, chalk);
  g.ellipse(48, 11, 54, 17, '#3f7d5a');
  g.hline(8, 30, 22, '#ffe680');
  g.hline(10, 26, 27, chalk);
  g.hline(34, 54, 26, chalk);
  g.hline(36, 50, 30, chalk);
  g.rect(1, 38, 64, 3, WOOD[2]);
  g.rect(10, 37, 6, 2, '#ffffff');
  g.rect(18, 37, 4, 2, '#ff9fc4');
  g.rect(14, 41, 3, 4, WOOD[3]);
  g.rect(49, 41, 3, 4, WOOD[3]);
  return done(g);
}

function bookshelf() {
  const g = new Grid(34, 48);
  g.rect(1, 1, 32, 46, WOOD[2]);
  g.rect(3, 3, 28, 42, WOOD[3]);
  const spines = ['#ef3d3d', '#3f8dff', '#4fc23c', '#ffcf2e', '#9b57f0', '#ff8a5c', '#ffffff', '#4fa585'];
  const r = rng(42);
  for (let shelf = 0; shelf < 3; shelf++) {
    const y0 = 3 + shelf * 14;
    g.rect(3, y0 + 12, 28, 2, WOOD[1]);
    let x = 4;
    while (x < 29) {
      const w = 2 + Math.floor(r() * 2);
      const h = 8 + Math.floor(r() * 4);
      const c = spines[Math.floor(r() * spines.length)];
      g.rect(x, y0 + 12 - h, Math.min(w, 30 - x), h, c);
      g.set(x, y0 + 12 - h + 2, '#ffffff');
      x += w + 1;
    }
  }
  g.hline(1, 32, 1, WOOD[1]);
  return done(g);
}

function computerDesk() {
  const g = new Grid(34, 34);
  g.rect(1, 18, 32, 6, WOOD[0]);
  g.rect(1, 24, 32, 4, WOOD[1]);
  g.rect(2, 28, 3, 5, WOOD[2]);
  g.rect(29, 28, 3, 5, WOOD[2]);
  g.rect(7, 2, 20, 14, '#4a4a5c');
  g.rect(9, 4, 16, 10, '#7ed3ff');
  g.rect(10, 5, 6, 3, '#c4ecff');
  g.hline(12, 22, 11, '#4fa585');
  g.rect(15, 16, 4, 3, '#4a4a5c');
  g.rect(9, 20, 14, 2, '#d8d4d0');
  return done(g);
}

function plant() {
  const g = new Grid(18, 28);
  g.rect(4, 17, 10, 9, '#d9733d');
  g.hline(3, 14, 17, '#f08a52');
  g.vline(12, 18, 25, '#b0552a');
  const leaf = '#4fae4a';
  g.ellipse(1, 4, 8, 15, leaf);
  g.ellipse(9, 4, 16, 15, leaf);
  g.ellipse(5, 0, 12, 12, '#6fcb5c');
  g.vline(9, 6, 16, '#3f9a48');
  return done(g);
}

function trophy() {
  const g = new Grid(18, 22);
  g.rect(3, 1, 12, 9, '#ffcf2e');
  g.ellipse(3, 2, 14, 13, '#ffcf2e');
  g.rect(5, 2, 2, 7, '#fff3ad');
  g.rect(0, 3, 3, 5, '#e39b12');
  g.rect(15, 3, 3, 5, '#e39b12');
  g.rect(7, 13, 4, 3, '#e39b12');
  g.rect(4, 16, 10, 5, '#9a6a45');
  g.hline(6, 11, 18, '#ffcf2e');
  return done(g);
}

function sprout() {
  const g = new Grid(18, 18);
  g.rect(8, 7, 2, 7, '#3f9a48');
  g.ellipse(1, 2, 8, 8, '#6fcb5c');
  g.ellipse(9, 1, 16, 7, '#7dd35f');
  g.hline(3, 5, 4, '#a8ef7a');
  g.ellipse(3, 12, 14, 17, '#9a6a45');
  g.hline(5, 12, 13, '#c08a56');
  return done(g);
}

function tent(frame = 0) {
  const g = new Grid(100, 76);
  // 무대 바닥
  g.rect(4, 56, 92, 14, WOOD[1]);
  g.hline(4, 95, 56, WOOD[0]);
  g.rect(4, 70, 92, 4, WOOD[2]);
  // 기둥
  g.rect(10, 24, 4, 34, '#ffffff');
  g.rect(86, 24, 4, 34, '#ffffff');
  // 뒷막
  g.rect(14, 26, 72, 30, '#7a2a3a');
  g.rect(16, 28, 68, 26, '#a8344a');
  // 줄무늬 지붕
  for (let y = 2; y <= 26; y++) {
    const w = Math.round(((y - 1) / 26) * 48);
    for (let x = 50 - w; x <= 49 + w; x++) {
      const stripe = Math.floor((x - 50) / 8 + 10) % 2;
      g.set(x, y, stripe ? '#ef3d3d' : '#ffffff');
    }
  }
  for (let x = 2; x <= 97; x += 8) g.ellipse(x, 24, x + 7, 31, '#ef3d3d', (px, py) => py >= 26);
  g.rect(48, 0, 4, 3, '#ffd23d');
  // 전구
  for (let x = 8; x <= 92; x += 7) g.set(x, 33, (x / 7 + frame) % 2 < 1 ? '#fff3a0' : '#ffcf2e');
  // 무대 위 별 장식
  g.map(44, 36, ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'y.....y'], { y: '#ffd23d' });
  return done(g);
}

// 건물: 컨셉의 메인 광장 건물, 도서관, 강의실을 같은 틀로 만든다.
function building({ w = 128, wallH = 52, roof = ['#ffa66b', '#f08a32', '#b85e1c'], wall = ['#fff6dc', '#fbe7bf', '#e3c896'], clock = false, windows = 4, door = true, flagOn = false } = {}) {
  const roofH = Math.round(wallH * 0.6);
  const h = roofH + wallH + 4;
  const g = new Grid(w, h);
  const top = roofH;
  // 벽
  g.rect(4, top, w - 8, wallH, wall[1]);
  g.rect(4, top, w - 8, 3, wall[2]);
  g.rect(4, top + wallH - 6, w - 8, 6, STONE[2]);
  g.hline(4, w - 5, top + wallH - 6, STONE[1]);
  // 창문
  // 창문 가운데 좌표: 문이 있으면 문 양옆 구역에 반씩 나눠 놓는다.
  const centers = [];
  const spread = (a, b, n) => {
    for (let i = 1; i <= n; i++) centers.push(a + ((b - a) * i) / (n + 1));
  };
  if (door) {
    const left = Math.ceil(windows / 2);
    spread(4, w / 2 - 12, left);
    spread(w / 2 + 12, w - 4, windows - left);
  } else {
    spread(4, w - 4, windows);
  }
  for (const cx of centers) {
    const x = Math.round(cx - 6);
    const y = top + 12;
    g.rect(x - 1, y - 1, 14, 18, OUTLINE);
    g.rect(x, y, 12, 16, '#8fd0ff');
    g.rect(x + 1, y + 1, 4, 5, '#d8f1ff');
    g.vline(x + 6, y, y + 15, '#ffffff');
    g.hline(x, x + 11, y + 8, '#ffffff');
    g.rect(x - 2, y + 16, 16, 2, wall[2]);
  }
  if (door) {
    const x = Math.round(w / 2 - 9);
    const y = top + wallH - 26;
    g.rect(x - 1, y - 1, 20, 27, OUTLINE);
    g.ellipse(x - 1, y - 6, x + 18, y + 8, OUTLINE);
    g.rect(x, y, 18, 26, '#2f6fb0');
    g.ellipse(x, y - 5, x + 17, y + 7, '#2f6fb0');
    g.vline(x + 9, y - 4, y + 25, '#245890');
    g.rect(x + 2, y + 2, 5, 8, '#8fd0ff');
    g.rect(x + 11, y + 2, 5, 8, '#8fd0ff');
    g.set(x + 7, y + 14, '#ffd23d');
    g.set(x + 11, y + 14, '#ffd23d');
  }
  // 지붕
  for (let y = 0; y < roofH; y++) {
    const inset = Math.round(((roofH - y) / roofH) * (w * 0.32));
    const x0 = inset;
    const x1 = w - 1 - inset;
    g.hline(x0, x1, y, roof[1]);
    if (y % 6 === 5) g.hline(x0, x1, y, roof[2]);
    else if (y % 6 === 0) g.hline(x0 + 1, x0 + (x1 - x0) / 3, y, roof[0]);
  }
  g.hline(0, w - 1, roofH - 1, roof[2]);
  g.hline(0, w - 1, roofH, OUTLINE);
  if (clock) {
    const cx = Math.round(w / 2);
    const cy = Math.round(roofH * 0.55);
    g.ellipse(cx - 11, cy - 11, cx + 10, cy + 10, OUTLINE);
    g.ellipse(cx - 10, cy - 10, cx + 9, cy + 9, '#fffaf0');
    g.vline(cx, cy - 7, cy, OUTLINE);
    g.hline(cx, cx + 5, cy, OUTLINE);
    [[0, -9], [0, 8], [-9, 0], [8, 0]].forEach(([dx, dy]) => g.set(cx + dx, cy + dy, '#9a8a6a'));
  }
  if (flagOn) {
    const cx = Math.round(w / 2);
    g.vline(cx, 0, 6, '#7a7a8e');
  }
  return done(g);
}

// 창문 하나 (12x16). (x, y)는 유리의 왼쪽 위.
function windowAt(g, x, y, sill) {
  g.rect(x - 1, y - 1, 14, 18, OUTLINE);
  g.rect(x, y, 12, 16, '#8fd0ff');
  g.rect(x + 1, y + 1, 4, 5, '#d8f1ff');
  g.vline(x + 6, y, y + 15, '#ffffff');
  g.hline(x, x + 11, y + 8, '#ffffff');
  g.rect(x - 2, y + 16, 16, 2, sill);
}

// 위가 둥근 창문. (x, y)는 네모난 유리의 왼쪽 위이고, 둥근 부분이 그 위로 6칸 올라간다.
function archWindowAt(g, x, y, sill) {
  g.ellipse(x - 1, y - 7, x + 12, y + 6, OUTLINE);
  g.ellipse(x, y - 6, x + 11, y + 5, '#8fd0ff');
  windowAt(g, x, y, sill);
  g.hline(x, x + 11, y - 1, '#ffffff');
  g.vline(x + 6, y - 5, y - 1, '#ffffff');
}

// 창문 아래 꽃 상자. (x, y)는 windowAt에 준 것과 같은 좌표.
function flowerBox(g, x, y) {
  g.rect(x - 1, y + 18, 14, 3, WOOD[2]);
  g.hline(x - 1, x + 12, y + 20, WOOD[3]);
  for (let i = 0; i < 12; i++) g.set(x + i, y + 17, i % 4 === 1 ? '#ff6b8a' : i % 4 === 3 ? '#ffd23d' : '#4fae4a');
}

// 지붕 줄무늬 한 줄
function roofLine(g, x0, x1, y, roof) {
  g.hline(x0, x1, y, roof[1]);
  if (y % 5 === 4) g.hline(x0, x1, y, roof[2]);
  else if (y % 5 === 0) g.hline(x0 + 1, x0 + Math.round((x1 - x0) / 3), y, roof[0]);
}

const STAR = ['...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.', 'y.....y'];

// 강의실: 2층 학교. 가운데 시계탑과 깃발, 양쪽 날개에 창문 두 줄.
function school() {
  const w = 184;
  const cx = 92;
  const roof = ['#ff9a86', '#e2553f', '#a8342a'];
  const wall = ['#fff6dc', '#fbe7bf', '#e3c896'];
  const g = new Grid(w, 142);
  // 날개 벽 (2층)
  g.rect(4, 64, w - 8, 72, wall[1]);
  g.rect(4, 64, w - 8, 3, wall[2]);
  g.hline(4, w - 5, 99, wall[2]);
  g.hline(4, w - 5, 100, wall[0]);
  g.rect(4, 130, w - 8, 6, STONE[2]);
  g.hline(4, w - 5, 130, STONE[1]);
  // 날개 지붕
  for (let y = 44; y <= 63; y++) {
    const inset = Math.round(((63 - y) / 20) * 18);
    roofLine(g, inset, w - 1 - inset, y, roof);
  }
  g.hline(0, w - 1, 63, roof[2]);
  g.hline(0, w - 1, 64, OUTLINE);
  // 날개 창문: 층마다 세 개씩
  for (const y of [72, 107]) {
    for (const x of [9, 27, 45]) {
      windowAt(g, x, y, wall[2]);
      windowAt(g, w - 12 - x, y, wall[2]);
      if (y === 107) { flowerBox(g, x, y); flowerBox(g, w - 12 - x, y); }
    }
  }
  // 굴뚝
  g.rect(28, 34, 10, 14, '#c9694f');
  g.vline(36, 35, 47, '#8f3f2e');
  g.vline(37, 35, 47, '#8f3f2e');
  g.hline(28, 35, 40, '#a8503a');
  g.rect(27, 32, 12, 3, STONE[1]);
  g.hline(27, 38, 34, STONE[3]);
  // 시계탑
  g.rect(cx - 26, 32, 52, 104, wall[0]);
  g.vline(cx - 27, 33, 135, OUTLINE);
  g.vline(cx + 26, 33, 135, OUTLINE);
  g.vline(cx + 25, 33, 129, wall[2]);
  g.vline(cx + 24, 33, 129, wall[1]);
  g.rect(cx - 26, 130, 52, 6, STONE[2]);
  g.hline(cx - 26, cx + 25, 130, STONE[1]);
  for (let y = 12; y <= 31; y++) {
    const half = Math.round(((y - 11) / 20) * 32);
    roofLine(g, cx - half, cx + half - 1, y, roof);
  }
  g.hline(cx - 32, cx + 31, 31, roof[2]);
  g.hline(cx - 32, cx + 31, 32, OUTLINE);
  // 시계
  g.ellipse(cx - 11, 38, cx + 10, 59, OUTLINE);
  g.ellipse(cx - 10, 39, cx + 9, 58, '#fffaf0');
  g.vline(cx, 42, 49, OUTLINE);
  g.hline(cx, cx + 5, 49, OUTLINE);
  [[0, -9], [0, 8], [-9, 0], [8, 0]].forEach(([dx, dy]) => g.set(cx + dx, 49 + dy, '#9a8a6a'));
  // 탑 창문과 현판
  archWindowAt(g, cx - 6, 71, wall[2]);
  g.rect(cx - 19, 92, 38, 10, OUTLINE);
  g.rect(cx - 18, 93, 36, 8, '#3f6fb0');
  for (let x = cx - 14; x <= cx + 12; x += 5) g.rect(x, 96, 3, 2, '#ffffff');
  // 현관: 넓은 양문과 계단
  g.rect(cx - 15, 109, 30, 27, OUTLINE);
  g.ellipse(cx - 15, 103, cx + 14, 117, OUTLINE);
  g.rect(cx - 14, 110, 28, 26, '#2f6fb0');
  g.ellipse(cx - 14, 104, cx + 13, 116, '#2f6fb0');
  g.vline(cx - 1, 105, 135, '#245890');
  g.vline(cx, 105, 135, '#245890');
  g.rect(cx - 11, 112, 7, 9, '#8fd0ff');
  g.rect(cx + 4, 112, 7, 9, '#8fd0ff');
  g.set(cx - 3, 125, '#ffd23d');
  g.set(cx + 2, 125, '#ffd23d');
  g.rect(cx - 20, 136, 40, 3, STONE[1]);
  g.rect(cx - 25, 139, 50, 3, STONE[2]);
  // 현관 등
  for (const x of [cx - 22, cx + 19]) {
    g.rect(x - 1, 109, 5, 7, OUTLINE);
    g.rect(x, 110, 3, 5, '#ffe98a');
  }
  // 깃발
  g.vline(cx, 0, 11, '#7a7a8e');
  g.rect(cx + 1, 1, 11, 7, '#ffcf2e');
  g.hline(cx + 1, cx + 11, 7, '#e39b12');
  g.rect(cx + 4, 3, 3, 2, '#ffffff');
  return doneFramed(g);
}

// 시험장: 기둥 네 개와 삼각 지붕이 있는 큰 홀. 별 문양과 현수막으로 격식을 준다.
function examHall() {
  const w = 168;
  const cx = 84;
  const roof = ['#7f96e6', '#3d55a8', '#27397a'];
  const gold = '#ffd23d';
  const g = new Grid(w, 122);
  // 뒷벽
  g.rect(10, 48, w - 20, 62, '#4a3b7a');
  g.rect(10, 48, w - 20, 5, '#392c62');
  // 삼각 지붕과 안쪽 흰 면
  for (let y = 6; y <= 39; y++) {
    const half = Math.round(((y - 5) / 34) * 84);
    g.hline(cx - half, cx + half - 1, y, y >= 37 ? roof[2] : roof[1]);
    if (y >= 14 && y <= 35 && half > 16) g.hline(cx - half + 12, cx + half - 13, y, y === 14 ? STONE[1] : STONE[0]);
  }
  for (let y = 8; y <= 36; y += 1) {
    const half = Math.round(((y - 5) / 34) * 84);
    g.set(cx - half + 2, y, roof[0]);
  }
  for (let y = 6; y <= 39; y++) {
    const half = Math.round(((y - 5) / 34) * 84);
    g.set(cx - half, y, gold);
    g.set(cx + half - 1, y, gold);
  }
  g.map(cx - 3, 21, STAR, { y: gold });
  // 별을 감싸는 월계수
  [[9, 20], [11, 22], [12, 24], [12, 26], [11, 28], [9, 30], [7, 31]].forEach(([dx, y]) => {
    g.rect(cx - dx - 1, y, 2, 2, '#4fae4a');
    g.rect(cx + dx - 1, y, 2, 2, '#4fae4a');
  });
  // 지붕 양 끝 장식
  g.rect(0, 33, 3, 7, gold);
  g.rect(w - 3, 33, 3, 7, gold);
  g.rect(cx - 2, 0, 4, 6, gold);
  g.hline(cx - 3, cx + 2, 5, '#e39b12');
  // 처마
  g.rect(2, 40, w - 4, 8, STONE[0]);
  g.hline(2, w - 3, 40, gold);
  g.hline(2, w - 3, 41, gold);
  g.hline(2, w - 3, 47, STONE[2]);
  for (let x = 4; x <= w - 6; x += 4) g.rect(x, 44, 2, 2, STONE[2]);
  // 현수막
  for (const x of [30, w - 46]) {
    g.rect(x, 53, 16, 36, '#d8423a');
    for (let i = 0; i < 8; i++) g.hline(x + i, x + 15 - i, 89 + i, '#d8423a');
    g.hline(x, x + 15, 53, gold);
    g.hline(x, x + 15, 54, gold);
    g.vline(x + 15, 55, 88, '#a8342a');
    g.map(x + 5, 64, ['..y..', 'yyyyy', '.yyy.', 'yy.yy'], { y: gold });
    g.hline(x + 4, x + 11, 76, '#ffb3a8');
    g.hline(x + 4, x + 11, 80, '#ffb3a8');
  }
  // 현판과 큰 문
  g.rect(cx - 15, 55, 30, 9, OUTLINE);
  g.rect(cx - 14, 56, 28, 7, gold);
  for (let x = cx - 10; x <= cx + 8; x += 5) g.rect(x, 58, 3, 3, '#7a4a12');
  g.rect(cx - 17, 77, 34, 33, OUTLINE);
  g.ellipse(cx - 17, 67, cx + 16, 89, OUTLINE);
  g.rect(cx - 16, 78, 32, 32, '#b97a3c');
  g.ellipse(cx - 16, 68, cx + 15, 88, '#8fd0ff');
  g.hline(cx - 16, cx + 15, 79, gold);
  g.hline(cx - 16, cx + 15, 80, '#7a4a12');
  g.rect(cx - 16, 81, 32, 29, '#b97a3c');
  g.vline(cx - 1, 81, 109, '#7a4a12');
  g.vline(cx, 81, 109, '#7a4a12');
  g.rect(cx - 12, 85, 8, 10, '#d9a066');
  g.rect(cx + 4, 85, 8, 10, '#d9a066');
  g.rect(cx - 12, 98, 8, 9, '#d9a066');
  g.rect(cx + 4, 98, 8, 9, '#d9a066');
  g.set(cx - 3, 96, gold);
  g.set(cx + 2, 96, gold);
  // 기둥
  for (const x of [14, 50, 106, 142]) {
    g.rect(x, 48, 12, 62, '#fffaf0');
    g.vline(x + 3, 53, 104, STONE[0]);
    g.vline(x + 8, 53, 104, STONE[1]);
    g.vline(x + 10, 52, 105, STONE[2]);
    g.vline(x + 11, 52, 105, STONE[2]);
    g.rect(x - 2, 48, 16, 4, STONE[0]);
    g.hline(x - 2, x + 13, 51, STONE[2]);
    g.rect(x - 2, 106, 16, 4, STONE[1]);
  }
  // 계단
  g.rect(6, 110, w - 12, 4, STONE[0]);
  g.rect(3, 114, w - 6, 4, STONE[1]);
  g.rect(0, 118, w, 4, STONE[2]);
  g.hline(6, w - 7, 113, STONE[2]);
  g.hline(3, w - 4, 117, STONE[3]);
  // 계단 위 붉은 융단
  g.rect(cx - 14, 110, 28, 12, '#d8423a');
  g.vline(cx - 14, 110, 121, gold);
  g.vline(cx + 13, 110, 121, gold);
  g.hline(cx - 13, cx + 12, 113, '#a8342a');
  g.hline(cx - 13, cx + 12, 117, '#a8342a');
  return doneFramed(g);
}

// 광장 본관: 가운데가 앞으로 나온 큰 건물. 삼각 지붕에 시계, 기둥이 받치는 현관, 양쪽 날개에 둥근 창문.
function mainHall() {
  const w = 192;
  const cx = 96;
  const roof = ['#ffc08a', '#f08a32', '#b85e1c'];
  const wall = ['#fff6dc', '#fbe7bf', '#e3c896'];
  const g = new Grid(w, 140);
  // 날개 벽과 지붕
  g.rect(4, 66, w - 8, 64, wall[1]);
  g.rect(4, 66, w - 8, 3, wall[2]);
  g.rect(4, 124, w - 8, 6, STONE[2]);
  g.hline(4, w - 5, 124, STONE[1]);
  for (let y = 44; y <= 65; y++) {
    const inset = Math.round(((65 - y) / 22) * 20);
    roofLine(g, inset, w - 1 - inset, y, roof);
  }
  g.hline(0, w - 1, 65, roof[2]);
  g.hline(0, w - 1, 66, OUTLINE);
  for (const x of [12, 36]) {
    for (const wx of [x, w - 12 - x]) {
      archWindowAt(g, wx, 86, wall[2]);
      flowerBox(g, wx, 86);
    }
  }
  // 가운데 건물
  const bx0 = cx - 34;
  const bx1 = cx + 33;
  g.rect(bx0, 46, 68, 84, wall[0]);
  g.vline(bx0 - 1, 46, 129, OUTLINE);
  g.vline(bx1 + 1, 46, 129, OUTLINE);
  g.vline(bx1, 47, 123, wall[2]);
  g.vline(bx1 - 1, 47, 123, wall[1]);
  g.rect(bx0, 124, 68, 6, STONE[2]);
  g.hline(bx0, bx1, 124, STONE[1]);
  // 삼각 지붕과 시계
  for (let y = 10; y <= 45; y++) {
    const half = Math.round(((y - 9) / 36) * 42);
    roofLine(g, cx - half, cx + half - 1, y, roof);
    if (y >= 20 && y <= 42 && half > 12) g.hline(cx - half + 8, cx + half - 9, y, wall[0]);
  }
  g.hline(cx - 42, cx + 41, 45, roof[2]);
  g.hline(cx - 42, cx + 41, 46, OUTLINE);
  g.ellipse(cx - 11, 21, cx + 10, 42, OUTLINE);
  g.ellipse(cx - 10, 22, cx + 9, 41, '#fffaf0');
  g.vline(cx, 25, 32, OUTLINE);
  g.hline(cx, cx + 5, 32, OUTLINE);
  [[0, -9], [0, 8], [-9, 0], [8, 0]].forEach(([dx, dy]) => g.set(cx + dx, 32 + dy, '#9a8a6a'));
  // 2층 창문과 띠 장식, 현판
  for (const x of [cx - 26, cx - 6, cx + 14]) windowAt(g, x, 53, wall[2]);
  g.rect(bx0, 74, 68, 4, STONE[1]);
  g.hline(bx0, bx1, 77, STONE[2]);
  g.rect(cx - 22, 80, 44, 9, OUTLINE);
  g.rect(cx - 21, 81, 42, 7, '#3f6fb0');
  for (let x = cx - 17; x <= cx + 15; x += 5) g.rect(x, 83, 3, 3, '#ffffff');
  // 현관: 기둥 두 개가 받치는 지붕 아래 큰 양문
  g.rect(cx - 29, 91, 58, 4, STONE[0]);
  g.hline(cx - 29, cx + 28, 94, STONE[2]);
  g.rect(cx - 15, 104, 30, 26, OUTLINE);
  g.ellipse(cx - 15, 96, cx + 14, 112, OUTLINE);
  g.ellipse(cx - 14, 97, cx + 13, 111, '#8fd0ff');
  g.rect(cx - 14, 105, 28, 25, '#2f6fb0');
  g.hline(cx - 14, cx + 13, 104, '#ffd23d');
  g.vline(cx - 1, 105, 129, '#245890');
  g.vline(cx, 105, 129, '#245890');
  g.rect(cx - 11, 108, 7, 9, '#8fd0ff');
  g.rect(cx + 4, 108, 7, 9, '#8fd0ff');
  g.set(cx - 3, 120, '#ffd23d');
  g.set(cx + 2, 120, '#ffd23d');
  for (const x of [cx - 26, cx + 19]) {
    g.rect(x, 95, 7, 29, '#fffaf0');
    g.vline(x + 5, 97, 121, STONE[1]);
    g.vline(x + 6, 97, 121, STONE[2]);
    g.rect(x - 1, 95, 9, 3, STONE[0]);
    g.hline(x - 1, x + 7, 97, STONE[2]);
    g.rect(x - 1, 121, 9, 3, STONE[1]);
  }
  // 계단
  g.rect(cx - 30, 130, 60, 3, STONE[0]);
  g.rect(cx - 35, 133, 70, 3, STONE[1]);
  g.rect(cx - 40, 136, 80, 4, STONE[2]);
  g.hline(cx - 30, cx + 29, 132, STONE[2]);
  g.hline(cx - 35, cx + 34, 135, STONE[3]);
  // 깃발
  g.vline(cx, 0, 9, '#7a7a8e');
  g.rect(cx + 1, 1, 11, 7, '#ffcf2e');
  g.hline(cx + 1, cx + 11, 7, '#e39b12');
  g.rect(cx + 4, 3, 3, 2, '#ffffff');
  return doneFramed(g);
}

export const OBJECTS = {
  mainhall: { label: '광장 본관', draw: mainHall },
  school: { label: '강의실 (학교)', draw: school },
  examhall: { label: '시험장', draw: examHall },
  tree: { label: '둥근 나무', draw: () => treeRound(1) },
  tree2: { label: '둥근 나무 2', draw: () => treeRound(2) },
  pine: { label: '소나무', draw: treePine },
  bush: { label: '덤불', draw: bush },
  flowers: { label: '꽃밭', draw: flowerPatch, flat: true },
  rock: { label: '바위', draw: rock },
  fence: { label: '울타리', draw: fence },
  bench: { label: '벤치', draw: bench },
  lamp: { label: '가로등', draw: lamp },
  fountain: { label: '분수', draw: () => fountain(0), frames: 2, drawFrame: fountain },
  sign: { label: '표지판', draw: () => signpost() },
  flag: { label: '깃발', draw: flag },
  balloons: { label: '풍선', draw: balloons },
  desk: { label: '책상', draw: desk },
  chair: { label: '의자', draw: chair },
  chalkboard: { label: '칠판', draw: chalkboard },
  bookshelf: { label: '책장', draw: bookshelf },
  computer: { label: '컴퓨터 책상', draw: computerDesk },
  plant: { label: '화분', draw: plant },
  trophy: { label: '트로피', draw: trophy },
  sprout: { label: '새싹', draw: sprout },
  stage: { label: '이벤트 무대', draw: () => tent(0), frames: 2, drawFrame: tent },
  hall: { label: '메인 광장 건물', draw: () => building({ w: 168, wallH: 60, clock: true, windows: 4, flagOn: true }) },
  library: { label: '도서관', draw: () => building({ w: 128, wallH: 52, roof: ['#c9a3ff', '#8f5ae0', '#5e34a8'], windows: 4 }) },
  classroom: { label: '강의실', draw: () => building({ w: 120, wallH: 48, roof: ['#9fb0c8', '#6a7f9e', '#46586f'], wall: ['#fffaf0', '#f3e6cc', '#d8c39c'], windows: 4 }) },
  counsel: { label: '상담실', draw: () => building({ w: 96, wallH: 44, roof: ['#a8ef7a', '#4fae4a', '#2c7a36'], windows: 2 }) },
  lab: { label: '체험실', draw: () => building({ w: 112, wallH: 48, roof: ['#9ad6ff', '#3f8dff', '#2656c4'], windows: 4 }) },
};

export const OBJECT_KEYS = Object.keys(OBJECTS);
