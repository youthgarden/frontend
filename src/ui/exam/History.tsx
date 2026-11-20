import { useEffect, useState } from 'react';
import { errorMessage } from '../../api';
import { api } from '../../api';
import type { AttemptListItem } from '../../api';
import { Button, Dialog, Loading, Notice } from '../kit';
import { AttemptStatusChip } from './parts';
import { formatDateTime } from './util';

// 지난 결과 보기. 최신순으로 20개씩 보여 주고 "더 보기"로 이어 붙인다.

const PAGE_SIZE = 20;

export function History({ onOpen, onNew, onBack, onClose }: {
    onOpen: (attemptId: number) => void;
    onNew: () => void;
    onBack: () => void;
    onClose: () => void;
}) {
    const [items, setItems] = useState<AttemptListItem[] | null>(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tries, setTries] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        api.attempts({ page, size: PAGE_SIZE }).then(
            (res) => {
                if (cancelled) return;
                // 같은 응시가 두 번 들어오지 않게 id로 거른다 (사이에 새 응시가 생기면 페이지가 밀릴 수 있다)
                setItems((prev) => {
                    const base = page === 1 ? [] : prev ?? [];
                    const seen = new Set(base.map((a) => a.id));
                    return [...base, ...res.items.filter((a) => !seen.has(a.id))];
                });
                setTotal(res.total);
                setLoading(false);
            },
            (e) => {
                if (cancelled) return;
                setError(errorMessage(e));
                setLoading(false);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [page, tries]);

    const empty = items !== null && items.length === 0;

    return (
        <Dialog
            title="지난 결과"
            description="본 시험을 최신순으로 보여 줘요. 고르면 점수와 피드백, 그때의 대화를 다시 볼 수 있어요."
            size="lg"
            onClose={onClose}
            footer={
                <>
                    <Button onClick={onBack} className="mr-auto">뒤로</Button>
                    {empty && <Button variant="primary" onClick={onNew}>새 시험 보기</Button>}
                </>
            }
        >
            {items === null && loading && <Loading>지난 결과를 불러오는 중이에요</Loading>}
            {empty && (
                <div className="py-8 text-center">
                    <p className="font-pixel text-[16px] font-bold">아직 본 시험이 없어요</p>
                    <p className="mt-2 text-[15px] text-ink-soft">새 시험을 보고 나면 여기에서 결과를 다시 볼 수 있어요.</p>
                </div>
            )}
            {items && items.length > 0 && (
                <ul className="space-y-2.5">
                    {items.map((a) => (
                        <li key={a.id}>
                            <button
                                type="button"
                                onClick={() => onOpen(a.id)}
                                className="group flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 border-2 border-line bg-white px-4 py-3 text-left hover:border-ink hover:bg-sun-soft"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block font-pixel text-[15px] font-bold leading-snug">{a.task.title}</span>
                                    <span className="mt-1 block text-[13px] text-ink-soft">{formatDateTime(a.submitted_at)} 제출</span>
                                </span>
                                <AttemptStatusChip status={a.status} score={a.total_score} passed={a.passed} />
                                <span className="font-pixel text-[13px] font-bold text-ink-soft group-hover:text-ink" aria-hidden>보기 &gt;</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {error && (
                <Notice tone="danger" className="mt-3" action={<Button size="sm" onClick={() => setTries((n) => n + 1)}>다시 시도</Button>}>
                    지난 결과를 불러오지 못했어요. {error}
                </Notice>
            )}
            {items && items.length > 0 && items.length < total && !error && (
                <div className="mt-4 flex justify-center">
                    <Button onClick={() => setPage((p) => p + 1)} busy={loading}>더 보기 ({items.length} / {total})</Button>
                </div>
            )}
        </Dialog>
    );
}
