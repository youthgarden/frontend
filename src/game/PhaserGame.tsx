import { useEffect, useRef } from 'react';
import { AUTO, Game, Scale } from 'phaser';
import { Room } from './scenes/Room';
import { World } from './scenes/World';

// 와이어프레임 기준 크기. 창 크기가 달라지면 비율을 유지한 채 맞춰진다.
export const GAME_WIDTH = 1440;
export const GAME_HEIGHT = 900;

export function PhaserGame() {
    const parent = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const game = new Game({
            type: AUTO,
            parent: parent.current!,
            width: GAME_WIDTH,
            height: GAME_HEIGHT,
            backgroundColor: '#3a3546',
            pixelArt: true, // 픽셀 그림을 키워도 뭉개지지 않게 한다
            audio: { noAudio: true }, // 소리를 쓰지 않는다. 쓰게 되면 이 줄을 지운다
            scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
            scene: [World, Room],
        });
        return () => game.destroy(true);
    }, []);

    return <div ref={parent} className="h-screen w-screen" />;
}
