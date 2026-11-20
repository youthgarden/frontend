import { useEffect, useRef } from 'react';
import { drawEmote, OBJECTS, type EmoteKey } from '../../game/pixel-kit/index.js';

// 키트의 사물(칠판, 트로피 ...)과 감정 표현(반짝, 물음표 ...)을 React 화면에 그린다.
// 공통 부품(ui/kit)에 아직 없어서 이 폴더에 지역 부품으로 둔다. 로그인, 안내, 강의, 레벨업 화면이 함께 쓴다.

type Props = {
    /** object면 OBJECTS의 키, emote면 감정 표현 키 */
    kind: 'object' | 'emote';
    name: string;
    /** 그림 한 칸을 화면의 몇 px로 그릴지. 정수만 쓴다 */
    scale?: number;
    className?: string;
    /** 화면 낭독기에 읽어 줄 설명. 꾸밈용이면 비운다 */
    label?: string;
};

export function KitArt({ kind, name, scale = 2, className = '', label }: Props) {
    const ref = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const grid = kind === 'emote' ? drawEmote(name as EmoteKey) : OBJECTS[name]?.draw();
        if (!grid) return;
        canvas.width = grid.w;
        canvas.height = grid.h;
        canvas.style.width = `${grid.w * scale}px`;
        canvas.style.height = `${grid.h * scale}px`;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, grid.w, grid.h);
        ctx.drawImage(grid.toCanvas(), 0, 0);
    }, [kind, name, scale]);

    return (
        <canvas
            ref={ref}
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            className={`shrink-0 ${className}`}
        />
    );
}
