import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { emit } from '../../events';
import { Button } from './Button';

// 맵 위에 뜬 창의 수. 하나라도 떠 있으면 캐릭터가 멈춘다.
let openCount = 0;

/**
 * 이 훅을 쓴 컴포넌트가 화면에 있는 동안 맵의 캐릭터 조작을 막는다.
 * Dialog는 알아서 쓰고, 전체 화면을 덮는 화면(시험 등)은 직접 부른다.
 */
export function useMapLock(active = true) {
    useEffect(() => {
        if (!active) return;
        openCount += 1;
        if (openCount === 1) emit('ui-modal', true);
        return () => {
            openCount -= 1;
            if (openCount === 0) emit('ui-modal', false);
        };
    }, [active]);
}

type Props = {
    title: ReactNode;
    /** 제목 아래 한 줄 설명 */
    description?: ReactNode;
    onClose: () => void;
    /** false면 Esc, 바깥 누르기, 닫기 버튼으로 닫을 수 없다. 반드시 골라야 하는 확인 창에 쓴다 */
    dismissible?: boolean;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    /** 아래쪽 버튼 줄. 가장 권하는 행동을 오른쪽 끝에 둔다 */
    footer?: ReactNode;
    children: ReactNode;
};

const WIDTH = { sm: 'w-[420px]', md: 'w-[560px]', lg: 'w-[760px]', xl: 'w-[980px]' };

// 맵 위에 뜨는 창. 맵이 뒤로 비쳐 보여 "맵 안에서 연 창"이라는 맥락이 유지된다.
export function Dialog({ title, description, onClose, dismissible = true, size = 'md', footer, children }: Props) {
    const titleId = useId();
    const descId = useId();
    const box = useRef<HTMLDivElement>(null);
    useMapLock();

    // 창을 열기 직전에 초점이 있던 요소. effect에서 읽으면 이미 창 안 버튼의 autoFocus가 처리된 뒤라서
    // 처음 그릴 때(렌더 중에) 한 번만 읽어 둔다
    const [previous] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)));

    useEffect(() => {
        const node = box.current;
        // 창이 열리면 초점을 창 안으로 옮긴다. 안에 autoFocus가 있으면 그대로 둔다
        if (node && !node.contains(document.activeElement)) node.focus();
        return () => {
            // StrictMode가 effect를 한 번 걷었다 다시 붙일 때는 창이 문서에 그대로 있다. 그때는 초점을 옮기지 않는다
            if (!node || node.isConnected) return;
            // 초점이 이미 다른 곳(새로 뜬 창 등)에 가 있으면 빼앗지 않는다. 창과 함께 사라져 body로 떨어졌을 때만 돌려준다
            const active = document.activeElement;
            if (active && active !== document.body) return;
            if (previous?.isConnected) previous.focus();
        };
    }, [previous]);

    useEffect(() => {
        const self = box.current;
        const onKey = (e: KeyboardEvent) => {
            // 창이 겹쳐 있으면 Esc와 Tab은 맨 위 창만 받는다. 맨 위 창은 화면에서 가장 나중에 그려진 창이다
            const dialogs = document.querySelectorAll('[role="dialog"]');
            if (dialogs[dialogs.length - 1] !== self) return;
            if (e.key === 'Escape' && dismissible) {
                e.stopPropagation();
                onClose();
            }
            // 초점이 창 밖으로 나가지 않게 처음과 끝을 잇는다
            if (e.key === 'Tab' && box.current) {
                const items = box.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
                );
                // 초점을 받을 요소가 없으면 ("제출하고 있어요" 같은 창) 창 상자에 머문다
                if (items.length === 0) {
                    e.preventDefault();
                    box.current.focus();
                    return;
                }
                const first = items[0];
                const last = items[items.length - 1];
                // 초점이 창 밖에 있었으면 창 안으로 끌어온다
                if (!box.current.contains(document.activeElement)) {
                    e.preventDefault();
                    (e.shiftKey ? last : first).focus();
                    return;
                }
                if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [dismissible, onClose]);

    return (
        <div
            className="fixed inset-0 z-40 flex items-center justify-center bg-ink/45 p-6"
            onMouseDown={(e) => {
                if (dismissible && e.target === e.currentTarget) onClose();
            }}
        >
            <div
                ref={box}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descId : undefined}
                tabIndex={-1}
                className={`px-box flex max-h-[calc(100vh-64px)] max-w-full animate-[px-pop_0.16s_steps(3)] flex-col bg-paper outline-none ${WIDTH[size]}`}
            >
                <header className="flex shrink-0 items-start justify-between gap-4 border-b-[3px] border-ink bg-sun px-5 py-3">
                    <div className="min-w-0">
                        <h2 id={titleId} className="font-pixel text-[19px] font-bold leading-tight">{title}</h2>
                        {description && <p id={descId} className="mt-1 text-[14px] leading-snug text-ink/80">{description}</p>}
                    </div>
                    {dismissible && (
                        <Button size="sm" onClick={onClose} keyHint="Esc" className="shrink-0">닫기</Button>
                    )}
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
                {footer && (
                    <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t-2 border-line bg-paper-sunk px-5 py-4">
                        {footer}
                    </footer>
                )}
            </div>
        </div>
    );
}
