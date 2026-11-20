import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Scene } from 'phaser';
import type { MapPlayer } from '../../api';
import type { Player } from '../player';
import type { PresenceListener } from './MapPresence';

// 다른 접속자 그리기. Phaser와 캐릭터 그림은 가짜로 바꾸고, 위치 따라가기와 서버 보고만 확인한다.

const { views, FakeView } = vi.hoisted(() => {
    const all: { x: number; y: number; destroyed: boolean; motion: [boolean, string] | null; opts: { name: string }; setLevel: ReturnType<typeof vi.fn> }[] = [];
    class FakeView {
        x: number;
        y: number;
        destroyed = false;
        motion: [boolean, string] | null = null;
        constructor(_scene: unknown, readonly opts: { x: number; y: number; name: string; level: number }) {
            this.x = opts.x;
            this.y = opts.y;
            all.push(this);
        }
        setPosition(x: number, y: number) {
            this.x = x;
            this.y = y;
        }
        setMotion(moving: boolean, dir: string) {
            this.motion = [moving, dir];
        }
        setLevel = vi.fn();
        destroy() {
            this.destroyed = true;
        }
    }
    return { views: all, FakeView };
});

vi.mock('phaser', () => ({ Scenes: { Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' } } }));
vi.mock('../../character', () => ({ characterSpec: (id: number, level: number) => ({ id, level }) }));
vi.mock('../character/CharacterView', () => ({ CharacterView: FakeView }));
vi.mock('./MapPresence', () => ({ PRESENCE_KEY: 'presence' }));

import { RemotePlayers } from './RemotePlayers';

const player = (user_id: number, over: Partial<MapPlayer> = {}): MapPlayer => ({
    user_id,
    nickname: `u${user_id}`,
    level: 1,
    x: 100,
    y: 100,
    dir: 'down',
    moving: false,
    ...over,
});

function setup(withPresence = true) {
    let listener!: PresenceListener;
    const detach = vi.fn();
    const presence = {
        attach: vi.fn((l: PresenceListener) => {
            listener = l;
            return detach;
        }),
        reportPlaza: vi.fn(),
    };
    const once = new Map<string, () => void>();
    const scene = {
        registry: { get: () => (withPresence ? presence : undefined) },
        events: { once: (name: string, fn: () => void) => once.set(name, fn) },
    } as unknown as Scene;
    const me = { x: 10, y: 20, dir: 'right', moving: true } as unknown as Player;
    const remotes = new RemotePlayers(scene, me, 3);
    return { remotes, presence, detach, me, shutdown: () => once.get('shutdown')!(), on: () => listener };
}

beforeEach(() => {
    views.length = 0;
});

describe('RemotePlayers', () => {
    it('받은 좌표로 조금씩 따라간다. 지나치지 않고 결국 도착하며 걷는 동안은 걷는 모습이다', () => {
        const { remotes, on } = setup();
        on().reset([player(7)]);
        on().moved(player(7, { x: 200, moving: false, dir: 'right' }));

        remotes.update(16);
        const v = views[0];
        expect(v.x).toBeGreaterThan(100);
        expect(v.x).toBeLessThan(200);
        // 멈춤 신호를 받았어도 남은 거리를 걷는 중이다
        expect(v.motion).toEqual([true, 'right']);

        for (let i = 0; i < 120; i++) remotes.update(16);
        expect(v.x).toBe(200);
        expect(v.motion).toEqual([false, 'right']);
    });

    it('너무 멀면(재접속 등) 걷지 않고 바로 옮긴다', () => {
        const { remotes, on } = setup();
        on().reset([player(7)]);
        on().moved(player(7, { x: 900, y: 800 }));
        remotes.update(16);
        expect([views[0].x, views[0].y]).toEqual([900, 800]);
    });

    it('reset은 그리던 캐릭터를 모두 지우고 새로 그린다. 나간 사용자의 캐릭터도 지운다', () => {
        const { on } = setup();
        on().reset([player(7), player(8)]);
        on().left(8);
        expect(views[1].destroyed).toBe(true);
        expect(views[0].destroyed).toBe(false);

        on().reset([player(9)]);
        expect(views[0].destroyed).toBe(true);
        expect(views).toHaveLength(3);
        expect(views[2].opts.name).toBe('u9');
    });

    it('같은 사용자가 다시 들어오면 캐릭터가 겹치지 않는다', () => {
        const { on } = setup();
        on().joined(player(7));
        on().joined(player(7, { x: 300 }));
        expect(views.filter((v) => !v.destroyed)).toHaveLength(1);
    });

    it('레벨이 바뀌면 그 사용자의 캐릭터에 반영한다', () => {
        const { on } = setup();
        on().reset([player(7)]);
        on().updated(player(7, { level: 4 }));
        expect(views[0].setLevel).toHaveBeenCalledWith(4, { id: 7, level: 4 });
    });

    it('매 프레임 내 위치를 알리고, 장면이 끝나면(건물에 들어감) 그 자리에 멈춰 섰다고 한 번 알린다', () => {
        const { remotes, presence, detach, shutdown } = setup();
        remotes.update(16);
        expect(presence.reportPlaza).toHaveBeenLastCalledWith(10, 20, 'right', true);

        shutdown();
        expect(detach).toHaveBeenCalled();
        expect(presence.reportPlaza).toHaveBeenLastCalledWith(10, 20, 'right', false);
    });

    it('연결 없이 맵만 띄워도 오류 없이 동작한다', () => {
        const { remotes, presence } = setup(false);
        expect(() => remotes.update(16)).not.toThrow();
        expect(presence.attach).not.toHaveBeenCalled();
    });
});
