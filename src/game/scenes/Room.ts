import { Geom, Scene } from 'phaser';
import { EXAMINER_SPEC } from '../../character';
import { emit, on, type GameEvents, type Place } from '../../events';
import { HINT_STYLE, LABEL_STYLE, S, addMapText, ensureAssets, travel } from '../assets';
import { CharacterView } from '../character/CharacterView';
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
const WALL_H = 46; // 뒷벽 높이. 창문, 게시판, 현수막을 걸 수 있는 높이
const WALK = { left: 120, right: 600, top: 88, bottom: 372 }; // 캐릭터 발이 다닐 수 있는 범위
const DOOR: [number, number] = [360, 368]; // 아래쪽 벽 가운데의 출구 앞
const DOOR_REACH = 24;

const DESK_X = [200, 307, 413, 520]; // 가운데(360)는 통로로 비워 둔다

type RoomPlace = Exclude<Place, 'plaza'>;
type Thing = [key: string, x: number, y: number, solid?: boolean]; // (x, y)는 그림의 아래쪽 가운데. solid면 지나갈 수 없다
type Spot = { at: [number, number]; reach: number; hint: string; target: GameEvents['interact'][0] };

const desks = (rows: number[], desk = 'desk'): Thing[] => rows.flatMap((y) => DESK_X.flatMap((x): Thing[] => [[desk, x, y, true], ['chair', x, y + 16]]));
// 의자마다 하나씩 있는 상호작용 지점. 의자 위에 서면 닿는다.
const seats = (rows: number[], hint: string, target: Spot['target']): Spot[] =>
    rows.flatMap((y) => DESK_X.map((x): Spot => ({ at: [x, y + 10], reach: 14, hint, target })));
const FLAT = new Set(['carpet']); // 바닥에 깔리는 그림. 캐릭터가 위로 지나간다.

// wall: 뒷벽 색 [벽면, 걸레받이]
const ROOMS: Record<RoomPlace, { label: string; tile: string; wall: [number, number]; things: Thing[]; spots: Spot[] }> = {
    classroom: {
        label: '강의실',
        tile: 'floor',
        wall: [0xf3e6cc, 0xd8c39c],
        things: [
            // 뒷벽: 칠판 양옆으로 게시판과 창문, 시계
            ['chalkboard', 360, 60], ['noticeboard', 268, 52], ['window', 196, 52], ['window', 468, 52], ['clock', 524, 40],
            ['bookshelf', 132, 64], ['bookshelf', 588, 64], ['plant', 124, 372], ['plant', 596, 372],
            ['lectern', 290, 100, true], // 교탁. 칠판 앞 자리는 비워 둔다
            ...desks([170, 246, 322]),
        ],
        // 칠판 앞이나 아무 자리에서 강의를 본다
        spots: [{ at: [360, 96], reach: 40, hint: '강의 보기', target: 'lectures' }, ...seats([170, 246, 322], '자리에서 강의 보기', 'lectures')],
    },
    exam: {
        label: '시험장',
        tile: 'wood',
        wall: [0x4a3b7a, 0x392c62],
        things: [
            // 뒷벽: 현수막과 시계. 양 끝에 기둥
            ['banner', 240, 54], ['banner', 480, 54], ['clock', 540, 38], ['bookshelf', 170, 64], ['trophy', 206, 64],
            ['pillar', 124, 76, true], ['pillar', 596, 76, true], ['plant', 124, 372], ['plant', 596, 372],
            ['reception', 360, 112, true], // 접수대
            // 접수대 앞에서 출구까지 이어지는 융단
            ...[176, 208, 240, 272, 304, 336, 368].map((y): Thing => ['carpet', 360, y]),
            ...desks([220, 310], 'examdesk'),
        ],
        // 접수대 앞이나 아무 자리에서 시험을 본다
        spots: [{ at: [360, 132], reach: 40, hint: '시험 보기', target: 'exam' }, ...seats([220, 310], '자리에서 시험 보기', 'exam')],
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
        this.add.rectangle(sx(FLOOR.x - 6), sy(FLOOR.y - WALL_H - 6), (FLOOR_W + 12) * S, (FLOOR_H + WALL_H + 18) * S, 0x5a4a3c).setOrigin(0);
        this.add.rectangle(sx(FLOOR.x), sy(FLOOR.y - WALL_H), FLOOR_W * S, WALL_H * S, room.wall[0]).setOrigin(0);
        this.add.rectangle(sx(FLOOR.x), sy(FLOOR.y - 6), FLOOR_W * S, 6 * S, room.wall[1]).setOrigin(0);
        // 바닥
        for (let j = 0; j < FLOOR.rows; j++) {
            for (let i = 0; i < FLOOR.cols; i++) {
                this.add.image(sx(FLOOR.x + i * TILE), sy(FLOOR.y + j * TILE), 'yg-tiles', tileIndex[room.tile]).setOrigin(0).setScale(S);
            }
        }
        // 출구
        this.add.rectangle(sx(DOOR[0] - 20), sy(FLOOR.y + FLOOR_H), 40 * S, 12 * S, 0x8a5a2b).setOrigin(0);
        addMapText(this, sx(DOOR[0]), sy(FLOOR.y + FLOOR_H + 26), '출구', LABEL_STYLE).setOrigin(0.5);

        // 놓인 것들. 아래에 있는 것이 앞에 오도록 y를 depth로 쓴다.
        this.solids = [];
        for (const [key, x, y, solid] of room.things) {
            const img = this.add.image(sx(x), sy(y), `yg-obj-${key}`).setOrigin(0.5, 1).setScale(S).setDepth(FLAT.has(key) ? 1 : sy(y));
            // 막는 범위는 그림의 아래쪽 절반 정도: 위쪽은 캐릭터가 뒤로 지나갈 수 있다
            if (solid) this.solids.push(new Geom.Rectangle(sx(x) - img.displayWidth / 2, sy(y) - 22 * S, img.displayWidth, 22 * S));
        }

        addMapText(this, sx(FLOOR.x), sy(FLOOR.y - WALL_H - 14), room.label, LABEL_STYLE).setOrigin(0, 0.5);

        // 시험장 접수 책상 옆의 AI 시험관. 장식이라 막지 않는다. 책상 바로 뒤에 세우면 말을 걸러 온 캐릭터에 가려진다.
        if (this.place === 'exam') {
            new CharacterView(this, { key: 'yg-npc-examiner', spec: EXAMINER_SPEC, name: 'AI 시험관', level: null, badge: 'AI', x: sx(296), y: sy(104), scale: S });
        }

        // 문에서 조금 떨어져 시작한다. 문 앞에서 시작하면 누르고 있던 키 때문에 곧바로 다시 나가 버린다.
        this.player = new Player(this, sx(DOOR[0]), sy(DOOR[1] - 44), (x, y) => this.canWalk(x, y));
        emit('place', this.place);

        this.hint = addMapText(this, this.scale.width / 2, this.scale.height - 20, '', HINT_STYLE)
            .setOrigin(0.5)
            .setDepth(100001)
            .setVisible(false);

        // 화면에서 '시험장으로 이동' 같은 버튼을 누르면 그 공간으로 간다
        const off = on('goto', (place) => {
            if (place !== this.place) travel(this, place);
        });
        this.events.once('shutdown', off);
        // 게임이 통째로 부서질 때는 shutdown이 오지 않는다. 구독이 남으면 부서진 장면이 goto를 받아 예외가 난다
        this.events.once('destroy', off);
    }

    update(_time: number, delta: number) {
        this.player.update(delta);

        const room = ROOMS[this.place];
        const near = (at: [number, number], reach: number) => Math.hypot(this.player.x - sx(at[0]), this.player.y - sy(at[1])) < reach * S;
        const atDoor = near(DOOR, DOOR_REACH);
        const atSpot = room.spots.find((s) => near(s.at, s.reach));

        this.hint.setVisible(atDoor || !!atSpot);
        if (atDoor) {
            this.hint.setText('F 또는 Space: 광장으로 나가기');
            if (this.player.pressedInteract()) travel(this, 'plaza', this.place);
        } else if (atSpot) {
            this.hint.setText(`F 또는 Space: ${atSpot.hint}`);
            if (this.player.pressedInteract()) emit('interact', atSpot.target);
        }
    }

    // 화면 좌표 (x, y)에 서 있을 수 있는가: 방 안이고, 책상 같은 것과 겹치지 않는다
    private canWalk(x: number, y: number) {
        if (x < sx(WALK.left) || x > sx(WALK.right) || y < sy(WALK.top) || y > sy(WALK.bottom)) return false;
        return !this.solids.some((r) => r.contains(x, y));
    }
}
