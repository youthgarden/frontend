// 광장(World 장면)의 크기와 기준 좌표. 맵(Phaser)과 모의 서버(mock/)가 함께 쓴다.
// 이 파일은 DOM이나 Phaser를 import하지 않는다. 모의 서버가 Node에서 읽기 때문이다.
// 좌표는 화면에 그려지는 맵 픽셀 기준이다 (API 명세서 8절). World.ts는 이 값을 S(2)로 나눠 논리 좌표로 쓴다.
// 맵 크기와 시작 위치는 여기서만 정한다.

/** 30칸 x 22칸, 한 칸 32px, 2배로 그린다 */
export const MAP_WIDTH = 1920;
export const MAP_HEIGHT = 1408;

/** 접속할 때마다 서는 자리: 광장 분수 앞. World.ts의 SPAWN이 이 값을 쓴다 */
export const SPAWN = { x: 960, y: 880 } as const;

/** 광장 돌바닥 중 분수 아래쪽의 범위. 모의 서버의 가상 접속자가 이 안에서만 돌아다닌다 (분수와 건물에 겹치지 않는 곳) */
export const WALK_BOUNDS = { left: 620, right: 1300, top: 810, bottom: 1000 } as const;
