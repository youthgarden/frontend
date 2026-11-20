// 청년 유치원 캐릭터. 컨셉 이미지의 캐릭터를 격자 단위로 옮겨 그린다.
// 프레임 48x64. 스프라이트 시트 배치: 행 = 방향(down, left, right, up), 열 = 걷기 0~3 + 숨쉬기 4
//
// 그리기 좌표는 컨셉 격자 기준(캐릭터 폭 0~37, 높이 0~58)이고,
// 프레임 안에서는 (OX, OY)만큼 옮겨진다. 좌우 대칭축은 x 18과 19 사이다.

import { Grid, makeCanvas } from './grid.js';
import {
  OUTLINE, INK, WHITE, SKIN, HAIR, HAT_LEVELS, UNIFORM, BAG,
  BLUSH, MOUTH, MOUTH_DARK, TONGUE, HEART, darken,
} from './palette.js';

export const FRAME_W = 48;
export const FRAME_H = 64;
export const FRAME = FRAME_W; // 이전 이름 호환
export const DIRS = ['down', 'left', 'right', 'up'];
export const COLS = 5;

const OX = 5;
const OY = 4;
const mx = (x) => 37 - x;

export const EMOTIONS = [
  { id: 'basic', label: '기본' },
  { id: 'friendly', label: '친근해요' },
  { id: 'excited', label: '신나요!' },
  { id: 'curious', label: '궁금해요' },
  { id: 'determined', label: '열심히!' },
  { id: 'love', label: '최고예요!' },
];

// 감정마다 머리 위에 띄우는 아이콘 (emotes.js의 키)
export const EMOTION_EMOTE = {
  basic: null,
  friendly: null,
  excited: null,
  curious: 'question',
  determined: 'sparkle',
  love: 'heart',
};

// [개수, 값] 쌍을 펼쳐 28칸(x 5~32) 배열로 만든다
const F = (...pairs) => pairs.flatMap(([n, v]) => Array(n).fill(v));

// fringe: x 5~32 각 열에서 머리카락이 내려오는 마지막 y (그 아래는 얼굴)
// nape: 뒷모습에서 머리카락이 덮는 마지막 y / puff: 머리 바깥으로 부푼 폭
// mass: 등 뒤로 내려오는 머리 [y 시작, y 끝, 왼쪽 x] (좌우 대칭)
export const HAIR_STYLES = {
  short: {
    label: '짧은 머리', nape: 29, puff: 1,
    fringe: F([3, 23], [1, 22], [3, 21], [2, 17], [2, 20], [2, 21], [3, 19], [1, 18], [3, 20], [2, 21], [1, 20], [1, 22], [4, 23]),
  },
  spiky: {
    label: '삐침 머리', nape: 29, puff: 1,
    fringe: [23, 23, 22, 21, 19, 21, 18, 20, 17, 20, 18, 21, 17, 19, 17, 21, 18, 20, 17, 20, 18, 21, 19, 21, 22, 23, 23, 23],
  },
  bowl: { label: '바가지 머리', nape: 30, puff: 1, fringe: F([4, 24], [20, 21], [4, 24]) },
  side: {
    label: '옆가르마', nape: 29, puff: 1,
    fringe: [23, 23, 23, 23, 22, 22, 22, 21, 21, 21, 20, 20, 20, 19, 19, 19, 18, 18, 17, 17, 16, 16, 17, 19, 22, 23, 23, 23],
  },
  buzz: { label: '까까 머리', nape: 27, puff: 0, fringe: F([2, 19], [1, 18], [1, 17], [20, 16], [1, 17], [1, 18], [2, 19]) },
  curly: {
    label: '곱슬 머리', nape: 30, puff: 2, coversEars: true, curly: true,
    fringe: [27, 27, 26, 24, 20, 21, 20, 19, 20, 21, 20, 19, 20, 21, 20, 19, 20, 21, 20, 19, 20, 21, 20, 19, 24, 26, 27, 27],
    mass: [[13, 28, 2]],
  },
  bob: {
    label: '단발', nape: 32, puff: 2, coversEars: true, curly: true,
    fringe: [33, 33, 33, 33, 20, 20, 20, 19, 20, 20, 20, 20, 19, 20, 20, 20, 20, 19, 20, 20, 20, 20, 19, 20, 33, 33, 33, 33],
    mass: [[14, 24, 1], [25, 32, -1], [33, 34, 0], [35, 35, 2]],
  },
  long: {
    label: '긴 머리', nape: 32, puff: 1, coversEars: true,
    fringe: [33, 33, 33, 32, 20, 20, 20, 20, 19, 20, 20, 17, 17, 20, 20, 20, 19, 20, 20, 20, 20, 20, 19, 20, 32, 33, 33, 33],
    mass: [[14, 24, 2], [25, 33, 1], [34, 41, 0], [42, 43, 1], [44, 44, 3]],
  },
  ponytail: {
    label: '포니테일', nape: 29, puff: 1, tail: 'pony',
    fringe: [22, 22, 21, 20, 20, 20, 20, 19, 19, 18, 18, 17, 17, 18, 18, 19, 19, 20, 20, 20, 20, 20, 20, 20, 23, 25, 26, 26],
  },
  twintail: {
    label: '양갈래', nape: 29, puff: 1, tail: 'twin',
    fringe: [23, 23, 22, 21, 20, 20, 20, 20, 19, 19, 20, 20, 18, 18, 20, 20, 19, 19, 20, 20, 20, 20, 20, 20, 21, 22, 23, 23],
  },
};

const DEFAULTS = {
  skin: 'light',
  hair: { style: 'short', color: 'darkbrown' },
  bottom: 'shorts',
  bag: 'orange',
  glasses: false,
  pin: null,
  level: 1,
  emotion: 'basic',
};

function resolve(spec) {
  const s = { ...DEFAULTS, ...spec, hair: { ...DEFAULTS.hair, ...(spec.hair || {}) } };
  s.sk = SKIN[s.skin];
  s.hr = HAIR[s.hair.color];
  s.st = HAIR_STYLES[s.hair.style];
  s.hat = HAT_LEVELS[Math.min(Math.max(s.level, 1), HAT_LEVELS.length) - 1];
  s.bg = s.bag ? BAG[s.bag] : null;
  return s;
}

// 프레임별 움직임: u = 상체 높이, lift = 들린 발, arm = 팔 흔들림, stride = 옆모습 보폭
function motion(f) {
  return {
    u: f === 1 || f === 3 ? -1 : f === 4 ? 1 : 0,
    liftL: f === 1,
    liftR: f === 3,
    armL: f === 1 ? 1 : f === 3 ? -1 : 0,
    armR: f === 1 ? -1 : f === 3 ? 1 : 0,
    stride: f === 1 ? 1 : f === 3 ? -1 : 0,
  };
}

// 부위 하나를 따로 그려 윤곽선을 두른 뒤 본 그림에 겹친다.
// soft: 이 색들 위에 떨어지는 윤곽선은 검은 선 대신 soft[2](그늘색)로 바꾼다.
// 같은 색 머리카락끼리 겹칠 때 안쪽에 검은 선이 생기지 않게 한다.
function layer(main, u, fn, soft) {
  const g = new Grid(FRAME_W, FRAME_H);
  g.ox = OX;
  g.oy = OY + u;
  fn(g);
  const before = g.d.slice();
  g.outline(OUTLINE);
  if (soft) {
    for (let i = 0; i < g.d.length; i++) {
      if (!before[i] && g.d[i] && soft.includes(main.d[i])) g.d[i] = soft[2];
    }
  }
  main.blit(g, 0, 0);
}

// 머리(얼굴) 영역. 컨셉처럼 턱이 넓적한 둥근 사각형에 가깝다.
function headIn(x, y) {
  const dx = Math.abs((x + 0.5 - 19) / 14);
  const dy = Math.abs((y + 0.5 - 22) / 11);
  return Math.pow(dx, 2.5) + Math.pow(dy, 2.5) <= 1;
}

// ───────────────────────── 모자 ─────────────────────────

// 컨셉 이미지의 벙거지 모자: 머리를 덮는 둥근 돔(y 0~8)에, 머리 양옆으로 퍼지며 아래로 기우는 챙.
const DOME = [[13, 24], [11, 26], [9, 28], [8, 29], [7, 30], [6, 31], [6, 31], [5, 32], [5, 32]];
const BRIM_X0 = -2;
const BRIM_X1 = 39;
const brimD = (x) => Math.abs(x + 0.5 - 19) / 21;
const brimTop = (x) => 9 + Math.round(Math.pow(brimD(x), 2.2) * 4);
const brimBot = (x) => brimTop(x) + (brimD(x) > 0.82 ? 2 : 3);

function drawHat(g, s) {
  const [hi, base, mid] = s.hat.ramp;
  const dark = darken(mid, 0.18);
  // 돔
  DOME.forEach(([x0, x1], i) => g.hline(x0, x1, i, base));
  // 오른쪽 그늘, 왼쪽 반사광
  DOME.forEach(([x0, x1], i) => {
    if (i >= 2) g.hline(x1 - 1, x1, i, mid);
    if (i >= 2 && i <= 7) g.set(x0 + 1, i, hi);
  });
  g.hline(10, 12, 2, hi);
  g.hline(9, 10, 3, hi);
  g.hline(8, 9, 4, hi);
  // 세로 이음선
  for (let y = 0; y <= 8; y++) {
    const off = Math.round(4 + Math.sqrt(y + 1) * 1.6);
    g.set(18 - off, y, mid);
    g.set(mx(18 - off), y, mid);
  }
  // 꼭지 단추
  g.hline(16, 21, -1, base);
  g.hline(17, 20, -1, hi);
  g.hline(16, 21, 0, mid);
  // 챙: 가운데에서 양 끝으로 갈수록 아래로 기운다
  for (let x = BRIM_X0; x <= BRIM_X1; x++) {
    const top = brimTop(x);
    const bot = brimBot(x);
    // 돔 아래와 챙 사이가 비지 않게 메운다
    if (x >= 5 && x <= 32) g.vline(x, 9, top, base);
    for (let y = top; y <= bot; y++) {
      let c = base;
      if (y === bot) c = dark;
      else if (y === bot - 1) c = mid;
      else if (y === top && x >= 2 && x <= 14) c = hi;
      g.set(x, y, c);
    }
  }
  // 돔과 챙이 만나는 이음선
  for (let x = 5; x <= 32; x++) g.set(x, brimTop(x), mid);
  if (s.hat.max) {
    g.map(27, -4, ['...w...', '...w...', '..wyw..', 'wwyyyww', '..wyw..', '...w...', '...w...'], { w: '#fffbe0', y: '#ffe14a' });
  }
}

// ───────────────────────── 얼굴 ─────────────────────────

// 눈은 5x6칸. 왼쪽 위에 흰 반사광, 아래쪽에 밝은 갈색 홍채가 있다.
function eyeOpen(g, x, y) {
  g.hline(x + 1, x + 3, y, INK);
  g.rect(x, y + 1, 5, 4, INK);
  g.hline(x + 1, x + 3, y + 5, '#4a2e20');
  g.set(x, y + 1, WHITE);
  g.set(x + 1, y + 1, WHITE);
  g.set(x, y + 2, WHITE);
}
function eyeArc(g, x, y) {
  [[0, 4], [0, 3], [1, 2], [2, 2], [3, 2], [4, 3], [4, 4]].forEach(([dx, dy]) => g.set(x + dx, y + dy, INK));
}
function eyeHeart(g, x, y) {
  g.map(x - 1, y, ['.hh.hh.', 'hphhhhh', 'hhhhhhh', '.hhhhh.', '..hhh..', '...h...'], { h: HEART, p: '#ff9fb0' });
}

const FACES = {
  basic: { eye: eyeOpen, mouth: 'smile' },
  friendly: { eye: eyeArc, mouth: 'open' },
  excited: { eye: eyeArc, mouth: 'laugh' },
  curious: { eye: eyeOpen, mouth: 'o', brow: 'raise' },
  determined: { eye: eyeOpen, mouth: 'grin', brow: 'angry' },
  love: { eye: eyeHeart, mouth: 'open' },
};

function drawMouth(g, kind, cx, y) {
  // cx: 입 가운데 왼쪽 칸 (앞모습 18)
  if (kind === 'smile') {
    g.set(cx - 2, y, MOUTH);
    g.set(cx + 3, y, MOUTH);
    g.hline(cx - 1, cx + 2, y + 1, MOUTH);
  } else if (kind === 'grin') {
    g.set(cx - 3, y, MOUTH);
    g.set(cx + 4, y, MOUTH);
    g.hline(cx - 2, cx + 3, y + 1, MOUTH);
  } else if (kind === 'open') {
    g.hline(cx - 2, cx + 3, y, MOUTH_DARK);
    g.hline(cx - 2, cx + 3, y + 1, MOUTH);
    g.hline(cx - 1, cx + 2, y + 2, TONGUE);
  } else if (kind === 'laugh') {
    g.hline(cx - 3, cx + 4, y - 1, MOUTH_DARK);
    g.hline(cx - 3, cx + 4, y, MOUTH);
    g.hline(cx - 2, cx + 3, y + 1, MOUTH);
    g.hline(cx - 2, cx + 3, y + 2, TONGUE);
    g.hline(cx - 1, cx + 2, y + 3, TONGUE);
    g.hline(cx - 1, cx + 2, y - 1, WHITE);
  } else if (kind === 'o') {
    g.rect(cx, y, 2, 2, MOUTH_DARK);
  }
}

function drawFace(g, s, view) {
  const face = FACES[s.emotion] || FACES.basic;
  const browC = s.hr[2];
  if (view === 'down') {
    face.eye(g, 10, 22);
    face.eye(g, 23, 22);
    g.rect(6, 27, 4, 2, BLUSH);
    g.rect(28, 27, 4, 2, BLUSH);
    drawMouth(g, face.mouth, 18, 29);
    if (face.brow === 'angry') {
      [[9, 18], [10, 18], [11, 19], [12, 19], [13, 20], [14, 20]].forEach(([x, y]) => { g.set(x, y, INK); g.set(mx(x), y, INK); });
    } else if (face.brow === 'raise') {
      [[9, 20], [10, 19], [11, 18], [12, 18], [13, 19], [14, 20]].forEach(([x, y]) => g.set(x, y, INK));
      g.hline(23, 27, 20, INK);
    } else if (face.eye === eyeOpen) {
      // 앞머리 아래로 살짝 보이는 눈썹 (머리카락에 가려지면 안 보인다)
      for (const x of [10, 11, 12, 13]) {
        if (g.get(x + OX, 20 + g.oy) === s.sk[1]) g.set(x, 20, browC);
        if (g.get(mx(x) + OX, 20 + g.oy) === s.sk[1]) g.set(mx(x), 20, browC);
      }
    }
    return;
  }
  // 옆모습 (오른쪽을 본다)
  face.eye(g, 24, 22);
  // 볼과 입은 머리 윤곽 안쪽에만 그린다. 윤곽 밖으로 나가면 얼굴 선이 울퉁불퉁해 보인다.
  g.rect(28, 27, 3, 2, BLUSH);
  const y = 29;
  if (face.mouth === 'smile' || face.mouth === 'grin') {
    g.set(27, y + 1, MOUTH); g.set(28, y + 1, MOUTH); g.set(29, y, MOUTH);
  } else if (face.mouth === 'o') {
    g.rect(28, y, 2, 2, MOUTH_DARK);
  } else {
    g.hline(26, 29, y, MOUTH_DARK);
    g.hline(26, 29, y + 1, MOUTH);
    g.hline(26, 27, y + 2, TONGUE);
  }
  if (face.brow === 'angry') [[23, 18], [24, 18], [25, 19], [26, 19], [27, 20], [28, 20]].forEach(([bx, by]) => g.set(bx, by, INK));
  if (face.brow === 'raise') g.hline(24, 28, 19, INK);
}

function drawGlasses(g, s, view) {
  if (!s.glasses) return;
  const c = '#191316';
  const ring = (x) => {
    g.hline(x + 1, x + 7, 20, c);
    g.hline(x + 1, x + 7, 29, c);
    g.vline(x, 21, 28, c);
    g.vline(x + 8, 21, 28, c);
  };
  if (view === 'down') {
    ring(8);
    ring(21);
    g.hline(17, 20, 23, c);
    g.hline(17, 20, 24, c);
    g.hline(4, 7, 23, c);
    g.hline(30, 33, 23, c);
  } else {
    ring(22);
    g.hline(15, 21, 23, c);
  }
}

// ───────────────────────── 머리와 머리카락 ─────────────────────────

function drawSkull(g, s) {
  const [, sk, sd] = s.sk;
  for (let y = 11; y <= 32; y++)
    for (let x = 4; x <= 33; x++) if (headIn(x, y)) g.set(x, y, headIn(x, y + 1) ? sk : sd);
}

function drawEars(g, s, view) {
  if (s.st.coversEars) return;
  const [, sk, sd] = s.sk;
  if (view === 'right') {
    g.rect(15, 23, 3, 5, sk);
    g.vline(16, 24, 26, sd);
    g.vline(14, 23, 27, OUTLINE);
    return;
  }
  for (const x of [3, 33]) g.rect(x, 23, 2, 5, sk);
  g.vline(4, 24, 26, sd);
  g.vline(33, 24, 26, sd);
}

function hairFront(g, s) {
  const st = s.st;
  const [hh, hb, hd] = s.hr;
  for (let x = 5 - st.puff; x <= 32 + st.puff; x++) {
    const i = Math.min(27, Math.max(0, x - 5));
    const bottom = st.fringe[i];
    const lock = i < 4 || i > 23; // 옆머리 열은 턱 아래로도 곧게 내려온다
    const outside = x < 5 || x > 32;
    for (let y = outside ? 14 : 11; y <= bottom - (outside ? 1 : 0); y++) {
      if (!(headIn(x, y) || (lock && y >= 16) || outside)) continue;
      if (st.curly && outside && (x === 5 - st.puff || x === 32 + st.puff) && y % 3 === 0) continue;
      g.set(x, y, y >= bottom - (outside ? 1 : 0) ? hd : hb);
    }
  }
  // 머릿결
  [[9, 15], [10, 15], [11, 15], [10, 16], [24, 15], [25, 15]].forEach(([x, y]) => {
    if (y < st.fringe[x - 5] - 1) g.set(x, y, hh);
  });
  for (const x of [13, 20, 26]) {
    const b = st.fringe[x - 5];
    if (b >= 18) g.vline(x, 15, b - 1, hd);
  }
}

function hairBack(g, s) {
  const st = s.st;
  const [hh, hb, hd] = s.hr;
  for (let y = 11; y <= st.nape; y++)
    for (let x = 5 - st.puff; x <= 32 + st.puff; x++) {
      const outside = x < 5 || x > 32;
      if (!(headIn(x, y) || (outside && y >= 14 && y <= st.nape - 3))) continue;
      if (st.curly && outside && (x === 5 - st.puff || x === 32 + st.puff) && y % 3 === 0) continue;
      g.set(x, y, y >= st.nape - 1 ? hd : hb);
    }
  g.hline(11, 14, 15, hh);
  g.hline(12, 13, 16, hh);
}

function hairSide(g, s) {
  const st = s.st;
  const [hh, hb, hd] = s.hr;
  for (let y = 11; y <= 32; y++)
    for (let x = 5 - st.puff; x <= 32; x++) {
      const outside = x < 5;
      // 귀가 보이는 머리는 귀 뒤(x 13~17)에서 귀 위까지만 덮는다. 아래까지 덮으면 볼에 어두운 선이 생긴다
      const bottom = !st.coversEars && x >= 13 ? 22 : st.nape;
      const back = x <= 17 && y <= bottom && (headIn(x, y) || (outside && y >= 14 && y <= st.nape - 3));
      // 앞모습의 옆머리(귀 옆으로 길게 내려오는 부분)는 옆모습에서 얼굴 앞을 덮지 않도록 눈썹 높이에서 자른다
      const brow = Math.min(st.fringe[x - 5], 21);
      const fr = x >= 18 && headIn(x, y) && y <= brow;
      const burn = x >= 18 && x <= 19 && y <= 24 && headIn(x, y);
      if (!(back || fr || burn)) continue;
      const edge = (back && y >= bottom - 1) || (fr && y === brow);
      g.set(x, y, edge ? hd : hb);
    }
  g.hline(8, 11, 15, hh);
  g.hline(9, 10, 16, hh);
  for (const x of st.coversEars ? [9, 13] : [9]) g.vline(x, 18, st.nape - 3, hd);
}

// 등 뒤로 내려오는 머리 덩어리. half가 true면 옆모습용으로 뒤쪽 절반만 그린다.
function hairMass(g, s, half) {
  const st = s.st;
  if (!st.mass) return;
  const [hh, hb, hd] = s.hr;
  const last = st.mass[st.mass.length - 1][1];
  for (const [y0, y1, x0] of st.mass) {
    for (let y = y0; y <= y1; y++) {
      const wob = st.curly ? (y % 4 === 0 ? 1 : 0) : y % 6 === 0 ? 1 : 0;
      const a = x0 + wob;
      const b = half ? 16 : mx(a);
      g.hline(a, b, y, y >= last - 1 ? hd : hb);
    }
  }
  const first = st.mass[0][0];
  const end = half ? 14 : 33;
  for (let x = 6; x <= end; x += 7) g.vline(x, last - 9, last - 2, hd);
  g.vline(st.mass[0][2] + 2, first + 2, first + 6, hh);
  // 끝자락 물결
  if (!st.curly) {
    for (let x = st.mass[st.mass.length - 1][2] + 1; x <= (half ? 14 : 34); x += 4) g.clear(x, last);
  }
}

// 포니테일의 줄별 폭 [안쪽, 바깥쪽]. 0이 머리에 붙는 쪽이고 y 15부터 한 줄씩 내려간다.
const PONY_ROWS = [
  [0, 3], [0, 4], [0, 5], [1, 6], [1, 6], [1, 6], [1, 7],
  [2, 7], [2, 7], [2, 7], [2, 7], [2, 7], [2, 7], [2, 7], [2, 7],
  [2, 6], [2, 6], [2, 6], [2, 6], [2, 6], [3, 6], [3, 6], [3, 6], [4, 7], [5, 7], [6, 7],
];

function drawTails(g, s, view) {
  const st = s.st;
  if (!st.tail) return;
  const [hh, hb, hd] = s.hr;
  const tie = '#ff6b8a';
  const blob = (x0, y0, x1, y1) => {
    g.ellipse(x0, y0, x1, y1, hb);
    g.ellipse(x0, y0, x1, y1, hd, (x, y) => y >= y1 - 2 || x >= x1 - 1);
    g.vline(x0 + 2, y0 + 3, y0 + 7, hh);
  };
  if (st.tail === 'pony') {
    // 옆으로 묶은 머리. 앞모습에서는 오른쪽, 뒷모습과 옆모습에서는 왼쪽(머리 뒤)에 온다.
    const at = view === 'down' ? (dx) => 33 + dx : (dx) => 4 - dx;
    PONY_ROWS.forEach(([a, b], i) => {
      const y = 15 + i;
      for (let dx = a; dx <= b; dx++) {
        const last = i === PONY_ROWS.length - 1;
        g.set(at(dx), y, dx === b || last ? hd : dx === a + 1 && y >= 22 && y <= 29 ? hh : hb);
      }
    });
    // 머리끈. 머리 테두리에 가려지지 않게 머리에서 두 칸 떨어뜨린다
    for (const dx of [2, 3]) g.vline(at(dx), 17, 19, tie);
  } else {
    if (view === 'down' || view === 'up') {
      blob(-3, 19, 5, 38);
      blob(32, 19, 40, 38);
      g.rect(3, 20, 2, 3, tie);
      g.rect(33, 20, 2, 3, tie);
    }
    if (view === 'right') { blob(-3, 19, 6, 38); g.rect(4, 20, 2, 3, tie); }
  }
}

function drawPin(g, s, view) {
  if (!s.pin || view === 'up') return;
  const x = view === 'down' ? 27 : 20;
  g.map(x, 15, ['.p.', 'pyp', '.p.'], { p: s.pin, y: '#fff3a0' });
}

// ───────────────────────── 몸 ─────────────────────────

function drawLegs(g, s, m, view) {
  const [, sk, sd] = s.sk;
  const [sh0, sh1, sh2] = UNIFORM.shoe;
  if (view === 'right') {
    const leg = (x, shade) => {
      g.rect(x, 46, 4, 8, shade ? sd : sk);
      g.rect(x, 54, 4, 1, shade ? '#dfe6ee' : UNIFORM.sock);
      g.rect(x, 55, 6, 2, shade ? sh1 : sh0);
      g.hline(x, x + 5, 57, sh2);
    };
    leg(16 - m.stride * 3, true);
    leg(18 + m.stride * 3, false);
    return;
  }
  const leg = (x, lifted, shoeX) => {
    const up = lifted ? 2 : 0;
    g.rect(x, 46, 5, 8 - up, sk);
    g.vline(x + 4, 46, 53 - up, sd);
    g.rect(x, 54 - up, 5, 1, UNIFORM.sock);
    g.rect(shoeX, 55 - up, 6, 2, sh0);
    g.hline(shoeX, shoeX + 5, 57 - up, sh2);
    g.hline(shoeX + 1, shoeX + 4, 55 - up, view === 'up' ? sh1 : '#c08a5c');
  };
  leg(13, m.liftL, 12);
  leg(20, m.liftR, 20);
}

function drawTorso(g, s, view) {
  const [hi, base, sh] = UNIFORM.shirt;
  const [c0, c1] = UNIFORM.collar;
  const [, , sd] = s.sk;
  const side = view === 'right';
  const x0 = side ? 14 : 12;
  const x1 = side ? 23 : 25;
  // 하의
  if (s.bottom === 'skirt') {
    const [, kb, kd] = UNIFORM.skirt;
    for (let y = 44; y <= 51; y++) {
      const fl = Math.floor((y - 44) / 2);
      g.hline(x0 - 1 - fl, x1 + 1 + fl, y, y === 51 ? kd : kb);
    }
    for (let x = x0; x <= x1; x += 3) g.vline(x, 46, 51, kd);
  } else {
    const [bh, bb, bd] = s.bottom === 'navy' ? UNIFORM.navy : UNIFORM.shorts;
    g.rect(x0 - 1, 45, x1 - x0 + 3, 6, bb);
    g.hline(x0 - 1, x1 + 1, 50, bd);
    g.vline(x1 + 1, 45, 50, bd);
    g.vline(x0, 46, 48, bh);
    if (!side) g.vline(18, 48, 50, OUTLINE), g.vline(19, 48, 50, OUTLINE);
  }
  // 셔츠
  g.rect(x0, 35, x1 - x0 + 1, 10, base);
  g.vline(x1, 36, 44, sh);
  g.vline(x1 - 1, 40, 44, sh);
  g.hline(x0, x1, 44, sh);
  g.vline(x0 + 1, 37, 41, hi);
  // 목
  g.rect(side ? 17 : 16, 33, side ? 5 : 6, 2, sd);
  if (view === 'down') {
    for (const lobe of [[14, 17, 34], [13, 17, 35], [14, 16, 36]]) {
      g.hline(lobe[0], lobe[1], lobe[2], c0);
      g.hline(mx(lobe[1]), mx(lobe[0]), lobe[2], c0);
    }
    g.set(15, 36, c1);
    g.set(mx(15), 36, c1);
    g.set(18, 35, sd);
    g.set(19, 35, sd);
    g.set(19, 38, '#fff6c0');
    g.set(19, 41, '#fff6c0');
  } else if (view === 'up') {
    g.hline(13, 24, 34, c0);
    g.hline(14, 23, 35, c0);
    g.hline(16, 21, 36, c1);
  } else {
    g.hline(20, 24, 34, c0);
    g.hline(20, 25, 35, c0);
    g.hline(21, 24, 36, c1);
  }
}

function drawArm(g, s, x, dy, flip) {
  // x: 팔 바깥쪽 기준 열. flip이면 좌우를 뒤집어 그린다.
  const [, base, sh] = UNIFORM.shirt;
  const [, sk, sd] = s.sk;
  const p = (ax) => (flip ? mx(ax) : ax);
  const hl = (a, b, y, c) => g.hline(Math.min(p(a), p(b)), Math.max(p(a), p(b)), y + dy, c);
  hl(10, 11, 36, base);
  hl(9, 11, 37, base);
  hl(9, 11, 38, base);
  hl(9, 11, 39, sh);
  hl(8, 11, 40, WHITE);
  hl(8, 10, 41, sk);
  hl(8, 10, 42, sk);
  hl(8, 10, 43, sk);
  hl(8, 10, 44, sk);
  hl(7, 10, 45, sk);
  hl(7, 10, 46, sk);
  hl(8, 10, 47, sd);
  void x;
}

function drawArmSide(g, s, m) {
  const [, base, sh] = UNIFORM.shirt;
  const [, sk, sd] = s.sk;
  const dx = m.stride * 2;
  g.rect(17 + dx, 36, 4, 4, base);
  g.hline(17 + dx, 20 + dx, 39, sh);
  g.hline(17 + dx, 20 + dx, 40, WHITE);
  g.rect(18 + dx, 41, 3, 6, sk);
  g.hline(18 + dx, 20 + dx, 47, sd);
}

function drawBag(g, s, view) {
  if (!s.bg) return;
  const [hi, base, sh] = s.bg;
  const bag = (x) => {
    g.rect(x, 45, 8, 6, base);
    g.rect(x, 45, 8, 2, hi);
    g.hline(x, x + 7, 47, sh);
    g.hline(x, x + 7, 50, sh);
    g.set(x + 4, 48, '#ffe9a0');
  };
  if (view === 'down') {
    for (let i = 0; i <= 9; i++) { g.set(13 + i, 36 + i, sh); g.set(14 + i, 36 + i, base); }
    bag(21);
  } else if (view === 'up') {
    for (let i = 0; i <= 9; i++) { g.set(24 - i, 36 + i, sh); g.set(23 - i, 36 + i, base); }
    g.rect(9, 45, 4, 6, base);
    g.hline(9, 12, 50, sh);
  } else {
    for (let i = 0; i <= 8; i++) { g.set(21 - i, 36 + i, sh); g.set(20 - i, 36 + i, base); }
    bag(7);
  }
}

// ───────────────────────── 조립 ─────────────────────────

export function drawCharacter(spec, dir = 'down', frame = 0) {
  const s = resolve(spec);
  const view = dir === 'left' ? 'right' : dir;
  const m = motion(frame);
  const main = new Grid(FRAME_W, FRAME_H);
  const u = m.u;

  // 1. 몸 뒤로 가는 머리카락
  if (view === 'down') layer(main, u, (g) => { hairMass(g, s, false); drawTails(g, s, view); });
  if (view === 'right') layer(main, u, (g) => { hairMass(g, s, true); drawTails(g, s, view); });
  if (view === 'up') layer(main, u, (g) => drawTails(g, s, view));

  // 2. 다리
  layer(main, 0, (g) => drawLegs(g, s, m, view));

  // 3. 몸통, 팔, 가방
  if (view === 'right') {
    layer(main, u, (g) => drawTorso(g, s, view));
    layer(main, u, (g) => drawBag(g, s, view));
    layer(main, u, (g) => drawArmSide(g, s, m));
  } else {
    layer(main, u, (g) => drawTorso(g, s, view));
    layer(main, u, (g) => drawArm(g, s, 0, m.armL, false));
    layer(main, u, (g) => drawArm(g, s, 0, m.armR, true));
    layer(main, u, (g) => drawBag(g, s, view));
  }

  // 4. 머리
  layer(main, u, (g) => {
    drawSkull(g, s);
    if (view === 'down') {
      hairFront(g, s);
      drawEars(g, s, view);
      drawFace(g, s, view);
      drawGlasses(g, s, view);
      drawPin(g, s, view);
    } else if (view === 'up') {
      drawEars(g, s, view);
      hairBack(g, s);
    } else {
      hairSide(g, s);
      drawEars(g, s, view);
      drawFace(g, s, view);
      drawGlasses(g, s, view);
      drawPin(g, s, view);
    }
  }, s.hr);
  if (view === 'up') layer(main, u, (g) => hairMass(g, s, false), s.hr);

  // 5. 모자
  layer(main, u, (g) => drawHat(g, s));

  return dir === 'left' ? main.flipX() : main;
}

// 240x256 스프라이트 시트 (5열 x 4행, 프레임 48x64)
export function buildCharacterSheet(spec) {
  const c = makeCanvas(FRAME_W * COLS, FRAME_H * DIRS.length);
  const ctx = c.getContext('2d');
  DIRS.forEach((dir, row) => {
    for (let f = 0; f < COLS; f++) drawCharacter(spec, dir, f).drawTo(ctx, f * FRAME_W, row * FRAME_H);
  });
  return c;
}

// 애니메이션 정의. 프레임 번호 = 행 * 5 + 열
export const ANIMS = {};
DIRS.forEach((dir, row) => {
  ANIMS[`walk_${dir}`] = { frames: [0, 1, 2, 3].map((c) => row * COLS + c), frameRate: 8, repeat: -1 };
  ANIMS[`idle_${dir}`] = { frames: [0, 4].map((c) => row * COLS + c), frameRate: 2, repeat: -1 };
});
