// 컨셉 이미지(청년 유치원)에서 뽑은 색. 램프는 [밝음, 기본, 그늘] 순서.

export const OUTLINE = '#2e1c14';
export const INK = '#24160f'; // 눈동자
export const WHITE = '#ffffff';

export const SKIN = {
  fair: ['#fff0dc', '#ffdfc0', '#f3bc98'],
  light: ['#ffe6c6', '#fbd3a6', '#eeb088'],
  tan: ['#f6cb9c', '#e6ad7a', '#c88a58'],
  deep: ['#cf9566', '#ad7448', '#875532'],
};

export const HAIR = {
  black: ['#4a4450', '#2a2530', '#17131b'],
  darkbrown: ['#6e4a34', '#4a2e20', '#2e1a12'],
  brown: ['#a8754a', '#7d5032', '#553420'],
  chestnut: ['#d27a4a', '#a8532e', '#7a3a20'],
  blonde: ['#fff0a8', '#f2c75c', '#c9962e'],
  pink: ['#ffc6dc', '#f58fb8', '#d2648f'],
  navy: ['#6a7fbf', '#3e4f8f', '#283466'],
  ash: ['#d8d4d0', '#a9a2a0', '#7c7472'],
  mint: ['#c4f2dc', '#7ed3ad', '#4fa585'],
  lilac: ['#e4d2ff', '#b89af0', '#8a6cc8'],
};

// 레벨별 모자 색 (컨셉의 "레벨업! 모자 색상 변화")
export const HAT_LEVELS = [
  { level: 1, name: '노랑 모자', stage: '새싹 단계', ramp: ['#ffe566', '#fdd22e', '#f0a318'] },
  { level: 2, name: '초록 모자', stage: '성장 단계', ramp: ['#8ff06a', '#3fcf3a', '#1f9a2c'] },
  { level: 3, name: '파랑 모자', stage: '발전 단계', ramp: ['#8fd0ff', '#3f8dff', '#2459c8'] },
  { level: 4, name: '보라 모자', stage: '도약 단계', ramp: ['#d6a8ff', '#9a55f0', '#6a2fc0'] },
  { level: 5, name: '빨강 모자', stage: '리더 단계', ramp: ['#ff9a8a', '#f03a3a', '#b01f2a'] },
  { level: 6, name: '골드 모자', stage: '멘토 단계', ramp: ['#fff3a8', '#ffd53d', '#e09a10'], max: true },
];

export const UNIFORM = {
  shirt: ['#ffe566', '#fdd22e', '#f0a818'],
  collar: ['#ffffff', '#dfe6ee'],
  shorts: ['#4a8ad6', '#2f66b8', '#1f4a8e'],
  navy: ['#4a5670', '#2b3246', '#1a1f2e'],
  skirt: ['#3f5f9e', '#2a3f72', '#1c2a50'],
  sock: '#ffffff',
  shoe: ['#9a6642', '#6b4228', '#3f2416'],
};

export const BAG = {
  orange: ['#f9a82e', '#f08f1e', '#c4651a'],
  red: ['#ff8f80', '#e2463c', '#a82a26'],
  green: ['#9fe08a', '#4caf50', '#2e7d32'],
  sky: ['#a8e0ff', '#4aaee8', '#2a7bb4'],
  brown: ['#d2a06c', '#a8703e', '#74491f'],
};

export const BLUSH = '#f9a894';
export const MOUTH = '#d9534a';
export const MOUTH_DARK = '#8c2b2b';
export const TONGUE = '#ff8f8f';
export const HEART = '#f0364e';

// 색을 검정 쪽으로 t만큼 어둡게 한다 (0~1)
export function darken(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(v * (1 - t)).toString(16).padStart(2, '0');
  return '#' + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}
