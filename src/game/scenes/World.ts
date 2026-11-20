import { Scene } from 'phaser';
import { emit, on, type GameEvents, type Place } from '../../events';
import { Player } from '../player';
import { TILE, registerObjects, registerTiles } from '../pixel-kit/index.js';

// 광장, 강의실, 시험장이 한 맵에 있다. 좌표는 픽셀 키트의 논리 좌표로 적고 화면에는 S배로 그린다.
const S = 2;
const COLS = 30;
const ROWS = 22;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

// ── 바닥 ── 타일 칸 단위. 나중 줄이 앞 줄을 덮는다.
const FLOOR: [x0: number, y0: number, x1: number, y1: number, tile: string][] = [
    [9, 7, 20, 15, 'plaza'], // 광장
    [0, 9, 8, 10, 'path'],
    [21, 9, 29, 10, 'path'],
    [14, 16, 15, 16, 'path'],
    [0, 11, 7, 13, 'wood'], // 강의실
    [22, 11, 29, 13, 'wood'], // 시험장
    [0, 17, 29, 18, 'water'],
    [14, 17, 15, 18, 'bridge'],
    [7, 19, 22, 21, 'sand'],
];

// ── 놓인 것들 ── [그림, x, y]. (x, y)는 그림의 아래쪽 가운데.
const T = TILE;
const OBJECTS: [key: string, x: number, y: number][] = [
    // 숲
    ['pine', 30, 70], ['tree', 80, 96], ['tree2', 236, 92], ['pine', 300, 74], ['tree', 340, 104], ['tree2', 620, 104],
    ['pine', 660, 76], ['tree', 720, 94], ['pine', 900, 72], ['tree2', 940, 100], ['bush', 270, 200], ['bush', 700, 206],
    // 광장
    ['hall', 480, 7 * T], ['fountain', 480, 13.6 * T], ['plant', 418, 7 * T + 14], ['plant', 542, 7 * T + 14],
    ['lamp', 9.4 * T, 8.6 * T], ['lamp', 20.6 * T, 8.6 * T], ['lamp', 9.4 * T, 15.6 * T], ['lamp', 20.6 * T, 15.6 * T],
    ['bench', 11.6 * T, 13.4 * T], ['bench', 18.4 * T, 13.4 * T],
    ['flowers', 8.2 * T, 8.4 * T], ['flowers', 21.8 * T, 8.4 * T], ['flowers', 12 * T, 16.7 * T], ['flowers', 18 * T, 16.7 * T],
    ['sign', 7.3 * T, 8.6 * T], ['sign', 22.7 * T, 8.6 * T],
    // 강의실
    ['classroom', 4.5 * T, 9 * T], ['chalkboard', 3.4 * T, 11.6 * T],
    ['desk', 1.6 * T, 13.4 * T], ['desk', 3.4 * T, 13.4 * T], ['desk', 5.2 * T, 13.4 * T],
    // 시험장
    ['library', 25.5 * T, 9 * T], ['computer', 26.2 * T, 13.2 * T],
    ['bookshelf', 23 * T, 12.4 * T], ['bookshelf', 24.1 * T, 12.4 * T], ['plant', 27.6 * T, 12.7 * T], ['trophy', 28.6 * T, 12.6 * T],
    // 강가와 아래쪽
    ['bush', 1.2 * T, 16.9 * T], ['bush', 10 * T, 16.9 * T], ['bush', 20 * T, 16.9 * T], ['bush', 28.8 * T, 16.9 * T],
    ['rock', 7.6 * T, 21.6 * T], ['rock', 22.4 * T, 21.4 * T],
    ['tree', 2 * T, 21.8 * T], ['pine', 4.8 * T, 21.6 * T], ['tree2', 25.4 * T, 21.8 * T], ['pine', 28.2 * T, 21.6 * T],
];
const FLAT = new Set(['flowers']); // 바닥에 깔리는 그림. 캐릭터가 위로 지나간다.

// ── 지나갈 수 없는 곳 ── [x, y, 너비, 높이]. 건물 아랫부분과 분수.
// ponytail: 나무, 책상 같은 작은 것은 막지 않는다. 필요해지면 여기에 추가하거나 Tiled 충돌 레이어로 바꾼다.
const WALLS: [x: number, y: number, w: number, h: number][] = [
    [396, 180, 168, 44], // 본관
    [84, 244, 120, 44], // 강의실 건물
    [752, 244, 128, 44], // 시험장 건물
    [456, 410, 48, 26], // 분수
];

// ── 공간 ── 이름표, 입구(goto로 이동하는 위치), 상호작용 지점
const PLACES: Record<Place, { label: string; labelAt: [number, number]; entrance: [number, number] }> = {
    plaza: { label: '광장', labelAt: [480, 7 * T - 100], entrance: [480, 466] }, // 분수 앞. 접속 시작 위치
    classroom: { label: '강의실', labelAt: [4.5 * T, 9 * T - 81], entrance: [150, 392] },
    exam: { label: '시험장', labelAt: [25.5 * T, 9 * T - 85], entrance: [800, 440] },
};
const SPOTS: { at: [number, number]; reach: number; hint: string; target: GameEvents['interact'][0] }[] = [
    { at: [3.4 * T, 11.6 * T + 14], reach: 44, hint: '강의 보기', target: 'lectures' }, // 칠판 앞
    { at: [26.2 * T, 13.2 * T + 14], reach: 44, hint: '시험 보기', target: 'exam' }, // 시험장 접수 책상 앞
];

export class World extends Scene {
    private player: Player;
    private hint: Phaser.GameObjects.Text;
    private ground: string[][];

    constructor() {
        super('World');
    }

    create() {
        const tileIndex: Record<string, number> = registerTiles(this);
        registerObjects(this);

        // 바닥: 잔디를 깔고 그 위에 FLOOR를 덮는다
        this.ground = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => {
            const h = Math.abs((x * 73856093) ^ (y * 19349663));
            return h % 23 === 0 ? 'grass_flower' : h % 3 === 0 ? 'grass2' : 'grass';
        }));
        for (const [x0, y0, x1, y1, tile] of FLOOR) {
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.ground[y][x] = tile;
        }
        this.ground.forEach((row, y) => row.forEach((tile, x) => {
            this.add.image(x * TILE * S, y * TILE * S, 'yg-tiles', tileIndex[tile]).setOrigin(0).setScale(S).setDepth(-2);
        }));

        // 아래에 있는 것이 앞에 오도록 y를 depth로 쓴다
        for (const [key, x, y] of OBJECTS) {
            this.add.image(x * S, y * S, `yg-obj-${key}`).setOrigin(0.5, 1).setScale(S).setDepth(FLAT.has(key) ? -1 : y * S);
        }

        for (const { label, labelAt } of Object.values(PLACES)) {
            this.add
                .text(labelAt[0] * S, labelAt[1] * S, label, { color: '#272231', backgroundColor: '#ffffff', fontSize: '16px', fontStyle: 'bold', padding: { x: 10, y: 5 } })
                .setOrigin(0.5)
                .setDepth(100000);
        }

        const [sx, sy] = PLACES.plaza.entrance;
        this.player = new Player(this, sx * S, sy * S, (x, y) => this.canWalk(x / S, y / S));

        // 화면에 고정된 안내 문구
        this.hint = this.add
            .text(this.scale.width / 2, this.scale.height - 90, '', { color: '#ffffff', backgroundColor: '#333333', fontSize: '15px', padding: { x: 14, y: 8 } })
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(100001)
            .setVisible(false);

        // 맵이 화면보다 커서 카메라가 캐릭터를 따라간다
        this.cameras.main.setBounds(0, 0, WIDTH * S, HEIGHT * S).startFollow(this.player.body, true, 0.15, 0.15);

        const off = on('goto', (place) => {
            const [x, y] = PLACES[place].entrance;
            this.player.moveTo(x * S, y * S);
        });
        this.events.once('shutdown', off);
    }

    update(_time: number, delta: number) {
        this.player.update(delta);

        const px = this.player.x / S;
        const py = this.player.y / S;
        const spot = SPOTS.find((s) => Math.hypot(px - s.at[0], py - s.at[1]) < s.reach);
        this.hint.setVisible(!!spot);
        if (!spot) return;
        this.hint.setText(`F 또는 Space: ${spot.hint}`);
        if (this.player.pressedInteract()) emit('interact', spot.target);
    }

    // 논리 좌표 (x, y)에 서 있을 수 있는가: 맵 안이고, 물이 아니고, 건물이나 분수가 아니다
    private canWalk(x: number, y: number) {
        if (x < 8 || x > WIDTH - 8 || y < 16 || y > HEIGHT - 4) return false;
        if (this.ground[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] === 'water') return false;
        return !WALLS.some(([wx, wy, w, h]) => x >= wx && x <= wx + w && y >= wy && y <= wy + h);
    }
}
