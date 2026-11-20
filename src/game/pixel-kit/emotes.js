// 머리 위에 띄우는 감정 아이콘 (12x12). 캐릭터 위쪽 가운데에 붙여 쓴다.

import { Grid } from './grid.js';
import { OUTLINE } from './palette.js';

const ICONS = {
  question: {
    rows: [
      '...wwww...',
      '..wbbbbw..',
      '.wbbwwbbw.',
      '.wbw..wbw.',
      '..w..wbbw.',
      '....wbbw..',
      '....wbw...',
      '....www...',
      '....wbw...',
      '....www...',
    ],
    pal: { w: '#ffffff', b: '#3f6fd8' },
  },
  heart: {
    rows: [
      '..rr..rr..',
      '.rpprrrrr.',
      'rpwprrrrrr',
      'rpprrrrrrr',
      'rrrrrrrrrr',
      '.rrrrrrrr.',
      '..rrrrrr..',
      '...rrrr...',
      '....rr....',
    ],
    pal: { r: '#ff4d6d', p: '#ff9fb3', w: '#ffffff' },
  },
  sparkle: {
    rows: [
      '....y.....',
      '....y.....',
      '...yyy....',
      'yyyywyyy..',
      '...yyy....',
      '....y...w.',
      '....y..wyw',
      '........w.',
    ],
    pal: { y: '#ffd23d', w: '#fffbe0' },
  },
  flame: {
    rows: [
      '....r.....',
      '...rr..r..',
      '..rrr.rr..',
      '.rrorrrr..',
      '.rooorrrr.',
      'rrooyoorr.',
      'rroyyyorr.',
      'rroyyyoor.',
      '.rroyyorr.',
      '..rrrrrr..',
    ],
    pal: { r: '#ef3d3d', o: '#ff9a2e', y: '#ffe14a' },
  },
  note: {
    rows: [
      '....bbbbb.',
      '....bbbbb.',
      '....b...b.',
      '....b...b.',
      '....b...b.',
      '..bbb.bbb.',
      '.bbbbbbbb.',
      '.bbb.bbb..',
    ],
    pal: { b: '#9b57f0' },
  },
  exclaim: {
    rows: [
      '....rr....',
      '....rr....',
      '....rr....',
      '....rr....',
      '....rr....',
      '..........',
      '....rr....',
      '....rr....',
    ],
    pal: { r: '#ef3d3d' },
  },
  sweat: {
    rows: [
      '.....b....',
      '....bb....',
      '...bwbb...',
      '...wbbb...',
      '...bbbb...',
      '....bb....',
    ],
    pal: { b: '#6fc3ff', w: '#ffffff' },
  },
  zzz: {
    rows: [
      '.....bbbb.',
      '.......b..',
      '......b...',
      '.....bbbb.',
      'bbb.......',
      '..b.......',
      '.b........',
      'bbb.......',
    ],
    pal: { b: '#3f6fd8' },
  },
};

export const EMOTE_KEYS = Object.keys(ICONS);

export function drawEmote(key) {
  const icon = ICONS[key];
  const g = new Grid(12, 12);
  const h = icon.rows.length;
  g.map(1, Math.floor((12 - h) / 2), icon.rows, icon.pal);
  return g.outline(OUTLINE);
}
