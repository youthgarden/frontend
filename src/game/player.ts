import { Input, Scene } from 'phaser';
import { on } from '../events';

const SPEED = 220; // 초당 이동 거리(px)

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'F' | 'SPACE', Phaser.Input.Keyboard.Key>;

// 내 캐릭터의 이동과 상호작용 키를 맡는다. 위치(x, y)는 발 위치다.
export class Player {
    // 캐릭터 그림 담당자가 교체할 자리. 지금은 동그라미로 대신한다.
    readonly body: Phaser.GameObjects.Arc;
    private keys: Keys;
    private locked = false;

    // canWalk(x, y): 그 위치로 갈 수 있으면 true. 맵이 벽, 물, 건물을 판단한다.
    constructor(scene: Scene, x: number, y: number, private canWalk: (x: number, y: number) => boolean) {
        this.body = scene.add.circle(x, y, 14, 0x3c3c3c).setStrokeStyle(2, 0xffffff).setDepth(y);
        // 두 번째 인자 false: 키 입력을 가로채지 않는다. 가로채면 채팅창 같은 입력칸에 글자가 안 써진다.
        this.keys = scene.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,F,SPACE', false) as Keys;
        // 패널이 열려 있는 동안은 움직이지 않는다
        const off = on('ui-modal', (open) => {
            this.locked = open;
        });
        scene.events.once('shutdown', off);
    }

    get x() {
        return this.body.x;
    }

    get y() {
        return this.body.y;
    }

    moveTo(x: number, y: number) {
        this.body.setPosition(x, y).setDepth(y);
    }

    // 매 프레임 호출한다. 방향키와 WASD로 움직인다.
    update(delta: number) {
        if (this.locked) return;
        const k = this.keys;
        const dx = Number(k.RIGHT.isDown || k.D.isDown) - Number(k.LEFT.isDown || k.A.isDown);
        const dy = Number(k.DOWN.isDown || k.S.isDown) - Number(k.UP.isDown || k.W.isDown);
        const step = (SPEED * delta) / 1000;
        // 가로와 세로를 따로 검사해서, 벽에 비스듬히 부딪혀도 벽을 타고 미끄러지듯 움직인다
        const nx = this.x + dx * step;
        const ny = this.y + dy * step;
        const x = this.canWalk(nx, this.y) ? nx : this.x;
        const y = this.canWalk(x, ny) ? ny : this.y;
        this.moveTo(x, y);
    }

    // 이번 프레임에 상호작용 키(F, 스페이스)를 눌렀는가
    pressedInteract() {
        if (this.locked) return false;
        return Input.Keyboard.JustDown(this.keys.F) || Input.Keyboard.JustDown(this.keys.SPACE);
    }
}
