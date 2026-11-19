import { useEffect } from 'react';

type Props = { onClose: () => void };

// 강의 팝업. 맵이 뒤에 보이도록 화면 가운데에 작게 뜬다.
// 지금은 틀만 있고, 영상·목차·진도는 와이어프레임 4번 화면을 보고 채운다.
export function LectureModal({ onClose }: Props) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        // 팝업 바깥(어두운 부분)을 누르면 닫힌다
        <div className="fixed inset-0 flex items-center justify-center bg-black/30" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="lecture-title"
                className="w-[640px] max-w-[90vw] rounded-xl bg-white p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 id="lecture-title" className="text-lg font-bold">AI로 HS코드 분류하기</h2>
                    <button onClick={onClose} className="rounded-full border border-neutral-400 px-4 py-1 text-sm">
                        닫기 (Esc)
                    </button>
                </div>
                <div className="mt-4 flex aspect-video items-center justify-center bg-neutral-300 text-neutral-600">
                    강의 영상
                </div>
            </div>
        </div>
    );
}
