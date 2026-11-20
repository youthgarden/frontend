import { useEffect, useRef } from 'react';
import { drawCharacter, FRAME_H, FRAME_W, type CharacterSpec, type Dir } from '../../game/pixel-kit/index.js';

type Props = {
    spec: CharacterSpec;
    dir?: Dir;
    /** 그림 한 칸을 화면의 몇 px로 그릴지. 정수만 쓴다 (도트가 뭉개지지 않게) */
    scale?: number;
    /** head면 모자와 얼굴만 잘라 보여준다 (HUD의 작은 얼굴, 레벨 표시) */
    crop?: 'full' | 'head';
    /** 숨쉬기 동작. 가만히 서 있는 캐릭터가 살아 보이게 한다 */
    breathing?: boolean;
    className?: string;
    /** 화면 낭독기에 읽어 줄 설명. 꾸밈용이면 비운다 */
    label?: string;
};

// 머리만 자를 때의 영역 (키트 프레임 48x64 기준). 모자 꼭대기부터 턱까지다.
const HEAD = { x: 4, y: 2, w: 40, h: 40 };

// 픽셀 키트의 캐릭터를 React 화면에 그린다. 맵 밖(로그인, HUD, 시험관 대화, 레벨업)에서 쓴다.
export function PixelCharacter({ spec, dir = 'down', scale = 2, crop = 'full', breathing = false, className = '', label }: Props) {
    const ref = useRef<HTMLCanvasElement>(null);
    const area = crop === 'head' ? HEAD : { x: 0, y: 0, w: FRAME_W, h: FRAME_H };
    // spec은 매번 새 객체로 올 수 있어서 내용으로 비교한다
    const specKey = JSON.stringify(spec);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const paint = (frame: number) => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(drawCharacter(spec, dir, frame).toCanvas(), -area.x, -area.y);
        };
        paint(0);
        if (!breathing || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let on = false;
        const timer = window.setInterval(() => {
            on = !on;
            paint(on ? 4 : 0);
        }, 500);
        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [specKey, dir, breathing, crop]);

    return (
        <canvas
            ref={ref}
            width={area.w}
            height={area.h}
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            className={`shrink-0 ${className}`}
            style={{ width: area.w * scale, height: area.h * scale }}
        />
    );
}
