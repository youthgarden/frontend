import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/client';
import { api } from '../../api/endpoints';
import type { AttemptInProgress, AttemptPendingResult, ChatMessage } from '../../api/types';
import { useSession } from '../../session/SessionProvider';
import { Button, Dialog, Loading, Notice } from '../kit';
import { ExaminerSay } from './parts';
import { useSecondsLeft, type LiveAttempt } from './useCountdown';
import { formatClock, formatDuration, isCode } from './util';

// 시험관에게 말을 걸었을 때 처음 보이는 창들: 확인 중, 풀던 시험, 안 본 결과, 시험관 메뉴.

/** GET /attempts/current로 어디로 갈지 정한다 */
export function EntryCheck({ onResume, onUnseen, onMenu, onClose }: {
    onResume: (live: LiveAttempt) => void;
    onUnseen: (pending: AttemptPendingResult) => void;
    onMenu: () => void;
    onClose: () => void;
}) {
    const [error, setError] = useState<string | null>(null);
    const [tries, setTries] = useState(0);

    useEffect(() => {
        // 조회라서 StrictMode에서 두 번 불려도 괜찮다. 늦게 온 쪽은 버린다
        let cancelled = false;
        setError(null);
        api.currentAttempt().then(
            (cur) => {
                if (cancelled) return;
                if (cur === null) onMenu();
                else if (cur.status === 'IN_PROGRESS') onResume({ attempt: cur as AttemptInProgress, receivedAt: performance.now() });
                else onUnseen(cur as AttemptPendingResult);
            },
            (e) => {
                if (!cancelled) setError(errorMessage(e));
            },
        );
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tries]);

    return (
        <Dialog title="AI 시험관" onClose={onClose} size="md">
            {error ? (
                <Notice tone="danger" action={<Button size="sm" onClick={() => setTries((n) => n + 1)}>다시 시도</Button>}>
                    시험관과 이야기를 시작하지 못했어요. {error}
                </Notice>
            ) : (
                <Loading>시험관이 기록을 확인하고 있어요</Loading>
            )}
        </Dialog>
    );
}

/** 풀던 시험이 있을 때: 이어 풀기 / 포기하기 / 닫기 */
export function ResumePrompt({ live, onContinue, onGaveUp, onClose }: {
    live: LiveAttempt;
    onContinue: (live: LiveAttempt, messages: ChatMessage[]) => void;
    onGaveUp: () => void;
    onClose: () => void;
}) {
    const { attempt } = live;
    const left = useSecondsLeft(live);
    const [step, setStep] = useState<'ask' | 'confirmGiveUp'>('ask');
    const [busy, setBusy] = useState<'continue' | 'giveUp' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const resume = async () => {
        if (busy) return;
        setBusy('continue');
        setError(null);
        try {
            const messages = await api.messages(attempt.id);
            onContinue(live, messages);
        } catch (e) {
            setError(`대화 기록을 불러오지 못했어요. ${errorMessage(e)}`);
            setBusy(null);
        }
    };

    const giveUp = async () => {
        if (busy) return;
        setBusy('giveUp');
        setError(null);
        try {
            await api.giveUp(attempt.id);
            onGaveUp();
        } catch (e) {
            // 그사이 시간이 끝나 서버가 제출했으면 포기할 수 없다. 처음부터 다시 확인하게 한다
            if (isCode(e, 'ATTEMPT_NOT_IN_PROGRESS', 'ATTEMPT_NOT_FOUND')) {
                setError('이 시험은 이미 제출됐거나 끝났어요. 창을 닫고 시험관에게 다시 말을 걸어 주세요.');
            } else {
                setError(`포기하지 못했어요. ${errorMessage(e)}`);
            }
            setBusy(null);
        }
    };

    if (step === 'confirmGiveUp') {
        return (
            <Dialog
                title="시험을 포기할까요?"
                description={attempt.task.title}
                size="md"
                onClose={() => setStep('ask')}
                dismissible={!busy}
                footer={
                    <>
                        <Button onClick={() => setStep('ask')} disabled={!!busy} autoFocus>돌아가기</Button>
                        <Button variant="danger" busy={busy === 'giveUp'} onClick={giveUp}>포기하기</Button>
                    </>
                }
            >
                <div className="space-y-3 text-[15px] leading-7">
                    <p>포기하면 아래 내용이 <strong>모두 지워지고 되돌릴 수 없어요.</strong></p>
                    <ul className="list-disc space-y-1 pl-6">
                        <li>지금까지 AI와 나눈 대화</li>
                        <li>써 둔 답안과 고친 기록</li>
                        <li>이번 시험 기록 (점수도 남지 않아요)</li>
                    </ul>
                    <p className="text-ink-soft">같은 과제는 나중에 처음부터 다시 볼 수 있어요.</p>
                    {error && <Notice tone="danger">{error}</Notice>}
                </div>
            </Dialog>
        );
    }

    return (
        <Dialog
            title="풀던 시험이 있어요"
            size="md"
            onClose={onClose}
            dismissible={!busy}
            footer={
                <>
                    <Button onClick={() => { setError(null); setStep('confirmGiveUp'); }} disabled={!!busy}>포기하기</Button>
                    <Button variant="primary" busy={busy === 'continue'} onClick={resume} autoFocus>이어 풀기</Button>
                </>
            }
        >
            <div className="space-y-5">
                <ExaminerSay>지난번에 풀던 시험이 남아 있어요. 이어서 풀어 볼까요?</ExaminerSay>
                <div className="border-2 border-line bg-white px-4 py-3">
                    <p className="font-pixel text-[15px] font-bold leading-snug">{attempt.task.title}</p>
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[14px] text-ink-soft">남은 시간</span>
                        <span className="font-pixel text-[20px] font-bold tabular-nums" aria-label={formatDuration(left)}>{formatClock(left)}</span>
                    </p>
                    <p className="mt-1 text-[14px] leading-6 text-ink-soft">
                        {left > 0
                            ? '나가 있는 동안에도 시간은 흘렀어요. 지금도 줄어들고 있어요.'
                            : '시간이 다 됐어요. 이어 풀기를 누르면 지금까지 쓴 답안으로 제출돼요.'}
                    </p>
                </div>
                {error && <Notice tone="danger">{error}</Notice>}
            </div>
        </Dialog>
    );
}

/** 나가 있는 동안 제출된 시험(또는 채점을 기다리다 닫은 시험)의 결과를 아직 안 봤을 때 */
export function UnseenResult({ pending, onView, onMenu, onClose }: {
    pending: AttemptPendingResult;
    onView: () => void;
    onMenu: () => void;
    onClose: () => void;
}) {
    const lead = pending.auto_submitted
        ? '나가 있는 동안 시간이 끝나서, 마지막으로 저장된 답안으로 자동으로 제출됐어요.'
        : '지난번에 제출한 시험이 있어요.';
    const tail = {
        GRADING: '지금 채점하고 있어요.',
        GRADED: '채점이 끝났어요. 결과를 확인해 보세요.',
        GRADING_FAILED: '채점하지 못했어요. 결과 화면에서 다시 채점할 수 있어요.',
    }[pending.status];
    return (
        <Dialog
            title="확인하지 않은 결과가 있어요"
            size="md"
            onClose={onClose}
            footer={
                <>
                    <Button onClick={onMenu}>시험관 메뉴로</Button>
                    <Button variant="primary" onClick={onView} autoFocus>결과 보기</Button>
                </>
            }
        >
            <ExaminerSay>
                {lead} {tail}
            </ExaminerSay>
        </Dialog>
    );
}

/** 시험관 메뉴: 새 시험 보기 / 지난 결과 보기 / 다음에 올게요 */
export function ExaminerMenu({ onNew, onHistory, onClose }: { onNew: () => void; onHistory: () => void; onClose: () => void }) {
    const { me } = useSession();
    return (
        <Dialog title="AI 시험관" size="md" onClose={onClose}>
            <div className="space-y-6">
                <ExaminerSay scale={3}>
                    {me ? `${me.nickname}님, 어서 와요. ` : '어서 와요. '}
                    여기서는 실무 과제를 받아 AI와 함께 풀어요. 오늘은 무엇을 할까요?
                </ExaminerSay>
                <nav aria-label="시험관에게 할 일" className="flex flex-col gap-3 pl-1 pr-1">
                    <Button variant="primary" size="lg" onClick={onNew} autoFocus className="w-full justify-start">새 시험 보기</Button>
                    <Button size="lg" onClick={onHistory} className="w-full justify-start">지난 결과 보기</Button>
                    <Button variant="quiet" size="lg" onClick={onClose} className="w-full justify-start">다음에 올게요</Button>
                </nav>
            </div>
        </Dialog>
    );
}
