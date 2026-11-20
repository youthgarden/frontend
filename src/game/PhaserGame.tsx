import { useEffect, useRef, useState } from 'react';
import { AUTO, Game, Scale } from 'phaser';
import { on, type PlayerProfile } from '../events';
import { MapPresence, PRESENCE_KEY } from './net/MapPresence';
import { LEVEL_KEY, PROFILE_KEY } from './player';
import { Room } from './scenes/Room';
import { World } from './scenes/World';

// 와이어프레임 기준 크기. 창 크기가 달라지면 비율을 유지한 채 맞춰진다.
export const GAME_WIDTH = 1440;
export const GAME_HEIGHT = 900;

export function PhaserGame({ profile }: { profile: PlayerProfile }) {
    const parent = useRef<HTMLDivElement>(null);
    // 게임을 만들 때의 값만 쓴다. 레벨이 바뀌어도 게임을 다시 만들지 않고 'player-level' 이벤트로만 알린다.
    const [initial] = useState(profile);

    useEffect(() => {
        // 멀티플레이 연결은 게임당 하나다. 장면(광장 ↔ 건물)이 바뀌어도 유지한다.
        const presence = new MapPresence(initial.userId);
        const game = new Game({
            type: AUTO,
            parent: parent.current!,
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            backgroundColor: '#3a3546',
            pixelArt: true, // 픽셀 그림을 키워도 뭉개지지 않게 한다
            audio: { noAudio: true }, // 소리를 쓰지 않는다. 쓰게 되면 이 줄을 지운다
            scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
            callbacks: {
                // 장면이 만들어지기 전에 내 캐릭터 정보와 연결을 넣어 둔다
                preBoot: (g) => {
                    g.registry.set(PROFILE_KEY, initial);
                    g.registry.set(LEVEL_KEY, initial.level);
                    g.registry.set(PRESENCE_KEY, presence);
                },
            },
            scene: [World, Room],
        });
        // 지금 레벨을 게임 단위로 보관한다. 건물을 드나들어 장면이 새로 만들어져도 바뀐 모자 색으로 그린다
        const offLevel = on('player-level', (lv) => game.registry.set(LEVEL_KEY, lv));
        // 실제 연결은 조금 늦게 시작된다. StrictMode가 곧바로 부수는 첫 게임은 접속하지 않는다
        presence.start();
        return () => {
            offLevel();
            presence.stop();
            game.destroy(true);
        };
    }, [initial]);

    return <div ref={parent} className="h-screen w-screen" />;
}
