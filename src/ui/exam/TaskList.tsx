import { useQuery } from '@tanstack/react-query';
import { errorMessage, FRESH_ON_OPEN, queries, type TaskSummary } from '../../api';
import { useSession } from '../../session/SessionProvider';
import { Button, Chip, Dialog, LevelBadge, Loading, Notice } from '../kit';
import type { TaskRef } from './util';

// 과제 목록. 과제마다 제목, 제한 시간, 상태를 보여 주고, 강의를 안 들은 과제는 고를 수 없다.

function statusChip(t: TaskSummary) {
    if (!t.available) return <Chip tone="neutral">강의를 먼저 들어야 해요</Chip>;
    if (t.passed) return <Chip tone="ok">통과 · 최고 {t.best_score}점</Chip>;
    if (t.best_score !== null) return <Chip tone="sun">미달 · 최고 {t.best_score}점</Chip>;
    return <Chip tone="neutral">응시 전</Chip>;
}

export function TaskList({ onPick, onOpenLecture, onBack, onClose }: {
    onPick: (task: TaskRef) => void;
    onOpenLecture: (lectureId: number) => void;
    onBack: () => void;
    onClose: () => void;
}) {
    const { me } = useSession();
    // 방금 강의를 듣고 왔을 수 있다. 창을 열 때마다 최신 응시 가능 여부를 받는다
    const query = useQuery({ ...queries.tasks(), ...FRESH_ON_OPEN });
    const tasks = query.data ?? null;
    const error = !tasks && query.error ? errorMessage(query.error) : null;

    return (
        <Dialog
            title="과제 목록"
            description="과제를 고르면 시험관이 내용을 설명해 줘요. 설명을 듣는다고 바로 시작되지는 않아요."
            size="lg"
            onClose={onClose}
            footer={<Button onClick={onBack} className="mr-auto">뒤로</Button>}
        >
            <div className="space-y-5">
                <Notice tone="info">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>서로 다른 과제를 하나 통과할 때마다 레벨이 한 단계 올라요. 100점 중 80점 이상이면 통과예요.</span>
                        {me && (
                            <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-soft">
                                지금 <LevelBadge level={me.level} showName />
                            </span>
                        )}
                    </span>
                </Notice>

                {error && (
                    <Notice tone="danger" action={<Button size="sm" busy={query.isFetching} onClick={() => void query.refetch()}>다시 시도</Button>}>
                        과제 목록을 불러오지 못했어요. {error}
                    </Notice>
                )}
                {!error && tasks === null && <Loading>과제 목록을 불러오는 중이에요</Loading>}
                {tasks && tasks.length === 0 && <p className="py-6 text-center text-ink-soft">아직 준비된 과제가 없어요.</p>}

                {tasks && tasks.length > 0 && (
                    <ol className="space-y-3">
                        {tasks.map((t, i) => (
                            <li key={t.id}>
                                {t.available ? (
                                    <button
                                        type="button"
                                        onClick={() => onPick({ id: t.id, title: t.title, requiredLecture: t.required_lecture })}
                                        className="group flex w-full items-start gap-4 border-2 border-line bg-white px-4 py-3 text-left hover:border-ink hover:bg-sun-soft"
                                    >
                                        <TaskNumber n={i + 1} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-pixel text-[16px] font-bold leading-snug">{t.title}</span>
                                            <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-ink-soft">
                                                <span>제한 시간 {t.time_limit_min}분</span>
                                                {statusChip(t)}
                                            </span>
                                            {t.passed && (
                                                <span className="mt-1.5 block text-[13px] leading-snug text-ink-soft">
                                                    이미 통과한 과제예요. 다시 볼 수 있지만, 다시 통과해도 레벨은 오르지 않아요.
                                                </span>
                                            )}
                                            {!t.passed && t.best_score !== null && (
                                                <span className="mt-1.5 block text-[13px] leading-snug text-ink-soft">
                                                    다시 도전할 수 있어요. 통과하면 레벨이 올라요.
                                                </span>
                                            )}
                                        </span>
                                        <span className="shrink-0 self-center font-pixel text-[13px] font-bold text-ink-soft group-hover:text-ink" aria-hidden>
                                            과제 보기 &gt;
                                        </span>
                                    </button>
                                ) : (
                                    <div className="flex items-start gap-4 border-2 border-dashed border-line bg-paper-sunk px-4 py-3">
                                        <TaskNumber n={i + 1} muted />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-pixel text-[16px] font-bold leading-snug text-ink-soft">{t.title}</p>
                                            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[14px] text-ink-soft">
                                                <span>제한 시간 {t.time_limit_min}분</span>
                                                {statusChip(t)}
                                            </p>
                                            <p className="mt-2 text-[14px] leading-6">
                                                이 과제는 아래 강의를 먼저 들어야 볼 수 있어요.
                                                <br />
                                                <strong className="font-bold">{t.required_lecture.title}</strong>
                                            </p>
                                        </div>
                                        <Button size="sm" className="shrink-0 self-center" onClick={() => onOpenLecture(t.required_lecture.id)}>
                                            강의 들으러 가기
                                        </Button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>
                )}
            </div>
        </Dialog>
    );
}

function TaskNumber({ n, muted = false }: { n: number; muted?: boolean }) {
    return (
        <span
            aria-hidden
            className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center border-2 font-pixel text-[15px] font-bold ${muted ? 'border-line text-ink-faint' : 'border-ink bg-sun'}`}
        >
            {n}
        </span>
    );
}
