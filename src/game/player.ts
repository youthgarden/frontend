import { Input, Scene, Scenes } from 'phaser';
import { characterSpec } from '../character';
import { current, on, type PlayerProfile } from '../events';
import { S } from './assets';
import { CharacterView } from './character/CharacterView';
import type { Dir } from './pixel-kit/index.js';

const SPEED = 220; // 초당 이동 거리(px)

/** PhaserGame이 game.registry에 내 캐릭터 정보(PlayerProfile)를 넣어 두는 키. 게임을 만들 때의 값이다 */
export const PROFILE_KEY = 'profile';
/** 내 캐릭터의 지금 레벨. 'player-level'로 바뀌면 PhaserGame이 갱신한다. 장면이 바뀌어도 이 값으로 그린다 */
export const LEVEL_KEY = 'level';

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'F' | 'SPACE', Phaser.Input.Keyboard.Key>;

// 내 캐릭터의 이동과 상호작용 키를 맡는다. 위치(x, y)는 발 위치다.
export class Player {
    // 카메라가 따라가는 그림. 픽셀 키트 캐릭터를 맵과 같은 배율(S)로 그린다.
    readonly body: Phaser.GameObjects.Sprite;
    private view: CharacterView;
    private keys: Keys;
    private locked = false;
    private interact = false; // 이번 프레임에 상호작용 키를 눌렀는가

    // canWalk(x, y): 그 위치로 갈 수 있으면 true. 맵이 벽, 물, 건물을 판단한다.
    constructor(scene: Scene, x: number, y: number, private canWalk: (x: number, y: number) => boolean) {
        const profile = scene.registry.get(PROFILE_KEY) as PlayerProfile;
        const level = (scene.registry.get(LEVEL_KEY) as number | undefined) ?? profile.level;
        this.view = new CharacterView(scene, {
            key: `yg-user-${profile.userId}`,
            spec: characterSpec(profile.userId, level),
            name: profile.nickname,
            level,
            isMe: true,
            x,
            y,
            scale: S,
        });
        this.body = this.view.sprite;
        // 두 번째 인자 false: 키 입력을 가로채지 않는다. 가로채면 채팅창 같은 입력칸에 글자가 안 써진다.
        this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,F,SPACE', false) as Keys;
        // 패널이 열려 있는 동안은 움직이지 않는다. 장면보다 먼저 열린 패널도 있으니 지금 상태부터 확인한다
        this.locked = current('ui-modal')?.[0] ?? false;
        const offs = [
            on('ui-modal', (open) => {
                this.locked = open;
            }),
            // 레벨이 오르면 모자 색과 이름표를 바꾸고 반짝임을 띄운다
            on('player-level', (lv) => {
                this.view.setLevel(lv, characterSpec(profile.userId, lv));
                this.view.showEmote('sparkle', 1800);
            }),
        ];
        // 장면이 끝날 때(shutdown)와 게임이 부서질 때(destroy) 모두 구독을 끊는다
        const off = () => offs.splice(0).forEach((f) => f());
        scene.events.once(Scenes.Events.SHUTDOWN, off);
        scene.events.once(Scenes.Events.DESTROY, off);
    }

    get x() {
        return this.view.x;
    }

    get y() {
        return this.view.y;
    }

    get dir(): Dir {
        return this.view.dir;
    }

    get moving() {
        return this.view.moving;
    }

    moveTo(x: number, y: number) {
        this.view.setPosition(x, y);
    }

    // 매 프레임 호출한다. 방향키와 WASD로 움직인다.
    update(delta: number) {
        const k = this.keys;
        // JustDown은 읽을 때 지워진다. 패널이 열려 있는 동안 누른 키가 패널을 닫은 뒤에 동작하지 않도록 매 프레임 읽는다.
        const pressed = Input.Keyboard.JustDown(k.F) || Input.Keyboard.JustDown(k.SPACE);
        // 패널이 열려 있거나 페이지의 입력칸에 글자를 쓰는 중이면 움직이지 않는다
        if (this.locked || typingInPage()) {
            this.interact = false;
            this.view.setMotion(false);
            return;
        }
        this.interact = pressed;
        const dx = Number(k.RIGHT.isDown || k.D.isDown) - Number(k.LEFT.isDown || k.A.isDown);
        const dy = Number(k.DOWN.isDown || k.S.isDown) - Number(k.UP.isDown || k.W.isDown);
        const step = (SPEED * delta) / 1000;
        // 가로와 세로를 따로 검사해서, 벽에 비스듬히 부딪혀도 벽을 타고 미끄러지듯 움직인다
        const nx = this.x + dx * step;
        const ny = this.y + dy * step;
        const x = this.canWalk(nx, this.y) ? nx : this.x;
        const y = this.canWalk(x, ny) ? ny : this.y;
        const moved = x !== this.x || y !== this.y;
        if (moved) this.moveTo(x, y);
        // 벽에 대고 누르면 걷지는 않고 그쪽을 바라본다
        this.view.setMotion(moved, dirOf(dx, dy, this.view.dir));
    }

    // 이번 프레임에 상호작용 키(F, 스페이스)를 눌렀는가. update 뒤에 부른다.
    pressedInteract() {
        return this.interact;
    }
}

/** 누른 방향키로 바라볼 방향을 정한다. 대각선이면 지금 보는 방향을 되도록 유지한다 */
function dirOf(dx: number, dy: number, prev: Dir): Dir {
    const h: Dir = dx < 0 ? 'left' : 'right';
    const v: Dir = dy < 0 ? 'up' : 'down';
    if (dx === 0 && dy === 0) return prev;
    if (dx === 0) return v;
    if (dy === 0) return h;
    return prev === h || prev === v ? prev : h;
}

/** 페이지의 입력칸에 포커스가 있으면 맵 조작을 하지 않는다 */
function typingInPage() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}
