import { Scenes, type Scene } from 'phaser';
import type { Dir, MapPlayer } from '../../api';
import { characterSpec } from '../../character';
import { CharacterView } from '../character/CharacterView';
import type { Player } from '../player';
import { MapPresence, PRESENCE_KEY } from './MapPresence';

// 광장(World) 장면에서 다른 접속자를 그리고, 내 위치를 서버에 알린다.
// 연결과 접속자 상태는 게임 단위의 MapPresence가 갖고 있고, 이 클래스는 장면이 살아 있는 동안만 그린다.
// 장면이 끝나면(건물에 들어감) 그린 것만 지우고, 내 캐릭터가 그 자리(문 앞)에 멈춰 선 것으로 한 번 알린다.
// 좌표는 서버와 맵이 같은 기준이다: 화면에 그려지는 맵 픽셀(논리 좌표 x S), 발 위치.

// 보간: 받은 좌표로 부드럽게 따라간다. 이보다 멀면(재접속 등) 바로 옮긴다
const SMOOTH_MS = 90;
const SNAP_DIST = 400;

interface Remote {
    view: CharacterView;
    tx: number;
    ty: number;
    dir: Dir;
    moving: boolean;
}

export class RemotePlayers {
    private readonly remotes = new Map<number, Remote>();
    private readonly presence: MapPresence | undefined;

    // scale: 캐릭터 그림의 배율. 맵의 그림 배율(S)과 같게 준다
    constructor(private readonly scene: Scene, private readonly me: Player, private readonly scale: number) {
        this.presence = scene.registry.get(PRESENCE_KEY) as MapPresence | undefined;
        if (!this.presence) return; // 연결 없이 맵만 띄운 경우. 혼자 동작한다
        const detach = this.presence.attach({
            reset: (players) => {
                this.clear();
                players.forEach((p) => this.add(p));
            },
            joined: (p) => this.add(p),
            moved: (p) => {
                const r = this.remotes.get(p.user_id);
                if (r) Object.assign(r, { tx: p.x, ty: p.y, dir: p.dir, moving: p.moving });
            },
            updated: (p) => this.remotes.get(p.user_id)?.view.setLevel(p.level, characterSpec(p.user_id, p.level)),
            left: (id) => this.remove(id),
        });
        // 그린 캐릭터는 CharacterView가 장면과 함께 지운다. 여기서는 알림만 끊는다
        scene.events.once(Scenes.Events.SHUTDOWN, () => {
            detach();
            this.remotes.clear();
            // 건물에 들어가는 순간: 마지막 광장 위치에 멈춰 섰다고 알린다
            this.presence?.reportPlaza(this.me.x, this.me.y, this.me.dir, false);
        });
        scene.events.once(Scenes.Events.DESTROY, detach);
    }

    /** 매 프레임 부른다. 다른 접속자를 받은 좌표로 옮기고, 내 위치를 알린다 */
    update(delta: number) {
        const k = 1 - Math.exp(-delta / SMOOTH_MS);
        for (const r of this.remotes.values()) {
            const v = r.view;
            const dx = r.tx - v.x;
            const dy = r.ty - v.y;
            const dist = Math.hypot(dx, dy);
            if (dist > SNAP_DIST || dist < 0.5) {
                if (dist > 0) v.setPosition(r.tx, r.ty);
            } else {
                v.setPosition(v.x + dx * k, v.y + dy * k);
            }
            // 멈춤 신호를 받아도 남은 거리를 걷는 동안은 걷는 모습으로 둔다
            v.setMotion(r.moving || dist > 2, r.dir);
        }
        this.presence?.reportPlaza(this.me.x, this.me.y, this.me.dir, this.me.moving);
    }

    private add(p: MapPlayer) {
        this.remove(p.user_id);
        const view = new CharacterView(this.scene, {
            key: `yg-user-${p.user_id}`,
            spec: characterSpec(p.user_id, p.level),
            name: p.nickname,
            level: p.level,
            x: p.x,
            y: p.y,
            dir: p.dir,
            scale: this.scale,
        });
        view.setMotion(p.moving, p.dir);
        this.remotes.set(p.user_id, { view, tx: p.x, ty: p.y, dir: p.dir, moving: p.moving });
    }

    private remove(id: number) {
        this.remotes.get(id)?.view.destroy();
        this.remotes.delete(id);
    }

    private clear() {
        for (const r of this.remotes.values()) r.view.destroy();
        this.remotes.clear();
    }
}
