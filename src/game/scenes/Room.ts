import { Geom, Scene } from 'phaser';
import { emit, on, type GameEvents, type Place } from '../../events';
import { HINT_STYLE, LABEL_STYLE, S, ensureAssets, travel } from '../assets';
import { Player } from '../player';
import { TILE } from '../pixel-kit/index.js';

// 건물 안. 강의실과 시험장이 같은 방 틀을 쓰고, 놓인 것과 상호작용 지점만 다르다.
// 좌표는 픽셀 키트의 논리 좌표로 적고 화면에는 S배로 그린다. 방은 화면 한 장에 다 들어온다.
const OY = 44; // 방을 화면 세로 가운데에 놓기 위한 여백(px)
const sx = (x: number) => x * S;
const sy = (y: number) => y * S + OY;

const FLOOR = { x: 104, y: 56, cols: 16, rows: 10 }; // 바닥 타일 영역
const FLOOR_W = FLOOR.cols * TILE;
const FLOOR_H = FLOOR.rows * TILE;
const WALK = { left: 120, right: 600, top: 88, bottom: 372 }; // 캐릭터 발이 다닐 수 있는 범위
const DOOR: [number, number] = [360, 368]; // 아래쪽 벽 가운데의 출구 앞
const DOOR_REACH = 24;

const DESK_X = [200, 307, 413, 520]; // 가운데(360)는 통로로 비워 둔다

type RoomPlace = Exclude<Place, 'plaza'>;
type Thing = [key: string, x: number, y: number, solid?: boolean]; // (x, y)는 그림의 아래쪽 가운데. solid면 지나갈 수 없다
type Spot = { at: [number, number]; reach: number; hint: string; target: GameEvents['interact'][0] };

const desks = (rows: number[]): Thing[] => rows.flatMap((y) => DESK_X.flatMap((x): Thing[] => [['desk', x, y, true], ['chair', x, y + 16]]));

const ROOMS: Record<RoomPlace, { label: string; tile: string; things: Thing[]; spot: Spot }> = {
    classroom: {
        label: '강의실',
        tile: 'floor',
        things: [
            ['chalkboard', 360, 62], ['bookshelf', 150, 64], ['bookshelf', 570, 64], ['plant', 124, 372], ['plant', 596, 372],
            ...desks([170, 246, 322]),
        ],
        spot: { at: [360, 96], reach: 40, hint: '강의 보기', target: 'lectures' }, // 칠판 앞
    },
    exam: {
        label: '시험장',
        tile: 'wood',
        things: [
            ['computer', 360, 112, true], // 접수 책상
            ['bookshelf', 150, 64], ['trophy', 190, 64], ['plant', 570, 66], ['plant', 124, 372], ['plant', 596, 372],
            ...desks([220, 310]),
        ],
        spot: { at: [360, 132], reach: 40, hint: '시험 보기', target: 'exam' }, // 접수 책상 앞
    },
};

export class Room extends Scene {
    private place: RoomPlace;
    private player: Player;
    private hint: Phaser.GameObjects.Text;
    private solids: Geom.Rectangle[];

    constructor() {
        super('Room');
    }

    create(data: { place: RoomPlace }) {
        this.place = data.place;
        const room = ROOMS[this.place];
        const tileIndex = ensureAssets(this);
        this.cameras.main.setBackgroundColor('#3a3546');

        // 벽
        this.add.rectangle(sx(FLOOR.x - 6), sy(FLOOR.y - 38), (FLOOR_W + 12) * S, (FLOOR_H + 50) * S, 0x5a4a3c).setOrigin(0);
        this.add.rectangle(sx(FLOOR.x), sy(FLOOR.y - 32), FLOOR_W * S, 32 * S, 0xf3e6cc).setOrigin(0);
        this.add.rectangle(sx(FLOOR.x), sy(FLOOR.y - 6), FLOOR_W * S, 6 * S, 0xd8c39c).setOrigin(0);
        // 바닥
        for (let j = 0; j < FLOOR.rows; j++) {
            for (let i = 0; i < FLOOR.cols; i++) {
                this.add.image(sx(FLOOR.x + i * TILE), sy(FLOOR.y + j * TILE), 'yg-tiles', tileIndex[room.tile]).setOrigin(0).setScale(S);
            }
        }
        // 출구
        this.add.rectangle(sx(DOOR[0] - 20), sy(FLOOR.y + FLOOR_H), 40 * S, 12 * S, 0x8a5a2b).setOrigin(0);
        this.add.text(sx(DOOR[0]), sy(FLOOR.y + FLOOR_H + 26), '출구', LABEL_STYLE).setOrigin(0.5);

        // 놓인 것들. 아래에 있는 것이 앞에 오도록 y를 depth로 쓴다.
        this.solids = [];
        for (const [key, x, y, solid] of room.things) {
            const img = this.add.image(sx(x), sy(y), `yg-obj-${key}`).setOrigin(0.5, 1).setScale(S).setDepth(sy(y));
            // 막는 범위는 그림의 아래쪽 절반 정도: 위쪽은 캐릭터가 뒤로 지나갈 수 있다
            if (solid) this.solids.push(new Geom.Rectangle(sx(x) - img.displayWidth / 2, sy(y) - 22 * S, img.displayWidth, 22 * S));
        }

        this.add.text(sx(FLOOR.x), sy(FLOOR.y - 56), room.label, LABEL_STYLE).setOrigin(0, 0.5);

        // 문에서 조금 떨어져 시작한다. 문 앞에서 시작하면 누르고 있던 키 때문에 곧바로 다시 나가 버린다.
        this.player = new Player(this, sx(DOOR[0]), sy(DOOR[1] - 44), (x, y) => this.canWalk(x, y));

        this.hint = this.add
            .text(this.scale.width / 2, this.scale.height - 20, '', HINT_STYLE)
            .setOrigin(0.5)
            .setDepth(100001)
            .setVisible(false);

        // 화면에서 '시험장으로 이동' 같은 버튼을 누르면 그 공간으로 간다
        const off = on('goto', (place) => {
            if (place !== this.place) travel(this, place);
        });
        this.events.once('shutdown', off);
    }

    update(_time: number, delta: number) {
        this.player.update(delta);

        const room = ROOMS[this.place];
        const near = (at: [number, number], reach: number) => Math.hypot(this.player.x - sx(at[0]), this.player.y - sy(at[1])) < reach * S;
        const atDoor = near(DOOR, DOOR_REACH);
        const atSpot = near(room.spot.at, room.spot.reach);

        this.hint.setVisible(atDoor || atSpot);
        if (atDoor) {
            this.hint.setText('F 또는 Space: 광장으로 나가기');
            if (this.player.pressedInteract()) travel(this, 'plaza', this.place);
        } else if (atSpot) {
            this.hint.setText(`F 또는 Space: ${room.spot.hint}`);
            if (this.player.pressedInteract()) emit('interact', room.spot.target);
        }
    }

    // 화면 좌표 (x, y)에 서 있을 수 있는가: 방 안이고, 책상 같은 것과 겹치지 않는다
    private canWalk(x: number, y: number) {
        if (x < sx(WALK.left) || x > sx(WALK.right) || y < sy(WALK.top) || y > sy(WALK.bottom)) return false;
        return !this.solids.some((r) => r.contains(x, y));
    }
}
