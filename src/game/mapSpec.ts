// 광장(World 장면)의 크기와 기준 좌표. 맵(Phaser)과 모의 서버(mock/)가 함께 쓴다.
// 이 파일은 DOM이나 Phaser를 import하지 않는다. 모의 서버가 Node에서 읽기 때문이다.
// 좌표는 화면에 그려지는 맵 픽셀 기준이다 (API 명세서 8절). World.ts의 논리 좌표에 S(2)를 곱한 값이다.
// World.ts의 맵이 바뀌면 이 값도 함께 바꾼다.

/** 30칸 x 22칸, 한 칸 32px, 2배로 그린다 */
export const MAP_WIDTH = 1920;
export const MAP_HEIGHT = 1408;

/** 접속할 때마다 서는 자리: 광장 분수 앞. World.ts의 SPAWN과 같은 자리다 */
export const SPAWN = { x: 960, y: 932 } as const;

/** 광장 돌바닥 중 분수 위쪽의 범위. 모의 서버의 가상 접속자가 이 안에서만 돌아다닌다 (분수와 건물에 겹치지 않는 곳) */
export const WALK_BOUNDS = { left: 620, right: 1300, top: 520, bottom: 790 } as const;

/** 캐릭터가 바라보는 네 방향 (pixel-kit의 Dir과 같다) */
export type Dir = 'down' | 'left' | 'right' | 'up';

// 명세 8절의 yaw: 2D 이동 방향의 라디안, [-π, π). 오른쪽 0, 아래 π/2, 위 -π/2. 왼쪽은 π가 범위 밖이라 -π다.
const YAW: Record<Dir, number> = { right: 0, down: Math.PI / 2, up: -Math.PI / 2, left: -Math.PI };

export const dirToYaw = (dir: Dir) => YAW[dir];

/** 받은 방향각에 가장 가까운 네 방향 */
export function yawToDir(yaw: number): Dir {
    const x = Math.cos(yaw);
    const y = Math.sin(yaw);
    if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'right' : 'left';
    return y > 0 ? 'down' : 'up';
}
