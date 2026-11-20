import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { AttemptStatus } from '../../api/types';
import { EXAMINER_SPEC } from '../../character';
import { Button, Chip, Dialog, PixelCharacter } from '../kit';

// 시험장 화면 여러 곳에서 쓰는 지역 부품.

/** 시험관이 말을 거는 줄. 게임 대화창처럼 캐릭터 옆에 이름표 달린 말풍선을 둔다 */
export function ExaminerSay({ children, scale = 2, className = '' }: { children: ReactNode; scale?: number; className?: string }) {
    return (
        <div className={`flex items-end gap-4 ${className}`}>
            <PixelCharacter spec={EXAMINER_SPEC} scale={scale} breathing label="AI 시험관" />
            <div className="relative mb-2 min-w-0 flex-1">
                <div className="px-box-flat relative bg-white px-4 pb-3 pt-5 text-[15px] leading-7">
                    <span className="px-box-flat absolute -top-3 left-3 bg-uniform px-2 py-0.5 font-pixel text-[12px] font-bold leading-none text-white">
                        AI 시험관
                    </span>
                    {children}
                </div>
            </div>
        </div>
    );
}

/** 확인 단계. 최종 버튼의 문구는 누르면 일어나는 일을 말한다 */
export function ConfirmDialog({
    title, children, confirmLabel, confirmVariant = 'primary', cancelLabel = '돌아가기', onConfirm, onCancel, busy = false,
    dismissible = true, focusCancel = false,
}: {
    title: ReactNode;
    children: ReactNode;
    confirmLabel: string;
    confirmVariant?: 'primary' | 'danger';
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
    dismissible?: boolean;
    /** 되돌릴 수 없는 행동의 확인 창은 초점을 취소 쪽에 둔다 (Enter 한 번에 지워지지 않게) */
    focusCancel?: boolean;
}) {
    return (
        <Dialog
            title={title}
            size="sm"
            onClose={onCancel}
            dismissible={dismissible && !busy}
            footer={
                <>
                    <Button onClick={onCancel} disabled={busy} autoFocus={focusCancel}>{cancelLabel}</Button>
                    <Button variant={confirmVariant} busy={busy} onClick={onConfirm} autoFocus={!focusCancel}>{confirmLabel}</Button>
                </>
            }
        >
            <div className="space-y-3 text-[15px] leading-7">{children}</div>
        </Dialog>
    );
}

/** 응시 상태 꼬리표. 색과 함께 글자로 상태를 말한다 */
export function AttemptStatusChip({ status, score, passed }: { status: AttemptStatus; score: number | null; passed: boolean | null }) {
    if (status === 'GRADING') return <Chip tone="uniform">채점 중</Chip>;
    if (status === 'GRADING_FAILED') return <Chip tone="danger">채점 실패</Chip>;
    if (status === 'IN_PROGRESS') return <Chip tone="neutral">푸는 중</Chip>;
    return passed ? <Chip tone="ok">통과 {score}점</Chip> : <Chip tone="sun">미달 {score}점</Chip>;
}

/**
 * 탭 줄. 왼쪽·오른쪽 화살표로 옮겨 다닌다 (WAI-ARIA 탭 패턴).
 * 패널 쪽은 id={`${idBase}-panel-${key}`}, aria-labelledby={`${idBase}-tab-${key}`}를 단다.
 */
export function TabBar<K extends string>({ tabs, active, onChange, idBase, label, className = '' }: {
    tabs: { key: K; label: ReactNode; badge?: ReactNode }[];
    active: K;
    onChange: (key: K) => void;
    idBase: string;
    label: string;
    className?: string;
}) {
    const refs = useRef<Record<string, HTMLButtonElement | null>>({});
    const onKey = (e: KeyboardEvent) => {
        const i = tabs.findIndex((t) => t.key === active);
        let next = -1;
        if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        e.preventDefault();
        onChange(tabs[next].key);
        refs.current[tabs[next].key]?.focus();
    };
    return (
        <div role="tablist" aria-label={label} onKeyDown={onKey} className={`flex flex-wrap gap-1.5 ${className}`}>
            {tabs.map((t) => {
                const on = t.key === active;
                return (
                    <button
                        key={t.key}
                        ref={(el) => {
                            refs.current[t.key] = el;
                        }}
                        type="button"
                        role="tab"
                        id={`${idBase}-tab-${t.key}`}
                        aria-selected={on}
                        aria-controls={`${idBase}-panel-${t.key}`}
                        tabIndex={on ? 0 : -1}
                        onClick={() => onChange(t.key)}
                        className={[
                            'inline-flex min-h-9 items-center gap-1.5 border-2 px-3 font-pixel text-[13px] font-bold leading-none',
                            on ? 'border-ink bg-sun text-ink' : 'border-line bg-paper text-ink-soft hover:bg-paper-sunk hover:text-ink',
                        ].join(' ')}
                    >
                        {t.label}
                        {t.badge}
                    </button>
                );
            })}
        </div>
    );
}
