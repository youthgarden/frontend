import { Scenes, type GameObjects, type Scene } from 'phaser';
import { levelInfo } from '../../character';
import type { CharacterSpec, Dir, EmoteKey } from '../pixel-kit/index.js';
import { addPixelText } from '../ui/pixelText';
import {
    CHARACTER_HEIGHT,
    characterFootOriginY,
    ensureEmotes,
    registerCharacterSprite,
    unregisterCharacterSprite,
    updateCharacterSprite,
} from './kit';

// 맵 위 캐릭터 한 명의 표시: 키트로 그린 스프라이트 + 머리 위 이름표 + 감정 아이콘.
// 맵(씬)과 분리되어 있어서 광장(World)과 건물 안(Room)이 함께 쓴다.
// 좌표(x, y)는 언제나 캐릭터의 발 위치다. 서버와 주고받는 좌표도 발 위치다.
// 장면이 끝나면(shutdown) 스스로 정리한다. 텍스처와 애니메이션은 게임 전체가 함께 쓰므로 남겨 두면 쌓인다.

/**
 * 이름표의 앞뒤 순서. 캐릭터와 건물(앞뒤 순서 = 발의 y, 맵 높이 이하)보다 항상 위에 그리고,
 * 맵의 구역 이름표와 상호작용 안내(100000~)보다는 아래에 그린다. 감정 아이콘은 이 값의 2배.
 */
export const OVERLAY_DEPTH = 10000;

export interface CharacterViewOptions {
    /** 텍스처와 애니메이션 키. 캐릭터마다 달라야 한다. 예: `yg-user-7` */
    key: string;
    spec: CharacterSpec;
    name: string;
    /** 이름표에 레벨을 표시한다. null이면 레벨 대신 badge를 쓴다(AI 시험관) */
    level: number | null;
    badge?: string;
    /** 내 캐릭터. 이름표를 다른 사람과 다르게 칠한다 */
    isMe?: boolean;
    x: number;
    y: number;
    dir?: Dir;
    /** 그림과 이름표를 몇 배로 그리는가. 맵이 키트 그림을 키워 그리면 같은 배율을 준다 */
    scale?: number;
}

export class CharacterView {
    readonly key: string;
    readonly sprite: GameObjects.Sprite;
    private readonly plate: NamePlate;
    private readonly scene: Scene;
    private readonly scale: number;
    private emote: GameObjects.Image | null = null;
    private _dir: Dir;
    private _moving = false;
    private destroyed = false;

    constructor(scene: Scene, opts: CharacterViewOptions) {
        this.scene = scene;
        this.key = opts.key;
        this.scale = opts.scale ?? 1;
        this._dir = opts.dir ?? 'down';
        registerCharacterSprite(scene, opts.key, opts.spec);
        this.sprite = scene.add
            .sprite(opts.x, opts.y, opts.key, 0)
            .setOrigin(0.5, characterFootOriginY())
            .setScale(this.scale);
        this.plate = new NamePlate(scene, opts, this.scale);
        this.setPosition(opts.x, opts.y);
        this.playCurrent();
        scene.events.once(Scenes.Events.SHUTDOWN, this.destroy, this);
    }

    get x() {
        return this.sprite.x;
    }
    get y() {
        return this.sprite.y;
    }
    get dir() {
        return this._dir;
    }
    get moving() {
        return this._moving;
    }

    setPosition(x: number, y: number) {
        this.sprite.setPosition(x, y);
        // 앞뒤 순서: 발이 아래(y가 큼)에 있을수록 앞에 그린다
        this.sprite.setDepth(y);
        this.plate.setPosition(x, y);
        if (this.emote) this.emote.x = x;
        return this;
    }

    /** 걷는 중인지와 바라보는 방향에 맞춰 걷기 또는 숨쉬기 동작을 재생한다 */
    setMotion(moving: boolean, dir: Dir = this._dir) {
        if (moving === this._moving && dir === this._dir) return this;
        this._moving = moving;
        this._dir = dir;
        this.playCurrent();
        return this;
    }

    /** 레벨이 바뀌었다. 모자 색(spec.level)과 이름표의 레벨을 갱신한다 */
    setLevel(level: number, spec: CharacterSpec) {
        updateCharacterSprite(this.sprite, spec);
        this.playCurrent();
        this.plate.setLevel(level);
        return this;
    }

    /** 머리 위(이름표 위)에 감정 아이콘을 잠시 띄운다 */
    showEmote(key: EmoteKey, durationMs = 1600) {
        ensureEmotes(this.scene);
        this.emote?.destroy();
        const s = this.scale;
        const top = this.y - this.plate.offsetY - (NamePlate.HEIGHT + 4) * s;
        const img = this.scene.add
            .image(this.x, top, `yg-emote-${key}`)
            .setOrigin(0.5, 1)
            .setScale(2 * s)
            .setDepth(OVERLAY_DEPTH * 2);
        this.emote = img;
        this.scene.tweens.add({ targets: img, y: top - 10 * s, duration: 300, ease: 'Back.easeOut' });
        this.scene.tweens.add({
            targets: img,
            alpha: 0,
            delay: durationMs,
            duration: 300,
            onComplete: () => {
                img.destroy();
                if (this.emote === img) this.emote = null;
            },
        });
        return this;
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.scene.events.off(Scenes.Events.SHUTDOWN, this.destroy, this);
        this.emote?.destroy();
        this.emote = null;
        this.plate.destroy();
        // 스프라이트를 먼저 지운다. 재생 중인 애니메이션을 지우면 Phaser 4.0.0에서 렌더링이 멈춘다 (kit.ts 참고)
        this.sprite.destroy();
        unregisterCharacterSprite(this.scene, this.key);
    }

    private playCurrent() {
        this.sprite.play(`${this.key}:${this._moving ? 'walk' : 'idle'}_${this._dir}`, true);
    }
}

// ── 이름표 ──

const PLATE_COLORS = {
    me: { fill: 0xffeea3, line: 0xc97f0a },
    other: { fill: 0xfffaf0, line: 0xb8a07a },
    npc: { fill: 0xdbe8fa, line: 0x2f66b8 },
};

// 이름표 = 바탕 + 레벨 칩 + 닉네임. 컨테이너 하나로 묶어 캐릭터를 따라 옮기기만 한다.
// 글자를 바꿀 때만 다시 그린다(매 프레임 다시 그리면 Text 캔버스를 매번 새로 만든다).
// 배율은 컨테이너에 준다. 12px 픽셀 글꼴을 그대로 키워야 글자가 또렷하다.
class NamePlate {
    static readonly HEIGHT = 20;

    /** 발에서 이름표 아래 끝까지의 거리(배율 반영) */
    readonly offsetY: number;
    private readonly root: GameObjects.Container;
    private readonly box: GameObjects.Graphics;
    private readonly chipText: GameObjects.Text;
    private readonly nameText: GameObjects.Text;
    private readonly colors: (typeof PLATE_COLORS)['me'];
    private readonly badge: string;
    private level: number | null;

    constructor(scene: Scene, opts: CharacterViewOptions, scale: number) {
        this.level = opts.level;
        this.badge = opts.badge ?? '';
        this.offsetY = (CHARACTER_HEIGHT + 4) * scale;
        this.colors = opts.isMe ? PLATE_COLORS.me : opts.level === null ? PLATE_COLORS.npc : PLATE_COLORS.other;
        const relayout = () => this.layout();
        this.box = scene.add.graphics();
        this.chipText = addPixelText(scene, 0, 0, '', { fontStyle: 'bold' }, relayout);
        this.nameText = addPixelText(scene, 0, 0, opts.name, { fontStyle: opts.isMe ? 'bold' : 'normal' }, relayout);
        // 이름표는 그림만큼 키우지 않는다. 2배로 그리는 맵에서 그대로 키우면 이름표가 옆 사람의 얼굴을 가린다
        this.root = scene.add.container(0, 0, [this.box, this.chipText, this.nameText]).setScale(Math.min(scale, 1.5));
        this.setLevel(opts.level);
    }

    setLevel(level: number | null) {
        this.level = level;
        this.chipText.setText(level === null ? this.badge : levelInfo(level).label);
        this.chipText.setColor(level === null ? '#ffffff' : '#2e1c14');
        this.layout();
    }

    setPosition(x: number, y: number) {
        // 정수 좌표에 두어야 픽셀 글꼴이 번지지 않는다
        this.root.setPosition(Math.round(x), Math.round(y - this.offsetY));
        this.root.setDepth(OVERLAY_DEPTH + y);
    }

    destroy() {
        this.root.destroy();
    }

    // 컨테이너 안 좌표: (0, 0)이 이름표 아래 가운데다.
    private layout() {
        const H = NamePlate.HEIGHT;
        const PAD = 5;
        const GAP = 4;
        const chipW = Math.ceil(this.chipText.width) + 8;
        const nameW = Math.ceil(this.nameText.width);
        const w = PAD + chipW + GAP + nameW + PAD;
        const left = -Math.round(w / 2);
        const top = -H;
        const chipColor =
            this.level === null ? this.colors.line : Number.parseInt(levelInfo(this.level).color.slice(1), 16);

        this.box.clear();
        this.box.fillStyle(this.colors.line, 1).fillRoundedRect(left - 1, top - 1, w + 2, H + 2, 5);
        this.box.fillStyle(this.colors.fill, 1).fillRoundedRect(left, top, w, H, 4);
        this.box.fillStyle(chipColor, 1).fillRoundedRect(left + PAD, top + 3, chipW, H - 6, 3);

        this.chipText.setPosition(left + PAD + 4, top + Math.round((H - this.chipText.height) / 2));
        this.nameText.setPosition(left + PAD + chipW + GAP, top + Math.round((H - this.nameText.height) / 2));
    }
}
