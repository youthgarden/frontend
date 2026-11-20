// 멀티플레이 WebSocket (/api/v1/ws/map). 명세 8절을 따른다.
// 혼자 검수해도 다른 캐릭터가 보이도록, 서버가 직접 움직이는 가상 접속자(봇)를 둔다.

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import type { MapPlayer, MapServerMessage } from '../src/api/types';
import { MAP_HEIGHT, MAP_WIDTH, SPAWN, WALK_BOUNDS, dirToYaw } from '../src/game/mapSpec';
import { verifyAccess } from './auth';
import type { Store } from './store';

export const WS_PATH = '/api/v1/ws/map';

const AUTH_TIMEOUT_MS = 5000;
const MOVE_LIMIT_PER_SEC = 10;

interface Client extends MapPlayer {
    ws: WebSocket;
    moveTimes: number[];
}

interface Bot extends MapPlayer {
    target: { x: number; y: number } | null;
    waitUntil: number;
    speed: number;
}

const BOT_DEFS = [
    { user_id: 9001, nickname: '하늘', level: 1 },
    { user_id: 9002, nickname: '도윤', level: 2 },
    { user_id: 9003, nickname: '수아', level: 3 },
    { user_id: 9004, nickname: '태오', level: 4 },
    { user_id: 9005, nickname: '봄이', level: 6 },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

function publicPlayer(p: MapPlayer): MapPlayer {
    return { user_id: p.user_id, nickname: p.nickname, level: p.level, x: Math.round(p.x), y: Math.round(p.y), yaw: p.yaw, moving: p.moving };
}

export class MapHub {
    private wss = new WebSocketServer({ noServer: true });
    private clients = new Map<number, Client>();
    private bots: Bot[];
    private tickTimer: ReturnType<typeof setInterval>;
    private lastTick = Date.now();

    constructor(private store: () => Store) {
        this.bots = BOT_DEFS.map((d, i) => ({
            ...d,
            x: WALK_BOUNDS.left + ((i + 1) * (WALK_BOUNDS.right - WALK_BOUNDS.left)) / (BOT_DEFS.length + 1),
            y: rand(WALK_BOUNDS.top + 40, WALK_BOUNDS.bottom - 40),
            yaw: dirToYaw('down'),
            moving: false,
            target: null,
            waitUntil: Date.now() + rand(500, 3000),
            speed: rand(70, 110),
        }));
        this.tickTimer = setInterval(() => this.tickBots(), 150);
    }

    /** HTTP 서버의 upgrade 이벤트. 이 경로가 아니면 손대지 않는다 (Vite HMR 등) */
    handleUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const pathname = (req.url ?? '').split('?')[0];
        if (pathname !== WS_PATH) return;
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    };

    private send(ws: WebSocket, msg: MapServerMessage) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    private broadcast(msg: MapServerMessage, exceptUserId?: number) {
        for (const c of this.clients.values()) {
            if (c.user_id !== exceptUserId) this.send(c.ws, msg);
        }
    }

    private onConnection(ws: WebSocket) {
        let me: Client | null = null;
        const timer = setTimeout(() => {
            if (!me) ws.close(4401, 'auth timeout');
        }, AUTH_TIMEOUT_MS);

        ws.on('message', (data: RawData) => {
            let msg: Record<string, unknown>;
            try {
                const parsed: unknown = JSON.parse(data.toString());
                if (!parsed || typeof parsed !== 'object') throw new Error('not object');
                msg = parsed as Record<string, unknown>;
            } catch {
                if (!me) ws.close(4401, 'auth required');
                return;
            }
            if (!me) {
                clearTimeout(timer);
                me = this.authenticate(ws, msg);
                return;
            }
            if (msg.type === 'move') this.onMove(me, msg);
        });

        ws.on('close', () => {
            clearTimeout(timer);
            if (me && this.clients.get(me.user_id) === me) {
                this.clients.delete(me.user_id);
                this.broadcast({ type: 'player_left', user_id: me.user_id });
            }
        });
        ws.on('error', () => undefined);
    }

    private authenticate(ws: WebSocket, msg: Record<string, unknown>): Client | null {
        const store = this.store();
        const check = msg.type === 'auth' && typeof msg.access_token === 'string' ? verifyAccess(msg.access_token, store) : null;
        if (!check || !check.ok) {
            ws.close(4401, check ? check.code : 'auth required');
            return null;
        }
        const user = store.user(check.userId)!;
        // 같은 계정의 기존 연결은 4409로 닫는다. 다른 사람에게는 나갔다 들어온 것으로 알린다
        const old = this.clients.get(user.id);
        if (old) {
            this.clients.delete(user.id);
            old.ws.close(4409, 'connected elsewhere');
            this.broadcast({ type: 'player_left', user_id: user.id });
        }
        const client: Client = {
            ws,
            user_id: user.id,
            nickname: user.nickname,
            level: user.level,
            x: SPAWN.x,
            y: SPAWN.y,
            yaw: dirToYaw('down'),
            moving: false,
            moveTimes: [],
        };
        const players = [...this.clients.values(), ...this.bots].map(publicPlayer);
        this.clients.set(user.id, client);
        this.send(ws, { type: 'snapshot', me: { x: SPAWN.x, y: SPAWN.y, yaw: dirToYaw('down') }, players });
        this.broadcast({ type: 'player_joined', player: publicPlayer(client) }, user.id);
        return client;
    }

    private onMove(c: Client, msg: Record<string, unknown>) {
        const { x, y, yaw, moving } = msg;
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return;
        // 방향각은 [-π, π) 범위의 유한한 숫자여야 한다
        if (typeof yaw !== 'number' || !(yaw >= -Math.PI && yaw < Math.PI) || typeof moving !== 'boolean') return;
        const now = Date.now();
        c.moveTimes = c.moveTimes.filter((t) => t > now - 1000);
        if (c.moveTimes.length >= MOVE_LIMIT_PER_SEC) return; // 초당 10번을 넘으면 버린다
        c.moveTimes.push(now);
        c.x = Math.round(clamp(x, 0, MAP_WIDTH));
        c.y = Math.round(clamp(y, 0, MAP_HEIGHT));
        c.yaw = yaw;
        c.moving = moving;
        this.broadcast({ type: 'player_moved', user_id: c.user_id, x: c.x, y: c.y, yaw: c.yaw, moving: c.moving }, c.user_id);
    }

    /** 채점으로 레벨이 바뀌면 모두에게 알린다 (명세 8절 "모두에게") */
    updateLevel(userId: number, level: number) {
        const c = this.clients.get(userId);
        if (c) c.level = level;
        this.broadcast({ type: 'player_updated', user_id: userId, level });
    }

    private tickBots() {
        const now = Date.now();
        const dt = Math.min((now - this.lastTick) / 1000, 0.5);
        this.lastTick = now;
        for (const b of this.bots) {
            if (!b.target) {
                if (now < b.waitUntil) continue;
                b.target = {
                    x: clamp(b.x + rand(-260, 260), WALK_BOUNDS.left, WALK_BOUNDS.right),
                    y: clamp(b.y + rand(-180, 180), WALK_BOUNDS.top, WALK_BOUNDS.bottom),
                };
            }
            // 가로로 먼저, 다음에 세로로 걷는다 (방향이 자연스럽게 보이도록)
            const step = b.speed * dt;
            const dx = b.target.x - b.x;
            const dy = b.target.y - b.y;
            if (Math.abs(dx) > 1) {
                b.x += Math.sign(dx) * Math.min(step, Math.abs(dx));
                b.yaw = dirToYaw(dx > 0 ? 'right' : 'left');
            } else if (Math.abs(dy) > 1) {
                b.y += Math.sign(dy) * Math.min(step, Math.abs(dy));
                b.yaw = dirToYaw(dy > 0 ? 'down' : 'up');
            }
            const arrived = Math.abs(b.target.x - b.x) <= 1 && Math.abs(b.target.y - b.y) <= 1;
            b.moving = !arrived;
            if (arrived) {
                b.target = null;
                b.waitUntil = now + rand(1500, 6000);
            }
            if (this.clients.size) {
                this.broadcast({ type: 'player_moved', user_id: b.user_id, x: Math.round(b.x), y: Math.round(b.y), yaw: b.yaw, moving: b.moving });
            }
        }
    }

    /** 검수용 초기화 뒤: 접속을 모두 끊어 새 데이터로 다시 붙게 한다 (1012: 서버 재시작) */
    closeAll(code = 1012) {
        for (const c of this.clients.values()) c.ws.close(code, 'mock reset');
        this.clients.clear();
    }

    dispose() {
        clearInterval(this.tickTimer);
        for (const c of this.clients.values()) c.ws.terminate();
        this.clients.clear();
        this.wss.close();
    }
}
