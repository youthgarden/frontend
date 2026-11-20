import { useEffect, useId, useRef, useState, type ClipboardEvent } from 'react';
import type { SaveState } from './useAutosave';
import { formatTime } from './util';

// 시험 화면 오른쪽: 답안. 입력이 멈추고 3초 뒤에 자동으로 저장된다.

export const ANSWER_MAX = 20000;

function saveText(s: SaveState): { text: string; tone: 'soft' | 'warn' } {
    switch (s.kind) {
        case 'saving':
            return { text: '저장 중', tone: 'soft' };
        case 'retrying':
            return { text: '저장하지 못했어요. 다시 시도하는 중', tone: 'warn' };
        case 'dirty':
            return { text: s.savedAt ? `${formatTime(s.savedAt)}에 저장됨 · 입력을 멈추면 저장해요` : '입력을 멈추면 저장해요', tone: 'soft' };
        case 'clean':
            return { text: s.savedAt ? `${formatTime(s.savedAt)}에 저장됨` : '', tone: 'soft' };
    }
}

export function AnswerPane({ value, onChange, onPaste, saveState, locked }: {
    value: string;
    onChange: (text: string) => void;
    onPaste: (length: number) => void;
    saveState: SaveState;
    locked: boolean;
}) {
    const id = useId();
    const statusId = useId();
    const save = saveText(saveState);

    // 화면 낭독기에 읽어 줄 저장 소식. 저장에 실패한 순간과 실패 뒤 다시 저장된 순간에만 문장을 넣는다.
    // 평소의 "몇 시에 저장됨"은 입력할 때마다 바뀌므로 읽지 않는다
    const [announce, setAnnounce] = useState('');
    const failedRef = useRef(false);
    useEffect(() => {
        if (saveState.kind === 'retrying' && !failedRef.current) {
            failedRef.current = true;
            setAnnounce('답안을 저장하지 못했어요. 다시 시도하고 있어요.');
        } else if ((saveState.kind === 'clean' || saveState.kind === 'dirty') && failedRef.current) {
            // 다시 시도가 성공하면 clean, 그사이 더 입력했으면 dirty가 된다 (saving은 아직 결과를 모르는 중간 단계다)
            failedRef.current = false;
            setAnnounce('답안을 다시 저장했어요.');
        }
    }, [saveState.kind]);

    return (
        <>
            <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-line px-4 py-3">
                <div>
                    <h2 className="font-pixel text-[14px] font-bold text-ink-soft">
                        <label htmlFor={id}>답안</label>
                    </h2>
                    <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">AI의 답을 그대로 옮기기보다, 확인하고 다듬어서 써 주세요.</p>
                </div>
                {/* 저장 상태는 자주 바뀌므로 여기서는 읽지 않는다. 실패와 복구는 아래의 낭독 전용 영역이 알린다 */}
                <p
                    id={statusId}
                    className={`shrink-0 text-right text-[12px] leading-snug ${save.tone === 'warn' ? 'font-bold text-danger' : 'text-ink-soft'}`}
                >
                    {save.text}
                </p>
                <p className="sr-only" aria-live="polite">{announce}</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
                <textarea
                    id={id}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onPaste={(e: ClipboardEvent<HTMLTextAreaElement>) => onPaste(e.clipboardData.getData('text/plain').length)}
                    readOnly={locked}
                    maxLength={ANSWER_MAX}
                    aria-describedby={statusId}
                    placeholder="여기에 답안을 써요. 입력을 멈추면 3초 뒤에 저장돼요."
                    className="px-well block min-h-[200px] w-full flex-1 resize-none bg-white px-4 py-3 text-[15px] leading-7 text-ink placeholder:text-ink-faint read-only:bg-paper-sunk"
                    spellCheck={false}
                />
                <p className="mt-2 text-right text-[12px] tabular-nums text-ink-soft">
                    {value.length.toLocaleString()} / {ANSWER_MAX.toLocaleString()}자
                </p>
            </div>
        </>
    );
}
