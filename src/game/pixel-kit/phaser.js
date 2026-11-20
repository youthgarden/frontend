// Phaser 3 연결부. Phaser를 import하지 않고 scene 객체만 받으므로 의존성이 없다.
//
//   import { registerAll, registerCharacter } from './pixel-kit/src/phaser.js';
//   preload/create 안에서: registerAll(this);
//   const kid = this.add.sprite(100, 100, 'kid01').play('kid01:walk_down');

import { buildCharacterSheet, ANIMS, FRAME_W, FRAME_H } from './character.js';
import { CHARACTERS } from './presets.js';
import { buildTileset, TILE, TILES } from './tiles.js';
import { OBJECTS } from './objects.js';
import { drawEmote, EMOTE_KEYS } from './emotes.js';

function addCanvasSheet(scene, key, canvas, fw, fh) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas);
  const cols = Math.floor(canvas.width / fw);
  const rows = Math.floor(canvas.height / fh);
  for (let i = 0; i < cols * rows; i++) tex.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
  return tex;
}

// 캐릭터 하나를 텍스처와 애니메이션으로 등록한다.
// 애니메이션 키: `${key}:walk_down`, `${key}:idle_left` ... (walk/idle x down/left/right/up)
export function registerCharacter(scene, key, spec) {
  addCanvasSheet(scene, key, buildCharacterSheet(spec), FRAME_W, FRAME_H);
  for (const [name, a] of Object.entries(ANIMS)) {
    const animKey = `${key}:${name}`;
    if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
    scene.anims.create({
      key: animKey,
      frames: a.frames.map((frame) => ({ key, frame })),
      frameRate: a.frameRate,
      repeat: a.repeat,
    });
  }
  return key;
}

// 레벨업이나 표정 변경처럼 외형이 바뀌었을 때 호출한다. 재생 중이던 동작을 이어서 재생한다.
export function updateCharacter(sprite, spec) {
  const scene = sprite.scene;
  const key = sprite.texture.key;
  const current = sprite.anims.currentAnim?.key;
  registerCharacter(scene, key, spec);
  sprite.setTexture(key, 0);
  if (current) sprite.play(current);
}

export function registerTiles(scene, key = 'yg-tiles') {
  const { canvas, index } = buildTileset();
  addCanvasSheet(scene, key, canvas, TILE, TILE);
  return index; // 타일 이름 -> 타일 번호
}

export function registerObjects(scene, prefix = 'yg-obj-') {
  for (const [k, o] of Object.entries(OBJECTS)) {
    const key = prefix + k;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, o.draw().toCanvas());
  }
}

export function registerEmotes(scene, prefix = 'yg-emote-') {
  for (const k of EMOTE_KEYS) {
    const key = prefix + k;
    if (scene.textures.exists(key)) scene.textures.remove(key);
    scene.textures.addCanvas(key, drawEmote(k).toCanvas());
  }
}

// 기본 캐릭터 20명, 타일셋, 오브젝트, 감정 아이콘을 한 번에 등록한다.
export function registerAll(scene) {
  CHARACTERS.forEach((c) => registerCharacter(scene, c.id, c));
  const tileIndex = registerTiles(scene);
  registerObjects(scene);
  registerEmotes(scene);
  return { characters: CHARACTERS.map((c) => c.id), tileIndex, tiles: Object.keys(TILES), objects: Object.keys(OBJECTS) };
}
