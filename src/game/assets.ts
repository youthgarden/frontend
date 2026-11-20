import { Scene } from 'phaser';
import type { Place } from '../events';
import { TILE_KEYS, registerObjects, registerTiles } from './pixel-kit/index.js';

export const S = 2; // 픽셀 키트 그림을 화면에 몇 배로 그리는가

// 픽셀 키트의 타일과 오브젝트 그림을 한 번만 등록하고, 타일 이름 → 타일 번호 표를 돌려준다.
export function ensureAssets(scene: Scene): Record<string, number> {
    if (!scene.textures.exists('yg-tiles')) {
        registerTiles(scene);
        registerObjects(scene);
    }
    return Object.fromEntries(TILE_KEYS.map((k: string, i: number) => [k, i]));
}

// 그 공간으로 장면을 바꾼다. 광장은 World, 강의실과 시험장은 Room.
// from: 광장으로 나올 때 어느 건물 문 앞에 설지.
export function travel(scene: Scene, to: Place, from?: Place) {
    if (to === 'plaza') scene.scene.start('World', { from });
    else scene.scene.start('Room', { place: to });
}

export const HINT_STYLE = { color: '#ffffff', backgroundColor: '#333333', fontSize: '15px', padding: { x: 14, y: 8 } };
export const LABEL_STYLE = { color: '#272231', backgroundColor: '#ffffff', fontSize: '16px', fontStyle: 'bold', padding: { x: 10, y: 5 } };
