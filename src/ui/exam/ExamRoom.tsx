import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, errorMessage, useGiveUpAttempt, useSubmitAttempt } from '../../api';
import type { AttemptEventType, ChatMessage } from '../../api';
import { Button, Dialog, Loading, Notice, useMapLock } from '../kit';
import { AnswerPane } from './AnswerPane';
import { ChatPane } from './ChatPane';
import { ConfirmDialog, TabBar } from './parts';
import { TaskPane } from './TaskPane';
import { useAutosave } from './useAutosave';
import { useSecondsLeft, type LiveAttempt } from './useCountdown';
import { formatClock, formatDuration, isCode } from './util';

// 시험 화면. 맵을 가리는 전체 화면으로, 과제·자료 / AI 대화 / 답안 세 영역과 위쪽 막대로 이뤄진다.
// 기준 폭 1440px. 1280px(Tailwind xl) 미만에서는 세 영역을 탭으로 바꿔 보여 준다.

type Pane = 'task' | 'chat' | 'answer';
type Modal = null | 'leave' | 'giveUp' | 'submit';
type Phase =
    | { kind: 'working' }
    | { kind: 'submitting'; auto: boolean }
    | { kind: 'submitFailed'; auto: boolean; message: string }
    | { kind: 'gone' };

export function ExamRoom({ live, initialMessages, onSubmitted, onLeave, onGaveUp }: {
    live: LiveAttempt;
    initialMessages: ChatMessage[];
    /** 제출됐다 (직접, 시간 종료, 또는 이미 제출돼 있었음). 채점 대기로 간다 */
    onSubmitted: (attemptId: number) => void;
    /** 잠시 나가기. 응시는 남는다 */
    onLeave: () => void;
    onGaveUp: () => void;
}) {
    useMapLock();
    const { attempt } = live;
    const attemptId = attempt.id;
    const idBase = useId();
    const titleRef = useRef<HTMLHeadingElement>(null);

    const [answer, setAnswer] = useState(attempt.answer ?? '');
    const answerRef = useRef(answer);
    const [pane, setPane] = useState<Pane>('task');
    const [chatUnread, setChatUnread] = useState(false);
    // 새 AI 답변의 수. 좁은 화면에서 대화 영역이 숨어 있어도 화면 낭독기가 도착을 알리게 한다
    const [replyCount, setReplyCount] = useState(0);
    const [expired, setExpired] = useState(false);
    const [modal, setModal] = useState<Modal>(null);
    const [modalBusy, setModalBusy] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [leaveAnyway, setLeaveAnyway] = useState(false);
    const [phase, setPhase] = useState<Phase>({ kind: 'working' });
    // 제출·포기 요청은 한 번만 나가게 막는다 (제출 클릭과 시간 종료가 겹쳐도)
    const finishingRef = useRef(false);
    const { mutateAsync: submitAttempt } = useSubmitAttempt();
    const { mutateAsync: giveUpAttempt } = useGiveUpAttempt();

    // 아래 콜백들은 서로를 부르므로 ref로 이어 둔다
    const onTimeOverRef = useRef<() => void>(() => {});
    const onGoneRef = useRef<(code: 'ATTEMPT_NOT_IN_PROGRESS' | 'ATTEMPT_NOT_FOUND') => void>(() => {});
    const saver = useAutosave(attemptId, attempt.answer ?? '', {
        onTimeOver: () => onTimeOverRef.current(),
        onGone: (code) => onGoneRef.current(code),
    });

    useEffect(() => {
        titleRef.current?.focus();
    }, []);

    const submit = useCallback(async (auto: boolean) => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        saver.stop();
        setModal(null);
        setPhase({ kind: 'submitting', auto });
        try {
            await submitAttempt({ id: attemptId, answer: answerRef.current });
            onSubmitted(attemptId);
        } catch (e) {
            // 이미 제출됨: 타이머 자동 제출과 겹쳤거나, 마감 + 1분이 지나 서버가 제출했다
            if (isCode(e, 'ATTEMPT_NOT_IN_PROGRESS')) {
                onSubmitted(attemptId);
                return;
            }
            if (isCode(e, 'ATTEMPT_NOT_FOUND')) {
                setPhase({ kind: 'gone' });
                return;
            }
            finishingRef.current = false;
            setPhase({ kind: 'submitFailed', auto, message: errorMessage(e) });
        }
    }, [attemptId, onSubmitted, saver, submitAttempt]);

    onTimeOverRef.current = () => {
        setExpired(true);
        void submit(true);
    };
    onGoneRef.current = (code) => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        saver.stop();
        if (code === 'ATTEMPT_NOT_IN_PROGRESS') onSubmitted(attemptId);
        else setPhase({ kind: 'gone' });
    };

    // 행동 기록. 실패해도 사용자에게 알리지 않는다. 단, 시간이 끝났다는 응답이면 제출로 넘어간다
    const record = useCallback((type: AttemptEventType, payload?: Record<string, unknown>) => {
        if (finishingRef.current) return;
        api.recordEvent(attemptId, type, payload).catch((e: unknown) => {
            if (isCode(e, 'ATTEMPT_TIME_OVER')) onTimeOverRef.current();
        });
    }, [attemptId]);

    // 브라우저 탭이나 창을 벗어나고 돌아오는 것을 기록한다
    useEffect(() => {
        let last: 'BLUR' | 'FOCUS' = document.hasFocus() ? 'FOCUS' : 'BLUR';
        const onBlur = () => {
            if (last === 'BLUR') return;
            last = 'BLUR';
            record('BLUR');
        };
        const onFocus = () => {
            if (last === 'FOCUS') return;
            last = 'FOCUS';
            record('FOCUS');
        };
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        return () => {
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('focus', onFocus);
        };
    }, [record]);

    const changeAnswer = (text: string) => {
        answerRef.current = text;
        setAnswer(text);
        saver.change(text);
    };

    const openModal = (m: Exclude<Modal, null>) => {
        setModalError(null);
        setModalBusy(false);
        setLeaveAnyway(false);
        setModal(m);
    };

    const leave = async () => {
        if (leaveAnyway) {
            saver.stop();
            onLeave();
            return;
        }
        setModalBusy(true);
        setModalError(null);
        const ok = await saver.flush();
        if (finishingRef.current) return; // 저장하다 시간이 끝나 제출로 넘어갔다
        if (ok) {
            saver.stop();
            onLeave();
            return;
        }
        setModalBusy(false);
        setLeaveAnyway(true);
        setModalError('마지막으로 고친 부분을 저장하지 못했어요. 지금 나가면 그 부분은 사라질 수 있어요. 잠시 뒤 다시 나가 보거나, 그래도 나갈 수 있어요.');
    };

    const giveUp = async () => {
        if (finishingRef.current) return;
        finishingRef.current = true;
        saver.stop();
        setModalBusy(true);
        setModalError(null);
        try {
            await giveUpAttempt(attemptId);
            onGaveUp();
        } catch (e) {
            if (isCode(e, 'ATTEMPT_NOT_IN_PROGRESS')) {
                // 그사이 시간이 끝나 제출됐다
                onSubmitted(attemptId);
                return;
            }
            finishingRef.current = false;
            saver.resume();
            setModalBusy(false);
            setModalError(`포기하지 못했어요. ${errorMessage(e)}`);
        }
    };

    const locked = expired || phase.kind !== 'working';
    const working = phase.kind === 'working';

    const paneClass = (p: Pane) =>
        `${pane === p ? 'flex' : 'hidden'} xl:flex px-box-flat min-h-0 min-w-0 flex-col bg-paper`;

    return (
        <div className="fixed inset-0 z-[35] flex flex-col bg-paper-sunk" role="main" aria-labelledby={`${idBase}-title`}>
            {/* 위쪽 막대 */}
            <header className="px-box relative z-10 mx-3 mt-3 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 bg-paper px-4 py-2.5">
                <div className="min-w-0 flex-1 basis-[280px]">
                    <p className="font-pixel text-[12px] leading-none text-ink-soft">시험 중</p>
                    <h1
                        ref={titleRef}
                        id={`${idBase}-title`}
                        tabIndex={-1}
                        className="mt-1 truncate font-pixel text-[18px] font-bold leading-tight outline-none!"
                    >
                        {attempt.task.title}
                    </h1>
                    <p className="mt-1 text-[12px] leading-snug text-ink-soft">
                        평가에 쓰이는 기록: AI와 나눈 대화, 답안을 고친 과정, 붙여넣기, 다른 창으로 옮겨 간 일
                    </p>
                </div>
                <ExamTimer live={live} onExpire={() => onTimeOverRef.current()} />
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <Button onClick={() => openModal('leave')} disabled={!working}>잠시 나가기</Button>
                    <Button onClick={() => openModal('giveUp')} disabled={!working}>포기하기</Button>
                    <Button variant="primary" onClick={() => openModal('submit')} disabled={!working}>제출하기</Button>
                </div>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-4 pt-5">
                {/* 좁은 화면에서만 보이는 영역 전환 탭 */}
                <TabBar
                    className="xl:hidden"
                    idBase={idBase}
                    label="시험 화면 영역"
                    active={pane}
                    onChange={(p) => {
                        setPane(p);
                        if (p === 'chat') setChatUnread(false);
                    }}
                    tabs={[
                        { key: 'task', label: '과제와 자료' },
                        {
                            key: 'chat',
                            label: 'AI 대화',
                            badge: chatUnread ? <span className="bg-uniform px-1 py-0.5 text-[11px] leading-none text-white">새 답변</span> : undefined,
                        },
                        { key: 'answer', label: '답안' },
                    ]}
                />
                <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.05fr)_minmax(0,1.05fr)]">
                    <section id={`${idBase}-panel-task`} aria-label="과제와 자료" className={paneClass('task')}>
                        <TaskPane task={attempt.task} />
                    </section>
                    <section id={`${idBase}-panel-chat`} aria-label="AI 대화" className={paneClass('chat')}>
                        <ChatPane
                            attemptId={attemptId}
                            initialMessages={initialMessages}
                            locked={locked}
                            onPaste={(length) => record('PASTE', { length })}
                            onTimeOver={() => onTimeOverRef.current()}
                            onGone={(code) => onGoneRef.current(code)}
                            onReply={() => {
                                setChatUnread((u) => u || pane !== 'chat');
                                setReplyCount((n) => n + 1);
                            }}
                        />
                    </section>
                    <section id={`${idBase}-panel-answer`} aria-label="답안" className={paneClass('answer')}>
                        <AnswerPane
                            value={answer}
                            onChange={changeAnswer}
                            onPaste={(length) => record('PASTE', { length })}
                            saveState={saver.state}
                            locked={locked}
                        />
                    </section>
                </div>
            </div>

            {/* 대화 영역은 좁은 화면에서 다른 탭을 보는 동안 숨겨져(display:none) 낭독되지 않는다.
                늘 붙어 있는 이 영역에 새 문장을 끼워 넣어 답변 도착을 알린다 (key가 바뀌면 같은 문장도 다시 읽는다) */}
            <p className="sr-only" aria-live="polite">
                {replyCount > 0 && <span key={replyCount}>AI 답변이 도착했어요</span>}
            </p>

            {modal === 'leave' && (
                <ConfirmDialog
                    title="잠시 나갈까요?"
                    confirmLabel={leaveAnyway ? '그래도 나가기' : '잠시 나가기'}
                    cancelLabel="계속 풀기"
                    onConfirm={leave}
                    onCancel={() => setModal(null)}
                    busy={modalBusy}
                >
                    <p>
                        <strong>나가 있는 동안에도 시간은 계속 흘러요.</strong> 지금 남은 시간은 <LeftText live={live} />이에요.
                    </p>
                    <p>답안은 저장해 두고 나가요. 시험관에게 다시 말을 걸면 이어서 풀 수 있어요.</p>
                    {modalError && <Notice tone="warn">{modalError}</Notice>}
                </ConfirmDialog>
            )}
            {modal === 'giveUp' && (
                <ConfirmDialog
                    title="시험을 포기할까요?"
                    confirmLabel="포기하기"
                    confirmVariant="danger"
                    cancelLabel="계속 풀기"
                    focusCancel
                    onConfirm={giveUp}
                    onCancel={() => setModal(null)}
                    busy={modalBusy}
                >
                    <p>포기하면 아래 내용이 <strong>모두 지워지고 되돌릴 수 없어요.</strong></p>
                    <ul className="list-disc space-y-1 pl-6">
                        <li>지금까지 AI와 나눈 대화</li>
                        <li>써 둔 답안과 고친 기록</li>
                        <li>이번 시험 기록 (점수도 남지 않아요)</li>
                    </ul>
                    <p className="text-ink-soft">같은 과제는 나중에 처음부터 다시 볼 수 있어요.</p>
                    {modalError && <Notice tone="danger">{modalError}</Notice>}
                </ConfirmDialog>
            )}
            {modal === 'submit' && (
                <ConfirmDialog
                    title="답안을 제출할까요?"
                    confirmLabel="제출하기"
                    cancelLabel="계속 풀기"
                    focusCancel
                    onConfirm={() => void submit(false)}
                    onCancel={() => setModal(null)}
                >
                    <p><strong>제출하면 답안을 고칠 수 없어요.</strong> 시험관이 바로 채점을 시작해요.</p>
                    <p className="text-ink-soft">아직 <LeftText live={live} /> 남았어요.</p>
                    {answer.trim() === '' && (
                        <Notice tone="warn">
                            <strong>답안이 비어 있어요.</strong> 이대로 제출하면 결과물 점수를 받기 어려워요.
                        </Notice>
                    )}
                </ConfirmDialog>
            )}

            {phase.kind === 'submitting' && (
                <Dialog title={phase.auto ? '시간이 끝났어요' : '답안을 제출하고 있어요'} size="sm" onClose={() => {}} dismissible={false}>
                    <Loading>{phase.auto ? '지금까지 쓴 답안을 제출하고 있어요' : '잠시만 기다려 주세요'}</Loading>
                </Dialog>
            )}
            {phase.kind === 'submitFailed' && (
                <Dialog
                    title={phase.auto ? '시간이 끝났어요' : '제출하지 못했어요'}
                    size="sm"
                    onClose={() => {}}
                    dismissible={false}
                    footer={
                        <>
                            {phase.auto ? (
                                <Button onClick={onLeave}>맵으로 돌아가기</Button>
                            ) : (
                                <Button
                                    onClick={() => {
                                        saver.resume();
                                        setPhase({ kind: 'working' });
                                    }}
                                >
                                    계속 풀기
                                </Button>
                            )}
                            <Button variant="primary" onClick={() => void submit(phase.auto)} autoFocus>다시 제출하기</Button>
                        </>
                    }
                >
                    <div className="space-y-3 text-[15px] leading-7">
                        <p>답안을 제출하지 못했어요. {phase.message}</p>
                        {phase.auto ? (
                            <p className="text-ink-soft">
                                연결을 확인하고 다시 제출해 주세요. 끝내 제출하지 못해도, 1분쯤 지나면 마지막으로 저장된 답안으로 자동 제출돼요.
                            </p>
                        ) : (
                            <p className="text-ink-soft">답안은 그대로 있어요. 연결을 확인하고 다시 제출해 주세요.</p>
                        )}
                    </div>
                </Dialog>
            )}
            {phase.kind === 'gone' && (
                <Dialog
                    title="이 시험을 더 이어 풀 수 없어요"
                    size="sm"
                    onClose={onLeave}
                    dismissible={false}
                    footer={<Button variant="primary" onClick={onLeave} autoFocus>맵으로 돌아가기</Button>}
                >
                    <p className="text-[15px] leading-7">
                        다른 창에서 이 시험을 포기했거나 기록이 사라졌어요. 시험관에게 다시 말을 걸어 새 시험을 볼 수 있어요.
                    </p>
                </Dialog>
            )}
        </div>
    );
}

/** 남은 시간. 5분 이하, 1분 이하에서 색과 문구가 함께 바뀐다. 화면 낭독기는 단계가 바뀔 때만 읽는다 */
function ExamTimer({ live, onExpire }: { live: LiveAttempt; onExpire: () => void }) {
    const left = useSecondsLeft(live, onExpire);
    const level = left <= 0 ? 'over' : left <= 60 ? 'danger' : left <= 300 ? 'warn' : 'normal';
    const look = {
        normal: { box: 'bg-paper-sunk text-ink', label: '남은 시간' },
        warn: { box: 'bg-sun text-ink', label: '5분도 안 남았어요' },
        danger: { box: 'bg-danger text-white', label: '1분도 안 남았어요 · 끝나면 자동 제출' },
        over: { box: 'bg-danger text-white', label: '시간이 끝났어요' },
    }[level];
    const announce = {
        normal: '',
        warn: '남은 시간이 5분도 안 돼요.',
        danger: '남은 시간이 1분도 안 돼요. 시간이 끝나면 지금까지 쓴 답안이 자동으로 제출돼요.',
        over: '시간이 끝났어요. 답안을 제출하고 있어요.',
    }[level];

    return (
        <>
            <div
                role="timer"
                aria-label={`남은 시간 ${formatDuration(left)}`}
                className={`px-box-flat flex shrink-0 flex-col items-center px-4 py-1.5 ${look.box}`}
            >
                <span className="font-pixel text-[12px] font-bold leading-tight" aria-hidden>{look.label}</span>
                <span className="font-pixel text-[28px] font-bold leading-none tabular-nums" aria-hidden>{formatClock(left)}</span>
            </div>
            <p className="sr-only" aria-live="polite">{announce}</p>
        </>
    );
}

/** 확인 창 안의 남은 시간. 창이 열려 있는 동안에도 줄어든다 */
function LeftText({ live }: { live: LiveAttempt }) {
    return <>{formatDuration(useSecondsLeft(live))}</>;
}
