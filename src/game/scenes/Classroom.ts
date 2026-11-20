import { Input, Scene } from 'phaser';
import { emit, on } from '../../events';

const SPEED = 240; // 초당 이동 거리(px)
const ROOM = { left: 240, right: 1200, top: 200, bottom: 720 }; // 캐릭터가 다닐 수 있는 범위
const BOARD = { x: 720, y: 140, width: 500, height: 56 };
const REACH = 110; // 칠판에서 이 거리(px) 안에 있으면 F 키와 스페이스가 동작한다

type Keys = Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'F' | 'SPACE', Phaser.Input.Keyboard.Key>;

// 회색 박스로만 그린 교실. 그림(타일 맵)은 동작이 확인된 뒤에 입힌다.
export class Classroom extends Scene {
    private player: Phaser.GameObjects.Arc;
    private hint: Phaser.GameObjects.Text;
    private keys: Keys;
    private locked = false;

    constructor() {
        super('Classroom');
    }

    create() {
        this.add.rectangle(720, 460, 1000, 620, 0xf5f5f5).setStrokeStyle(1, 0xa0a0a0);
        this.add.rectangle(BOARD.x, BOARD.y, BOARD.width, BOARD.height, 0x6e6e6e);
        this.add.text(BOARD.x, BOARD.y, '칠판', { color: '#ffffff', fontSize: '16px' }).setOrigin(0.5);
        this.hint = this.add
            .text(BOARD.x, BOARD.y - 52, 'F 또는 Space: 강의 보기', { color: '#ffffff', backgroundColor: '#333333', fontSize: '14px', padding: { x: 12, y: 6 } })
            .setOrigin(0.5)
            .setVisible(false);
        this.player = this.add.circle(720, 500, 20, 0x3c3c3c);

        // 두 번째 인자 false: 키 입력을 가로채지 않는다. 가로채면 채팅창 같은 입력칸에 글자가 안 써진다.
        this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,F,SPACE', false) as Keys;

        const off = on('ui-modal', (open) => {
            this.locked = open;
        });
        this.events.once('shutdown', off);
    }

    update(_time: number, delta: number) {
        if (this.locked) return;

        const k = this.keys;
        const dx = Number(k.RIGHT.isDown || k.D.isDown) - Number(k.LEFT.isDown || k.A.isDown);
        const dy = Number(k.DOWN.isDown || k.S.isDown) - Number(k.UP.isDown || k.W.isDown);
        const step = (SPEED * delta) / 1000;
        // ponytail: 벽·책상 충돌 없이 범위만 제한한다. Tiled 맵을 넣을 때 arcade physics로 바꾼다.
        this.player.x = Math.min(ROOM.right, Math.max(ROOM.left, this.player.x + dx * step));
        this.player.y = Math.min(ROOM.bottom, Math.max(ROOM.top, this.player.y + dy * step));

        const nearBoard = Math.abs(this.player.x - BOARD.x) < BOARD.width / 2 && this.player.y - BOARD.y < REACH;
        this.hint.setVisible(nearBoard);
        if (nearBoard && (Input.Keyboard.JustDown(k.F) || Input.Keyboard.JustDown(k.SPACE))) emit('interact', 'blackboard');
    }
}
