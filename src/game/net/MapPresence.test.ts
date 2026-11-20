import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapPlayer } from '../../api';
import type { MapSocketHandlers } from './MapSocket';

// 다른 접속자 상태 보관 (API 명세서 8절). 연결(MapSocket)은 가짜로 바꿔 서버 알림을 직접 넣는다.

const mocks = vi.hoisted(() => ({
    emit: vi.fn(),
    socket: null as null | {
        handlers: MapSocketHandlers;
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
        reportMove: ReturnType<typeof vi.fn>;
    },
}));
vi.mock('../../events', () => ({ emit: mocks.emit }));
vi.mock('./MapSocket', () => ({
    MapSocket: class {
        start = vi.fn();
        stop = vi.fn();
        reportMove = vi.fn();
        constructor(readonly handlers: MapSocketHandlers) {
            mocks.socket = this;
        }
    },
}));

import { MapPresence, type PresenceListener } from './MapPresence';

const ME = 1;
const player = (user_id: number, over: Partial<MapPlayer> = {}): MapPlayer => ({
    user_id,
    nickname: `u${user_id}`,
    level: 1,
    x: 100,
    y: 200,
    dir: 'down',
    moving: false,
    ...over,
});

function listener(): PresenceListener {
    return { reset: vi.fn(), joined: vi.fn(), moved: vi.fn(), updated: vi.fn(), left: vi.fn() };
}

function setup() {
    const presence = new MapPresence(ME);
    const socket = mocks.socket!;
    return { presence, socket, server: socket.handlers };
}

beforeEach(() => {
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
});

describe('MapPresence', () => {
    it('snapshot에서 나를 뺀 접속자를 보관하고 접속자 수를 알린다', () => {
        const { presence, server } = setup();
        const l = listener();
        presence.attach(l);
        server.snapshot([player(ME), player(7), player(8)]);
        expect(l.reset).toHaveBeenLastCalledWith([player(7), player(8)]);
        expect(mocks.emit).toHaveBeenLastCalledWith('map-population', 2);
    });

    it('장면이 나중에 붙어도(건물에서 나옴) 그동안 바뀐 접속자 상태를 곧바로 받는다', () => {
        const { presence, server } = setup();
        server.snapshot([player(7), player(8)]);
        server.moved(7, 300, 400, 'left', true);
        server.updated(7, 4);
        server.left(8);
        server.joined(player(9));

        const l = listener();
        presence.attach(l);
        expect(l.reset).toHaveBeenCalledWith([player(7, { x: 300, y: 400, dir: 'left', moving: true, level: 4 }), player(9)]);
    });

    it('들어옴, 움직임, 레벨 변경, 나감을 장면에 알리고 접속자 수를 맞춘다', () => {
        const { presence, server } = setup();
        const l = listener();
        presence.attach(l);
        server.snapshot([]);

        server.joined(player(7));
        expect(l.joined).toHaveBeenCalledWith(player(7));
        expect(mocks.emit).toHaveBeenLastCalledWith('map-population', 1);

        server.moved(7, 300, 400, 'up', true);
        expect(l.moved).toHaveBeenCalledWith(expect.objectContaining({ user_id: 7, x: 300, y: 400, dir: 'up', moving: true }));

        server.updated(7, 5);
        expect(l.updated).toHaveBeenCalledWith(expect.objectContaining({ user_id: 7, level: 5 }));

        server.left(7);
        expect(l.left).toHaveBeenCalledWith(7);
        expect(mocks.emit).toHaveBeenLastCalledWith('map-population', 0);
    });

    it('내 계정이나 모르는 사용자에 대한 알림은 무시한다', () => {
        const { presence, server } = setup();
        const l = listener();
        presence.attach(l);
        server.snapshot([player(7)]);
        mocks.emit.mockClear();

        server.joined(player(ME));
        server.moved(99, 1, 1, 'up', true);
        server.updated(99, 3);
        server.left(99);

        expect(l.joined).not.toHaveBeenCalled();
        expect(l.moved).not.toHaveBeenCalled();
        expect(l.updated).not.toHaveBeenCalled();
        expect(l.left).not.toHaveBeenCalled();
        expect(mocks.emit).not.toHaveBeenCalled();
    });

    it('연결이 끊기면 다른 접속자를 모두 비운다', () => {
        const { presence, server } = setup();
        const l = listener();
        presence.attach(l);
        server.snapshot([player(7), player(8)]);
        server.disconnected();
        expect(l.reset).toHaveBeenLastCalledWith([]);
        expect(mocks.emit).toHaveBeenLastCalledWith('map-population', 0);
    });

    it('장면이 끝나 구독을 끊으면 더 알리지 않지만 상태는 계속 보관한다', () => {
        const { presence, server } = setup();
        const l = listener();
        const detach = presence.attach(l);
        server.snapshot([]);
        detach();
        server.joined(player(7));
        expect(l.joined).not.toHaveBeenCalled();
        expect(mocks.emit).toHaveBeenLastCalledWith('map-population', 1);
    });

    it('다시 연결되면 마지막 광장 위치에 멈춰 서 있다고 다시 알린다', () => {
        const { presence, socket, server } = setup();
        server.snapshot([]);
        expect(socket.reportMove).not.toHaveBeenCalled(); // 아직 광장 위치를 알린 적이 없다

        presence.reportPlaza(500, 600, 'left', true);
        expect(socket.reportMove).toHaveBeenLastCalledWith(500, 600, 'left', true);

        server.snapshot([]); // 재연결
        expect(socket.reportMove).toHaveBeenLastCalledWith(500, 600, 'left', false);
    });

    it('한 박자 늦게 연결한다. 그 전에 stop하면(StrictMode) 연결하지 않는다', () => {
        const a = setup();
        a.presence.start();
        a.presence.start();
        expect(a.socket.start).not.toHaveBeenCalled();
        vi.advanceTimersByTime(50);
        expect(a.socket.start).toHaveBeenCalledTimes(1);

        const b = setup();
        b.presence.start();
        b.presence.stop();
        vi.advanceTimersByTime(1000);
        expect(b.socket.start).not.toHaveBeenCalled();
        expect(b.socket.stop).toHaveBeenCalledTimes(1);
    });
});
