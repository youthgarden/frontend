import { useEffect, useRef, useState, type ReactNode } from 'react';
import { errorMessage, useAttemptMessages, useAttemptResult, useRegradeAttempt } from '../../api';
import type { AttemptResult, ScoreItem } from '../../api';
import { levelInfo } from '../../character';
import { Button, Chip, Dialog, LevelBadge, Loading, Notice, ProgressBar } from '../kit';
import { ChatBubble } from './ChatPane';
import { ExaminerSay, TabBar } from './parts';
import { describeReason, josa, verdictOf, type Verdict } from './passing';
import { CRITERION_LOOKS_AT, formatDateTime, isCode, type TaskRef } from './util';

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
    const verdict = verdictOf(data);
    const scores = data.scores ?? [];
    const passed = !!data.passed;
    const lecture = data.recommended_lecture;
    const lowest = scores.length ? Math.min(...scores.map((s) => s.score / s.max_score)) : 1;
    const dual = verdict.kind === 'dual' ? verdict : null;
    /** 두 영역 기준이면 항목 카드에 소속 영역의 이름을 붙인다 (이름은 응답의 dimensions에서) */
    const dimensionName = (s: ScoreItem) => data.dimensions?.find((d) => d.code === s.dimension)?.name ?? null;

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
                {/* 통과 여부를 먼저, 통과하지 못했으면 그 이유를 총점보다 앞에 */}
                {dual && <DualVerdict id={data.id} verdict={dual} summary={data.summary_feedback} />}
                {verdict.kind === 'legacy' && <LegacyVerdict verdict={verdict} scores={scores} summary={data.summary_feedback} />}

                <LevelNote data={data} levelUpNow={levelUpNow} />

                {dual && <DimensionResults id={data.id} verdict={dual} maxTotal={scores.reduce((s, x) => s + x.max_score, 0)} />}

                {/* 항목별 점수 */}
                <section aria-labelledby={`scores-${data.id}`}>
                    <h3 id={`scores-${data.id}`} className="mb-3 font-pixel text-[15px] font-bold">항목별 점수</h3>
                    <ul className="grid gap-4 md:grid-cols-2">
                        {scores.map((s) => (
                            <ScoreCard
                                key={s.criterion}
                                item={s}
                                dimensionName={dimensionName(s)}
                                minScore={dual?.verify && s.criterion === 'VERIFY' ? dual.verify.min : null}
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

/** 두 영역 기준: 통과 여부, 총평, 그리고 통과하지 못했으면 그 이유 */
function DualVerdict({ id, verdict, summary }: { id: number; verdict: Extract<Verdict, { kind: 'dual' }>; summary: string | null }) {
    const { passed, reasons } = verdict;
    const names = verdict.dimensions.map((d) => d.name).reduce((s, n, i) => (i === 0 ? n : `${s}${josa(s, '과', '와')} ${n}`), '');
    return (
        <>
            <section aria-labelledby={`verdict-${id}`} className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="px-box-flat bg-white px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                        {passed
                            ? <Chip tone="ok" className="text-[15px]">통과</Chip>
                            : <Chip tone="sun" className="text-[15px]">미달</Chip>}
                        <h3 id={`verdict-${id}`} className="font-pixel text-[22px] font-bold leading-tight">
                            {passed ? '통과했어요' : '아직 통과하지 못했어요'}
                        </h3>
                    </div>
                    <p className="mt-3 text-[15px] leading-7">
                        {passed
                            ? `${names}, 두 영역의 기준을 모두 넘었어요.`
                            : `통과하려면 ${names}, 두 영역을 모두 충족해야 해요. 아래 ${reasons.length}가지가 부족했어요.`}
                    </p>
                </div>
                {summary && (
                    <ExaminerSay>
                        <span className="block whitespace-pre-line">{summary}</span>
                    </ExaminerSay>
                )}
            </section>

            {!passed && reasons.length > 0 && (
                <section aria-labelledby={`why-${id}`} className="border-l-[6px] border-sun-deep bg-sun-soft px-5 py-4">
                    <h3 id={`why-${id}`} className="font-pixel text-[16px] font-bold">통과하지 못한 이유</h3>
                    <p className="mt-1 text-[14px] leading-6">
                        총점은 {verdict.total}점이에요. 통과는 총점이 아니라 두 영역의 기준으로 정해요.
                        {verdict.scoresMet && ' 두 영역의 점수는 모두 최소 점수를 넘었지만, 아래 이유로 통과하지 못했어요.'}
                    </p>
                    <ol className="mt-3 space-y-3">
                        {reasons.map((r, i) => {
                            const t = describeReason(r);
                            const basis = r.code === 'REQUIRED_CHECK' ? r.check.feedback : null;
                            return (
                                <li key={`${r.code}-${i}`} className="flex gap-3 border-2 border-sun-deep bg-white px-4 py-3">
                                    <span aria-hidden className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center border-2 border-ink bg-sun font-pixel text-[14px] font-bold">
                                        {i + 1}
                                    </span>
                                    <div className="min-w-0 space-y-1">
                                        <p className="text-[15px] font-bold leading-7">{t.title}</p>
                                        <p className="text-[15px] leading-7">{t.detail}</p>
                                        {basis && (
                                            <p className="text-[14px] leading-6"><strong className="font-bold">판정 근거: </strong>{basis}</p>
                                        )}
                                        <p className="text-[14px] leading-6 text-ink-soft"><strong className="font-bold text-ink">다음에는: </strong>{t.next}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>
                </section>
            )}
        </>
    );
}

/** 두 영역 기준: 영역별 점수·최소 점수·충족 여부, 필수 요건과 검증 최소 점수의 충족 여부 */
function DimensionResults({ id, verdict, maxTotal }: { id: number; verdict: Extract<Verdict, { kind: 'dual' }>; maxTotal: number }) {
    return (
        <section aria-labelledby={`dims-${id}`}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 id={`dims-${id}`} className="font-pixel text-[15px] font-bold">영역별 결과</h3>
                <p className="font-pixel text-[14px] text-ink-soft">
                    총점 <strong className="text-[18px] tabular-nums text-ink">{verdict.total}</strong> / {maxTotal}점
                </p>
            </div>
            <p className="mb-3 text-[14px] leading-6 text-ink-soft">두 영역이 모두 충족이면 통과예요.</p>
            <ul className="grid gap-4 md:grid-cols-2">
                {verdict.dimensions.map((d) => {
                    const scoreOk = d.score >= d.min_score;
                    return (
                        <li key={d.code} className={`flex flex-col border-2 bg-white px-4 py-3.5 ${d.passed ? 'border-line' : 'border-sun-deep'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h4 className="font-pixel text-[15px] font-bold">{d.name}</h4>
                                {d.passed ? <Chip tone="ok">충족</Chip> : <Chip tone="sun">미충족</Chip>}
                            </div>
                            <p className="mt-1 font-pixel leading-none">
                                <span className="text-[30px] font-bold tabular-nums">{d.score}</span>
                                <span className="text-[15px] text-ink-soft"> / {d.max_score}점</span>
                            </p>
                            <div className="relative mt-3 pb-6">
                                <ProgressBar
                                    value={d.max_score ? d.score / d.max_score : 0}
                                    mark={d.max_score ? d.min_score / d.max_score : undefined}
                                    tone={d.passed ? 'ok' : 'sun'}
                                    label={`${d.name} ${d.score}점, 최소 ${d.min_score}점, ${d.max_score}점 만점, ${d.passed ? '충족' : '미충족'}`}
                                />
                                <span
                                    className="absolute top-5 -translate-x-1/2 whitespace-nowrap font-pixel text-[12px] text-ink-soft"
                                    style={{ left: `${d.max_score ? (d.min_score / d.max_score) * 100 : 0}%` }}
                                    aria-hidden
                                >
                                    최소 {d.min_score}점
                                </span>
                            </div>
                            <ul className="space-y-2 border-t-2 border-line pt-3 text-[14px] leading-6">
                                <Condition ok={scoreOk} okLabel="충족" failLabel="미달">
                                    영역 점수 {d.score}점 (최소 {d.min_score}점)
                                </Condition>
                                {d.code === 'AI_USE' && verdict.verify && (
                                    <Condition ok={verdict.verify.met} okLabel="충족" failLabel="미달">
                                        그중 {verdict.verify.name} {verdict.verify.score}점 (최소 {verdict.verify.min}점)
                                    </Condition>
                                )}
                                {d.code === 'TASK_SOLUTION' && verdict.checks.map((c) => (
                                    <Condition key={c.check_id} ok={c.met} okLabel="지켰어요" failLabel="못 지켰어요">
                                        <span className="block font-bold">꼭 지켜야 할 것: {c.label}</span>
                                        {c.feedback && <span className="block text-ink-soft">{c.feedback}</span>}
                                    </Condition>
                                ))}
                            </ul>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}

/** 영역 카드 안의 조건 한 줄. 상태를 색과 함께 글자(꼬리표)로 말한다 */
function Condition({ ok, okLabel, failLabel, children }: { ok: boolean; okLabel: string; failLabel: string; children: ReactNode }) {
    return (
        <li className="flex items-start gap-2.5">
            <span className="shrink-0 pt-0.5">{ok ? <Chip tone="ok">{okLabel}</Chip> : <Chip tone="sun">{failLabel}</Chip>}</span>
            <span className="min-w-0">{children}</span>
        </li>
    );
}

/** 예전 기준(LEGACY_TOTAL_V1): 총점과 통과 기준선 */
function LegacyVerdict({ verdict, scores, summary }: { verdict: Extract<Verdict, { kind: 'legacy' }>; scores: ScoreItem[]; summary: string | null }) {
    const { passed, total, minTotal, shortBy } = verdict;
    const maxTotal = scores.reduce((s, x) => s + x.max_score, 0) || 100;
    const maxes = new Set(scores.map((s) => s.max_score));
    const each = maxes.size === 1 ? ` (각 ${[...maxes][0]}점)` : '';
    return (
        <>
            <section aria-label="총점" className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="px-box-flat bg-white px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <p className="font-pixel leading-none">
                            <span className="text-[52px] font-bold tabular-nums">{total}</span>
                            <span className="ml-1 text-[18px] text-ink-soft">/ {maxTotal}점</span>
                        </p>
                        {passed
                            ? <Chip tone="ok" className="text-[15px]">통과</Chip>
                            : <Chip tone="sun" className="text-[15px]">미달</Chip>}
                    </div>
                    <div className="relative mt-4 pb-6">
                        <ProgressBar
                            value={total / maxTotal}
                            mark={minTotal / maxTotal}
                            tone={passed ? 'ok' : 'sun'}
                            label={`총점 ${total}점, 통과 기준 ${minTotal}점, ${passed ? '통과' : '미달'}`}
                            className="h-4"
                        />
                        <span
                            className="absolute top-6 -translate-x-1/2 whitespace-nowrap font-pixel text-[12px] text-ink-soft"
                            style={{ left: `${(minTotal / maxTotal) * 100}%` }}
                            aria-hidden
                        >
                            통과 {minTotal}점
                        </span>
                    </div>
                    <p className="text-[14px] leading-6 text-ink-soft">
                        {passed
                            ? `통과 기준 ${minTotal}점을 넘었어요.`
                            : `통과까지 ${shortBy}점 남았어요. 아래에서 어떤 항목을 보완하면 좋을지 확인해 보세요.`}
                    </p>
                </div>
                {summary && (
                    <ExaminerSay>
                        <span className="block whitespace-pre-line">{summary}</span>
                    </ExaminerSay>
                )}
            </section>
            <Notice tone="info">
                채점 기준이 바뀌기 전에 본 시험이라, 그때의 기준으로 채점했어요. 네 항목{each}을 더해 {minTotal}점 이상이면 통과예요.
            </Notice>
        </>
    );
}

function ScoreCard({ item, dimensionName, minScore, weakest, onEvidence }: {
    item: ScoreItem;
    /** 두 영역 기준이면 소속 영역의 이름 */
    dimensionName: string | null;
    /** 이 항목에 따로 최소 점수가 있으면 (답변 검증) */
    minScore: number | null;
    weakest: boolean;
    onEvidence?: () => void;
}) {
    const ratio = item.max_score ? item.score / item.max_score : 0;
    const belowMin = minScore !== null && item.score < minScore;
    return (
        <li className={`flex flex-col border-2 bg-white px-4 py-3.5 ${weakest || belowMin ? 'border-sun-deep' : 'border-line'}`}>
            {dimensionName && <p className="mb-1 font-pixel text-[12px] leading-none text-ink-soft">{dimensionName}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2 font-pixel text-[15px] font-bold">
                    {item.name}
                    {belowMin && <Chip tone="sun">최소 {minScore}점 미달</Chip>}
                    {weakest && !belowMin && <Chip tone="sun">가장 보완할 항목</Chip>}
                </p>
                <p className="font-pixel text-[15px] font-bold tabular-nums">
                    {item.score}
                    <span className="font-normal text-ink-soft"> / {item.max_score}점</span>
                </p>
            </div>
            <ProgressBar
                value={ratio}
                mark={minScore !== null && item.max_score ? minScore / item.max_score : undefined}
                tone={ratio >= 0.8 && !belowMin ? 'ok' : 'sun'}
                label={`${item.name} ${item.score}점, ${item.max_score}점 만점${minScore !== null ? `, 최소 ${minScore}점 ${belowMin ? '미달' : '충족'}` : ''}`}
                className="mt-2.5"
            />
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
