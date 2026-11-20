import { useEffect, useRef, useState } from 'react';
import { errorMessage, useAttemptMessages, useAttemptResult, useRegradeAttempt } from '../../api';
import type { AttemptResult, ScoreItem } from '../../api';
import { levelInfo } from '../../character';
import { Button, Chip, Dialog, LevelBadge, Loading, Notice, ProgressBar } from '../kit';
import { ChatBubble } from './ChatPane';
import { ExaminerSay, TabBar } from './parts';
import { CRITERION_LOOKS_AT, DEFAULT_PASS_SCORE, formatDateTime, isCode, type TaskRef } from './util';

// 제출한 응시의 채점 대기 → 결과. 지난 결과 보기에서도 같은 컴포넌트를 쓴다.

export interface PendingLevelUp {
    attemptId: number;
    level: number;
}

export function AttemptOutcome({ attemptId, pendingLevelUp, onFirstLevelUp, onBack, onClose, onOpenLecture, onRetry }: {
    attemptId: number;
    /** 이 흐름에서 이미 알아챈, 아직 맵에서 연출하지 않은 레벨업 */
    pendingLevelUp: PendingLevelUp | null;
    /** 처음 본 결과에서 레벨이 올랐다. 창이 닫힐 때 맵에서 연출하도록 위에서 기억한다 */
    onFirstLevelUp: (p: PendingLevelUp) => void;
    /** 지난 결과 목록에서 왔으면 목록으로 돌아간다 */
    onBack?: () => void;
    onClose: () => void;
    onOpenLecture: (lectureId: number) => void;
    onRetry: (task: TaskRef) => void;
}) {
    // 채점 중이면 2초마다 다시 묻고, 끝나면 멈춘다. 화면이 사라지면 멈춘다.
    // first_view는 처음 조회한 응답에만 true로 온다. 저장소의 값은 나중 응답으로 덮이므로 받는 순간 위에 알려 기억하게 한다
    const query = useAttemptResult(attemptId, (r) => {
        if (r.status === 'GRADED' && r.level_up?.leveled_up) onFirstLevelUp({ attemptId: r.id, level: r.level_up.level });
    });
    const data = query.data ?? null;
    // 이 창을 연 뒤의 실패만 보여 준다 (저장소에 지난번 실패가 남아 있을 수 있다)
    const failed = query.isFetchedAfterMount ? query.error : null;
    const error = failed
        ? isCode(failed, 'ATTEMPT_NOT_FOUND')
            ? { message: '이 시험 기록을 찾지 못했어요.', fatal: true }
            : { message: errorMessage(failed), fatal: false }
        : null;
    const regradeAttempt = useRegradeAttempt();
    const [regrading, setRegrading] = useState(false);
    const [regradeError, setRegradeError] = useState<string | null>(null);

    const regrade = async () => {
        if (regrading) return;
        setRegrading(true);
        setRegradeError(null);
        try {
            // 성공하면 보고 있는 결과가 "채점 중"으로 바뀌고 다시 묻기 시작한다
            await regradeAttempt.mutateAsync(attemptId);
        } catch (e) {
            // 이미 다시 채점에 들어갔다: 새로 물어 지금 상태를 보여 준다 (낡음 표시가 다시 부른다)
            if (!isCode(e, 'ATTEMPT_NOT_REGRADABLE')) setRegradeError(`다시 채점하지 못했어요. ${errorMessage(e)}`);
        } finally {
            setRegrading(false);
        }
    };

    const backButton = onBack && <Button variant="quiet" onClick={onBack} className="mr-auto">목록으로</Button>;

    if (!data) {
        return (
            <Dialog title="시험 결과" size="md" onClose={onClose} footer={backButton}>
                {error ? (
                    <Notice tone="danger" action={!error.fatal && <Button size="sm" onClick={() => void query.refetch()}>다시 시도</Button>}>
                        결과를 불러오지 못했어요. {error.message}
                    </Notice>
                ) : (
                    <Loading>결과를 불러오는 중이에요</Loading>
                )}
            </Dialog>
        );
    }

    if (data.status === 'GRADING' || data.status === 'IN_PROGRESS') {
        return (
            <Dialog
                title="채점하고 있어요"
                description={data.task.title}
                size="md"
                onClose={onClose}
                footer={
                    <>
                        {backButton}
                        <Button onClick={onClose}>맵으로 돌아가기</Button>
                    </>
                }
            >
                <div className="space-y-5">
                    <ExaminerSay scale={3}>
                        제출한 답안과 AI와 나눈 대화를 꼼꼼히 읽고 있어요.
                        <span className="mt-1 flex items-center gap-2 font-pixel text-[14px] text-ink-soft" role="status">
                            <span className="inline-block h-2.5 w-2.5 animate-[px-blink_0.8s_steps(2)_infinite] bg-ink-soft" aria-hidden />
                            채점 중
                        </span>
                    </ExaminerSay>
                    <p className="text-[15px] leading-7">채점은 보통 몇 초에서 수십 초 걸려요. 결과가 나오면 이 창에 바로 보여 드려요.</p>
                    <Notice tone="info">창을 닫아도 채점은 계속돼요. 다음에 시험관에게 말을 걸면 결과를 볼 수 있어요.</Notice>
                    {error && <Notice tone="warn">연결이 잠깐 끊겼어요. 계속 확인하고 있어요.</Notice>}
                </div>
            </Dialog>
        );
    }

    if (data.status === 'GRADING_FAILED') {
        return (
            <Dialog
                title="채점하지 못했어요"
                description={data.task.title}
                size="md"
                onClose={onClose}
                footer={
                    <>
                        {backButton}
                        <Button onClick={onClose}>맵으로 돌아가기</Button>
                        <Button variant="primary" onClick={regrade} busy={regrading} autoFocus>다시 채점하기</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <ExaminerSay>
                        {/* 채점 중 → 실패로 바뀌는 순간을 화면 낭독기가 바로 알리게 한다 */}
                        <span role="alert">미안해요, 이번에는 채점을 끝내지 못했어요. 제출한 답안과 대화는 그대로 남아 있어요.</span>
                    </ExaminerSay>
                    <p className="text-[15px] leading-7">
                        <strong>다시 채점하기</strong>를 누르면 같은 답안으로 다시 채점해요. 다시 풀 필요는 없어요.
                    </p>
                    {regradeError && <Notice tone="danger">{regradeError}</Notice>}
                </div>
            </Dialog>
        );
    }

    return (
        <ResultView
            data={data}
            levelUpNow={pendingLevelUp?.attemptId === data.id ? pendingLevelUp.level : null}
            onBack={onBack}
            onClose={onClose}
            onOpenLecture={onOpenLecture}
            onRetry={onRetry}
        />
    );
}

function ResultView({ data, levelUpNow, onBack, onClose, onOpenLecture, onRetry }: {
    data: AttemptResult;
    levelUpNow: number | null;
    onBack?: () => void;
    onClose: () => void;
    onOpenLecture: (lectureId: number) => void;
    onRetry: (task: TaskRef) => void;
}) {
    const passScore = data.pass_score ?? DEFAULT_PASS_SCORE;
    const total = data.total_score ?? 0;
    const passed = !!data.passed;
    const lecture = data.recommended_lecture;
    const lowest = data.scores.length ? Math.min(...data.scores.map((s) => s.score / s.max_score)) : 1;

    const [review, setReview] = useState<'chat' | 'answer' | null>(null);
    const [highlight, setHighlight] = useState<number | null>(null);
    const messageQuery = useAttemptMessages(data.id);
    const messages = messageQuery.data ?? null;
    const msgError = !messages && messageQuery.error && !messageQuery.isFetching ? errorMessage(messageQuery.error) : null;

    // 근거가 된 대화로 이동한다
    useEffect(() => {
        if (highlight === null || review !== 'chat' || !messages) return;
        const el = document.getElementById(`evidence-${data.id}-${highlight}`);
        if (!el) return;
        el.scrollIntoView({ block: 'center' });
        el.focus({ preventScroll: true });
    }, [highlight, review, messages, data.id]);

    const showEvidence = (id: number) => {
        setReview('chat');
        setHighlight(id);
    };

    // 펼치기·접기 버튼이 탭 줄로 바뀌며 사라지므로, 다시 그린 뒤 초점을 옮길 곳을 기억해 둔다
    const focusAfter = useRef<'tab' | 'toggle' | null>(null);
    useEffect(() => {
        const target = focusAfter.current;
        focusAfter.current = null;
        if (target === 'tab' && review !== null) document.getElementById(`review-${data.id}-tab-${review}`)?.focus();
        if (target === 'toggle' && review === null) document.getElementById(`review-${data.id}-open`)?.focus();
    }, [review, data.id]);
    const openReview = (key: 'chat' | 'answer') => {
        focusAfter.current = 'tab';
        setReview(key);
    };

    const primaryOnLecture = !passed && !!lecture;

    return (
        <Dialog
            title="시험 결과"
            description={`${data.task.title}${data.submitted_at ? ` · ${formatDateTime(data.submitted_at)} 제출` : ''}`}
            size="xl"
            onClose={onClose}
            footer={
                <>
                    {onBack && <Button variant="quiet" onClick={onBack} className="mr-auto">목록으로</Button>}
                    <Button variant={primaryOnLecture ? 'secondary' : 'primary'} onClick={onClose}>
                        맵으로 돌아가기
                    </Button>
                </>
            }
        >
            <div className="space-y-7">
                {/* 총점과 통과 여부 */}
                <section aria-label="총점" className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <div className="px-box-flat bg-white px-5 py-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <p className="font-pixel leading-none">
                                <span className="text-[52px] font-bold tabular-nums">{total}</span>
                                <span className="ml-1 text-[18px] text-ink-soft">/ 100점</span>
                            </p>
                            {passed
                                ? <Chip tone="ok" className="text-[15px]">통과</Chip>
                                : <Chip tone="sun" className="text-[15px]">미달</Chip>}
                        </div>
                        <div className="relative mt-4 pb-6">
                            <ProgressBar
                                value={total / 100}
                                mark={passScore / 100}
                                tone={passed ? 'ok' : 'sun'}
                                label={`총점 ${total}점, 통과 기준 ${passScore}점`}
                                className="h-4"
                            />
                            <span
                                className="absolute top-6 -translate-x-1/2 whitespace-nowrap font-pixel text-[12px] text-ink-soft"
                                style={{ left: `${passScore}%` }}
                                aria-hidden
                            >
                                통과 {passScore}점
                            </span>
                        </div>
                        <p className="text-[14px] leading-6 text-ink-soft">
                            {passed
                                ? `통과 기준 ${passScore}점을 넘었어요.`
                                : `통과까지 ${Math.max(passScore - total, 0)}점 남았어요. 아래에서 어떤 항목을 보완하면 좋을지 확인해 보세요.`}
                        </p>
                    </div>
                    {data.summary_feedback && (
                        <ExaminerSay>
                            <span className="block whitespace-pre-line">{data.summary_feedback}</span>
                        </ExaminerSay>
                    )}
                </section>

                <LevelNote data={data} levelUpNow={levelUpNow} />

                {/* 항목별 점수 */}
                <section aria-labelledby={`scores-${data.id}`}>
                    <h3 id={`scores-${data.id}`} className="mb-3 font-pixel text-[15px] font-bold">항목별 점수</h3>
                    <ul className="grid gap-4 md:grid-cols-2">
                        {data.scores.map((s) => (
                            <ScoreCard
                                key={s.criterion}
                                item={s}
                                weakest={!passed && s.score / s.max_score === lowest}
                                onEvidence={s.evidence_message_id !== null ? () => showEvidence(s.evidence_message_id!) : undefined}
                            />
                        ))}
                    </ul>
                </section>

                {/* 미달이면 다음에 할 수 있는 일 */}
                {!passed && (
                    <section aria-labelledby={`next-${data.id}`} className="border-l-[6px] border-uniform bg-uniform-soft px-5 py-4">
                        <h3 id={`next-${data.id}`} className="font-pixel text-[15px] font-bold">다음에 해 볼 수 있는 일</h3>
                        <ol className="mt-3 space-y-3">
                            {lecture && (
                                <li className="flex flex-wrap items-center justify-between gap-3">
                                    <span className="text-[15px] leading-7">
                                        이 강의를 다시 보고 도전해 보세요.
                                        <strong className="block font-bold">{lecture.title}</strong>
                                    </span>
                                    <Button variant="primary" onClick={() => onOpenLecture(lecture.id)}>강의 다시 보기</Button>
                                </li>
                            )}
                            <li className="flex flex-wrap items-center justify-between gap-3">
                                <span className="text-[15px] leading-7">같은 과제에 다시 도전할 수 있어요. 통과하면 레벨이 올라요.</span>
                                <Button onClick={() => onRetry({ id: data.task.id, title: data.task.title, requiredLecture: lecture })}>
                                    다시 도전하기
                                </Button>
                            </li>
                        </ol>
                    </section>
                )}

                {/* 대화 기록과 제출한 답안 (기본은 접어 둔다) */}
                <section aria-labelledby={`review-${data.id}`}>
                    <div className="flex flex-wrap items-center gap-3">
                        <h3 id={`review-${data.id}`} className="font-pixel text-[15px] font-bold">다시 보기</h3>
                        {review === null ? (
                            <>
                                <Button size="sm" id={`review-${data.id}-open`} onClick={() => openReview('chat')}>
                                    대화 기록 보기{messages ? ` (${messages.length})` : ''}
                                </Button>
                                <Button size="sm" onClick={() => openReview('answer')}>제출한 답안 보기</Button>
                            </>
                        ) : (
                            <>
                                <TabBar
                                    idBase={`review-${data.id}`}
                                    label="다시 볼 내용"
                                    active={review}
                                    onChange={setReview}
                                    tabs={[
                                        { key: 'chat', label: `대화 기록${messages ? ` (${messages.length})` : ''}` },
                                        { key: 'answer', label: '제출한 답안' },
                                    ]}
                                />
                                <Button size="sm" variant="quiet" onClick={() => { focusAfter.current = 'toggle'; setReview(null); setHighlight(null); }}>접기</Button>
                            </>
                        )}
                    </div>
                    {review !== null && (
                        <div
                            role="tabpanel"
                            id={`review-${data.id}-panel-${review}`}
                            aria-labelledby={`review-${data.id}-tab-${review}`}
                            className="mt-4 border-2 border-line bg-paper-sunk px-4 py-4"
                        >
                            {review === 'answer' ? (
                                data.answer?.trim()
                                    ? <p className="max-w-[72ch] whitespace-pre-wrap break-words text-[15px] leading-7">{data.answer}</p>
                                    : <p className="text-ink-soft">제출한 답안이 비어 있어요.</p>
                            ) : msgError ? (
                                <Notice tone="danger" action={<Button size="sm" onClick={() => void messageQuery.refetch()}>다시 시도</Button>}>
                                    대화 기록을 불러오지 못했어요. {msgError}
                                </Notice>
                            ) : !messages ? (
                                <Loading>대화 기록을 불러오는 중이에요</Loading>
                            ) : messages.length === 0 ? (
                                <p className="text-ink-soft">이 시험에서는 AI와 나눈 대화가 없어요.</p>
                            ) : (
                                <div className="mx-auto max-w-[760px] space-y-4">
                                    {messages.map((m) => (
                                        <ChatBubble key={m.id} message={m} highlight={m.id === highlight} id={`evidence-${data.id}-${m.id}`} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </section>
            </div>
        </Dialog>
    );
}

function ScoreCard({ item, weakest, onEvidence }: { item: ScoreItem; weakest: boolean; onEvidence?: () => void }) {
    const ratio = item.max_score ? item.score / item.max_score : 0;
    return (
        <li className={`flex flex-col border-2 bg-white px-4 py-3.5 ${weakest ? 'border-sun-deep' : 'border-line'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-pixel text-[15px] font-bold">
                    {item.name}
                    {weakest && <Chip tone="sun">가장 보완할 항목</Chip>}
                </p>
                <p className="font-pixel text-[15px] font-bold tabular-nums">
                    {item.score}
                    <span className="font-normal text-ink-soft"> / {item.max_score}점</span>
                </p>
            </div>
            <ProgressBar value={ratio} tone={ratio >= 0.8 ? 'ok' : 'sun'} label={`${item.name} ${item.score}점, ${item.max_score}점 만점`} className="mt-2.5" />
            <p className="mt-3 text-[15px] leading-7">{item.feedback}</p>
            <p className="mt-1.5 text-[13px] leading-5 text-ink-soft">{CRITERION_LOOKS_AT[item.criterion]}</p>
            {onEvidence && (
                <div className="mt-3">
                    {/* 항목마다 같은 문구라서 낭독용 이름에 항목 이름을 붙여 구별한다. 보이는 문구로 시작해 음성 조작으로도 부를 수 있게 한다 */}
                    <Button size="sm" variant="quiet" onClick={onEvidence} className="-ml-3" aria-label={`근거가 된 대화 보기: ${item.name}`}>
                        근거가 된 대화 보기 &gt;
                    </Button>
                </div>
            )}
        </li>
    );
}

function LevelNote({ data, levelUpNow }: { data: AttemptResult; levelUpNow: number | null }) {
    if (levelUpNow !== null) {
        const info = levelInfo(levelUpNow);
        return (
            <Notice tone="ok">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <LevelBadge level={levelUpNow} />
                    <span>
                        <strong>{info.hatName}로 올랐어요.</strong> 맵으로 돌아가면 모자가 바뀌어요.
                    </span>
                </span>
            </Notice>
        );
    }
    if (!data.passed) return null;
    if (data.level_up?.leveled_up) {
        return <Notice tone="ok">이 시험을 통과해서 레벨이 한 단계 올랐어요.</Notice>;
    }
    return (
        <Notice tone="info">
            통과했지만, 이미 통과한 적이 있는 과제라서 이번에는 레벨이 오르지 않았어요. 레벨은 서로 다른 과제를 통과할 때 올라요.
        </Notice>
    );
}
