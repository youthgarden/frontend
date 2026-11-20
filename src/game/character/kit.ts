import { Textures, type GameObjects, type Scene } from 'phaser';
import {
    ANIMS,
    buildCharacterSheet,
    CHARACTERS,
    FRAME_H,
    FRAME_W,
    EMOTE_KEYS,
    registerCharacter,
    registerEmotes,
    updateCharacter,
    type CharacterSpec,
} from '../pixel-kit/index.js';

// 픽셀 키트의 Phaser 연결부(pixel-kit/phaser.js)를 맵에서 쓰는 한 곳.
// 키트 연결부는 Phaser 3 기준으로 쓰였다. Phaser 4.0.0에서 처음 등록(registerCharacter, registerTiles,
// registerObjects, registerEmotes)은 그대로 동작하지만, 외형 갱신(updateCharacter)은 동작하지 않아 여기서 대신한다.
// 키트 원본은 디자인 담당이 새 버전을 주면 덮어쓰므로 고치지 않는다. 바꿔야 할 일이 생기면 여기서 바꾼다.

/** 캐릭터 그림의 높이(px). 발에서 모자 꼭대기까지. 이름표를 그 위에 띄운다 */
export const CHARACTER_HEIGHT = 62;

export function registerCharacterSprite(scene: Scene, key: string, spec: CharacterSpec) {
    registerCharacter(scene, key, spec);
}

/**
 * 레벨업 등으로 외형이 바뀌었다. 같은 텍스처에 새 그림을 덮어 그린다.
 *
 * Phaser 4 호환 문제 때문에 키트의 updateCharacter를 쓰지 않는다.
 * 키트는 쓰는 중인 텍스처를 먼저 지우고(textures.remove) 애니메이션을 지운다(anims.remove).
 * Phaser 4.0.0에서는 애니메이션을 지울 때 그 애니메이션을 재생 중이던 스프라이트가 현재 프레임을 다시 읽는데,
 * 그 프레임의 텍스처가 이미 지워져 있어 예외가 나고, 그 뒤로 렌더링이 멈춘다 (임시 맵에서 재현함).
 * 시트 배치(프레임 위치, 애니메이션)는 외형과 상관없이 같으므로 캔버스 내용만 바꾸면 된다.
 */
export function updateCharacterSprite(sprite: GameObjects.Sprite, spec: CharacterSpec) {
    const tex = sprite.texture;
    if (!(tex instanceof Textures.CanvasTexture)) {
        // 키트가 만든 텍스처가 아니면(있을 수 없지만) 키트 방식으로 되돌아간다
        updateCharacter(sprite, spec);
        return;
    }
    const sheet = buildCharacterSheet(spec);
    tex.clear(0, 0, tex.width, tex.height, false);
    tex.draw(0, 0, sheet, false);
    // GPU에 올라간 텍스처를 새 캔버스 내용으로 바꾼다
    tex.refresh();
}

/** 감정 아이콘 그림(`yg-emote-*`)을 게임에 한 번만 등록한다. 텍스처는 게임 전체가 함께 쓴다 */
export function ensureEmotes(scene: Scene) {
    if (!scene.textures.exists(`yg-emote-${EMOTE_KEYS[0]}`)) registerEmotes(scene);
}

/** 캐릭터가 맵에서 사라질 때 텍스처와 애니메이션을 지운다. 들고 나는 접속자가 쌓이지 않게 한다 */
export function unregisterCharacterSprite(scene: Scene, key: string) {
    for (const name of Object.keys(ANIMS)) {
        const animKey = `${key}:${name}`;
        if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    }
    if (scene.textures.exists(key)) scene.textures.remove(key);
}

let footOrigin: number | null = null;

/**
 * 스프라이트의 origin y. 이 값으로 두면 스프라이트 좌표가 곧 발바닥 위치가 된다.
 * 키트 프레임(48x64)에서 발은 맨 아래 줄이 아니다. 그림이 바뀌어도 맞도록 실제 그림에서 잰다.
 */
export function characterFootOriginY(): number {
    if (footOrigin !== null) return footOrigin;
    const sheet = buildCharacterSheet(CHARACTERS[0]);
    const ctx = sheet.getContext('2d');
    let bottom = FRAME_H - 1;
    if (ctx) {
        // 첫 프레임(아래를 보고 선 모습)에서 불투명한 가장 아래 줄을 찾는다
        const { data } = ctx.getImageData(0, 0, FRAME_W, FRAME_H);
        search: for (let y = FRAME_H - 1; y >= 0; y--) {
            for (let x = 0; x < FRAME_W; x++) {
                if (data[(y * FRAME_W + x) * 4 + 3] > 0) {
                    bottom = y;
                    break search;
                }
            }
        }
    }
    // 발바닥은 그 줄의 아래 끝이다
    footOrigin = (bottom + 1) / FRAME_H;
    return footOrigin;
}
