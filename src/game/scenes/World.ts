import { Scene } from 'phaser';
import { emit, on, type Place } from '../../events';
import { HINT_STYLE, LABEL_STYLE, S, addMapText, ensureAssets, travel } from '../assets';
import { MAP_HEIGHT, MAP_WIDTH, SPAWN as SPAWN_PX } from '../mapSpec';
import { RemotePlayers } from '../net/RemotePlayers';
import { Player } from '../player';
import { TILE } from '../pixel-kit/index.js';

// 광장. 강의실과 시험장은 닫힌 건물로만 보이고, 문 앞에서 들어가면 Room 장면으로 바뀐다.
// 좌표는 픽셀 키트의 논리 좌표로 적고 화면에는 S배로 그린다. 맵 크기와 시작 위치는 mapSpec.ts(화면 픽셀)가 기준이다.
const WIDTH = MAP_WIDTH / S;
const HEIGHT = MAP_HEIGHT / S;
const COLS = WIDTH / TILE;
const ROWS = HEIGHT / TILE;
const T = TILE;

// ── 바닥 ── 타일 칸 단위. 나중 줄이 앞 줄을 덮는다.
const FLOOR: [x0: number, y0: number, x1: number, y1: number, tile: string][] = [
    [9, 7, 20, 15, 'plaza'], // 광장
    [0, 9, 8, 10, 'path'],
    [21, 9, 29, 10, 'path'],
    [14, 16, 15, 16, 'path'],
    [0, 17, 29, 18, 'water'],
    [14, 17, 15, 18, 'bridge'],
    [7, 19, 22, 21, 'sand'],
];

// ── 놓인 것들 ── [그림, x, y]. (x, y)는 그림의 아래쪽 가운데.
const OBJECTS: [key: string, x: number, y: number][] = [
    // 숲
    ['pine', 30, 70], ['tree', 80, 96], ['tree2', 236, 92], ['pine', 300, 74], ['tree', 340, 104], ['tree2', 620, 104],
    ['pine', 660, 76], ['tree', 720, 94], ['pine', 900, 72], ['tree2', 940, 100], ['bush', 270, 200], ['bush', 700, 206],
    // 광장
    ['mainhall', 480, 7 * T], ['fountain', 480, 390], ['plant', 418, 7 * T + 14], ['plant', 542, 7 * T + 14],
    ['lamp', 9.4 * T, 8.6 * T], ['lamp', 20.6 * T, 8.6 * T], ['lamp', 9.4 * T, 15.6 * T], ['lamp', 20.6 * T, 15.6 * T],
    ['bench', 11.6 * T, 12 * T], ['bench', 18.4 * T, 12 * T],
    ['flowers', 8.6 * T, 8.4 * T], ['flowers', 21.4 * T, 8.4 * T], ['flowers', 12 * T, 16.7 * T], ['flowers', 18 * T, 16.7 * T],
    ['sign', 7.8 * T, 8.6 * T], ['sign', 22.2 * T, 8.6 * T],
    // 건물
    ['school', 4.5 * T, 9 * T], // 강의실
    ['examhall', 25.5 * T, 9 * T], // 시험장
    // 강가와 아래쪽
    ['bush', 1.2 * T, 16.9 * T], ['bush', 10 * T, 16.9 * T], ['bush', 20 * T, 16.9 * T], ['bush', 28.8 * T, 16.9 * T],
    ['rock', 7.6 * T, 21.6 * T], ['rock', 22.4 * T, 21.4 * T],
    ['tree', 2 * T, 21.8 * T], ['pine', 4.8 * T, 21.6 * T], ['tree2', 25.4 * T, 21.8 * T], ['pine', 28.2 * T, 21.6 * T],
];
const FLAT = new Set(['flowers']); // 바닥에 깔리는 그림. 캐릭터가 위로 지나간다.

// ── 지나갈 수 없는 곳 ── [x, y, 너비, 높이]. 건물 아랫부분과 분수. 건물 그림의 맨 아래까지 막아야 캐릭터가 건물 뒤로 가려지지 않는다.
// ponytail: 나무, 벤치 같은 작은 것은 막지 않는다. 필요해지면 여기에 추가하거나 Tiled 충돌 레이어로 바꾼다.
const WALLS: [x: number, y: number, w: number, h: number][] = [
    [384, 176, 192, 48], // 본관
    [51, 240, 186, 48], // 강의실 건물
    [733, 240, 166, 48], // 시험장 건물
    [456, 365, 48, 26], // 분수
];

const SPAWN: [number, number] = [SPAWN_PX.x / S, SPAWN_PX.y / S]; // 분수 앞. 접속 시작 위치

// ── 건물 ── 이름표 위치와 문 앞 위치. 문 앞에서 F나 스페이스를 누르면 들어간다.
// key는 OBJECTS에 놓인 건물 그림. 문 근처에 가면 `${key}_open`(건물 안이 보이는 그림)으로 바뀐다.
// openDrop: 열린 그림은 지붕이 없어 윗부분이 비어 있다. 그 높이(objects.js의 wallTop)만큼 이름표를 내려 벽 바로 위에 둔다.
const BUILDINGS: { place: Place; key: string; label: string; labelAt: [number, number]; openDrop: number; door: [number, number] }[] = [
    { place: 'classroom', key: 'school', label: '강의실', labelAt: [4.5 * T, 9 * T - 154], openDrop: 38, door: [4.5 * T, 9 * T + 12] },
    { place: 'exam', key: 'examhall', label: '시험장', labelAt: [25.5 * T, 9 * T - 134], openDrop: 24, door: [25.5 * T, 9 * T + 12] },
];
const DOOR_REACH = 26;
const OPEN_REACH = 90; // 문에서 이 거리 안에 들어오면 건물 안이 보인다

export class World extends Scene {
    private player: Player;
    private others: RemotePlayers;
    private hint: Phaser.GameObjects.Text;
    private ground: string[][];
    private buildingImages: Map<string, Phaser.GameObjects.Image>;
    private buildingLabels: Map<string, Phaser.GameObjects.Text>;

    constructor() {
        super('World');
    }

    // from: 방금 나온 건물. 그 문 앞에서 시작한다.
    create(data: { from?: Place }) {
        const tileIndex = ensureAssets(this);

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
        this.buildingImages = new Map();
        for (const [key, x, y] of OBJECTS) {
            const img = this.add.image(x * S, y * S, `yg-obj-${key}`).setOrigin(0.5, 1).setScale(S).setDepth(FLAT.has(key) ? -1 : y * S);
            if (BUILDINGS.some((b) => b.key === key)) this.buildingImages.set(key, img);
        }

        addMapText(this, 480 * S, (7 * T - 152) * S, '광장', LABEL_STYLE).setOrigin(0.5).setDepth(100000);
        this.buildingLabels = new Map();
        for (const { key, label, labelAt } of BUILDINGS) {
            this.buildingLabels.set(key, addMapText(this, labelAt[0] * S, labelAt[1] * S, label, LABEL_STYLE).setOrigin(0.5).setDepth(100000));
        }

        // 건물에서 나오면 문에서 조금 떨어져 시작한다. 문 앞에서 시작하면 누르고 있던 키 때문에 곧바로 다시 들어가 버린다.
        const out = BUILDINGS.find((b) => b.place === data.from)?.door;
        const [sx, sy] = out ? [out[0], out[1] + 36] : SPAWN;
        this.player = new Player(this, sx * S, sy * S, (x, y) => this.canWalk(x / S, y / S));
        // 다른 접속자. 연결은 게임 단위로 유지되고, 이 장면은 그리기와 내 위치 알리기만 한다
        this.others = new RemotePlayers(this, this.player, S);
        emit('place', 'plaza');

        // 화면에 고정된 안내 문구
        this.hint = addMapText(this, this.scale.width / 2, this.scale.height - 90, '', HINT_STYLE)
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(100001)
            .setVisible(false);

        // 맵이 화면보다 커서 카메라가 캐릭터를 따라간다
        this.cameras.main.setBounds(0, 0, WIDTH * S, HEIGHT * S).startFollow(this.player.body, true, 0.15, 0.15);

        // 화면에서 '시험장으로 이동' 같은 버튼을 누르면 그 공간으로 간다
        const off = on('goto', (place) => {
            if (place === 'plaza') this.player.moveTo(SPAWN[0] * S, SPAWN[1] * S);
            else travel(this, place);
        });
        this.events.once('shutdown', off);
        // 게임이 통째로 부서질 때는 shutdown이 오지 않는다. 구독이 남으면 부서진 장면이 goto를 받아 예외가 난다
        this.events.once('destroy', off);
    }

    update(_time: number, delta: number) {
        this.player.update(delta);
        this.others.update(delta);

        const px = this.player.x / S;
        const py = this.player.y / S;
        // 문 근처에 가면 건물이 열려 안이 보이고, 멀어지면 다시 닫힌다
        for (const b of BUILDINGS) {
            const open = Math.hypot(px - b.door[0], py - b.door[1]) < OPEN_REACH;
            const texture = `yg-obj-${b.key}${open ? '_open' : ''}`;
            const img = this.buildingImages.get(b.key);
            if (img && img.texture.key !== texture) {
                img.setTexture(texture);
                this.buildingLabels.get(b.key)?.setY((b.labelAt[1] + (open ? b.openDrop : 0)) * S);
            }
        }

        const building = BUILDINGS.find((b) => Math.hypot(px - b.door[0], py - b.door[1]) < DOOR_REACH);
        this.hint.setVisible(!!building);
        if (!building) return;
        this.hint.setText(`F 또는 Space: ${building.label} 들어가기`);
        if (this.player.pressedInteract()) travel(this, building.place);
    }

    // 논리 좌표 (x, y)에 서 있을 수 있는가: 맵 안이고, 물이 아니고, 건물이나 분수가 아니다
    private canWalk(x: number, y: number) {
        if (x < 8 || x > WIDTH - 8 || y < 16 || y > HEIGHT - 4) return false;
        if (this.ground[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] === 'water') return false;
        return !WALLS.some(([wx, wy, w, h]) => x >= wx && x <= wx + w && y >= wy && y <= wy + h);
    }
}
