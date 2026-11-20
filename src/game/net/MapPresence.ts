import type { Dir, MapPlayer } from '../../api';
import { emit } from '../../events';
import { MapSocket } from './MapSocket';

// 멀티플레이 연결과 다른 접속자의 상태를 게임 단위로 보관한다 (API 명세서 8절).
// 광장(World)에서 건물(Room)로 들어가면 World 장면이 끝나지만, 명세는 맵 화면에 있는 동안 연결을 유지하고
// 내 캐릭터가 그 자리(문 앞)에 서 있는 것으로 보이게 한다. 그래서 연결과 상태는 장면이 아니라 여기에 둔다.
// - 연결은 게임당 하나다. PhaserGame이 게임을 만들 때 만들고 game.registry에 넣으며, 게임을 부술 때 닫는다.
// - 다른 접속자를 그리는 일은 World 장면(RemotePlayers)이 한다. 이 모듈은 Phaser를 import하지 않는다.
// - 접속자 수(map-population)는 장면과 관계없이 바뀔 때마다 알린다.

/** PhaserGame이 game.registry에 이 모듈을 넣어 두는 키 */
export const PRESENCE_KEY = 'presence';

/**
 * 한 박자 늦게 연결한다. React StrictMode는 게임을 만들자마자 한 번 부수는데,
 * 부서질 게임이 먼저 접속하면 서버가 같은 계정의 두 번째 접속으로 보고 진짜 연결을 4409로 끊을 수 있다.
 */
const START_DELAY_MS = 50;

/** 지금 그리고 있는 장면(World)이 받는 알림 */
export interface PresenceListener {
    /** 다른 접속자 전체가 바뀌었다(연결, 재연결, 끊김). 그리던 것을 모두 지우고 이것으로 다시 그린다 */
    reset(players: readonly MapPlayer[]): void;
    joined(player: MapPlayer): void;
    moved(player: MapPlayer): void;
    /** 레벨이 바뀌었다 */
    updated(player: MapPlayer): void;
    left(userId: number): void;
}

export class MapPresence {
    private readonly players = new Map<number, MapPlayer>();
    private readonly socket: MapSocket;
    private listener: PresenceListener | null = null;
    private startTimer: ReturnType<typeof setTimeout> | null = null;
    /** 마지막으로 알린 광장 위치. 건물 안에 있는 동안 다시 연결되면 이 자리(문 앞)에 서 있다고 다시 알린다 */
    private lastPlaza: { x: number; y: number; dir: Dir } | null = null;

    constructor(private readonly myId: number) {
        this.socket = new MapSocket({
            snapshot: (players) => this.onSnapshot(players),
            joined: (p) => this.onJoined(p),
            moved: (id, x, y, dir, moving) => this.onMoved(id, x, y, dir, moving),
            updated: (id, level) => this.onUpdated(id, level),
            left: (id) => this.onLeft(id),
            disconnected: () => this.onSnapshot([]),
        });
    }

    start() {
        if (this.startTimer !== null) return;
        this.startTimer = setTimeout(() => this.socket.start(), START_DELAY_MS);
    }

    /** 게임이 부서질 때 부른다. 연결 전이면 예약을 취소한다 */
    stop() {
        if (this.startTimer !== null) clearTimeout(this.startTimer);
        this.startTimer = null;
        this.socket.stop();
        this.listener = null;
        this.players.clear();
    }

    /**
     * 장면이 그리기 시작한다. 지금까지 보관된 다른 접속자를 곧바로 reset으로 받는다.
     * 돌려준 함수를 장면이 끝날 때 부른다. 연결은 그대로 둔다.
     */
    attach(listener: PresenceListener) {
        this.listener = listener;
        listener.reset([...this.players.values()]);
        return () => {
            if (this.listener === listener) this.listener = null;
        };
    }

    /**
     * 광장에서 내 캐릭터의 지금 상태를 알린다. 광장(World)에서만 부른다. 매 프레임 불러도 된다.
     * 보내는 빈도는 MapSocket이 초당 10번까지로 줄인다.
     */
    reportPlaza(x: number, y: number, dir: Dir, moving: boolean) {
        this.lastPlaza = { x, y, dir };
        this.socket.reportMove(x, y, dir, moving);
    }

    private onSnapshot(players: MapPlayer[]) {
        this.players.clear();
        for (const p of players) if (p.user_id !== this.myId) this.players.set(p.user_id, { ...p });
        this.listener?.reset([...this.players.values()]);
        this.emitPopulation();
        // 서버는 새 연결을 시작 자리에 세운다. 이미 광장의 다른 자리에 있었다면 그 자리를 다시 알린다
        // (건물 안에 있으면 매 프레임 알리지 않으므로 여기서 한 번 보낸다)
        // 연결이 끊겨 빈 목록으로 부른 경우에는 MapSocket이 보내지 않는다
        const at = this.lastPlaza;
        if (at) this.socket.reportMove(at.x, at.y, at.dir, false);
    }

    private onJoined(p: MapPlayer) {
        if (p.user_id === this.myId) return;
        const player = { ...p };
        this.players.set(p.user_id, player);
        this.listener?.joined(player);
        this.emitPopulation();
    }

    private onMoved(id: number, x: number, y: number, dir: Dir, moving: boolean) {
        const p = this.players.get(id);
        if (!p) return;
        Object.assign(p, { x, y, dir, moving });
        this.listener?.moved(p);
    }

    private onUpdated(id: number, level: number) {
        const p = this.players.get(id);
        if (!p) return;
        p.level = level;
        this.listener?.updated(p);
    }

    private onLeft(id: number) {
        if (!this.players.delete(id)) return;
        this.listener?.left(id);
        this.emitPopulation();
    }

    private emitPopulation() {
        emit('map-population', this.players.size);
    }
}
