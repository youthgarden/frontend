import { useEffect, useRef } from 'react';
import { AUTO, Game, Scale } from 'phaser';
import { Classroom } from './scenes/Classroom';

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
            backgroundColor: '#e4e4e4',
            scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
            scene: [Classroom],
        });
        return () => game.destroy(true);
    }, []);

    return <div ref={parent} className="h-screen w-screen" />;
}
