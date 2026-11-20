import { useEffect } from 'react';

type Props = { title: string; onClose: () => void };

// 맵 위에 뜨는 패널의 빈 틀. 화면 담당이 실제 패널(Figma P3~P10)로 바꿀 자리다.
export function PanelPlaceholder({ title, onClose }: Props) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        // 패널 바깥(어두운 부분)을 누르면 닫힌다
        <div className="fixed inset-0 flex items-center justify-center bg-black/30" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="panel-title"
                className="w-[640px] max-w-[90vw] rounded-xl bg-white p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 id="panel-title" className="text-lg font-bold">{title}</h2>
                    <button onClick={onClose} className="rounded-full border border-neutral-400 px-4 py-1 text-sm">
                        닫기 (Esc)
                    </button>
                </div>
                <div className="mt-4 flex aspect-video items-center justify-center bg-neutral-300 text-neutral-600">
                    패널 내용이 들어갈 자리
                </div>
            </div>
        </div>
    );
}
