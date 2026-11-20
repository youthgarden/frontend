import { useEffect, useRef, useState, type ReactNode } from 'react';
import { errorMessage, useStartAttempt, useTask } from '../../api';
import { Button, Dialog, Loading, Notice } from '../kit';
import { CriteriaGuide } from './Criteria';
import { ExaminerSay } from './parts';
import type { LiveAttempt } from './useCountdown';
import { isCode, type TaskRef } from './util';

// 과제 안내. 시험관이 상황, 해야 할 일, 자료, 시간, 평가 기준을 알려 주고, 시작 전에 알아야 할 사실을 짚는다.

export function TaskBrief({ task, onStarted, onLocked, onAlreadyInProgress, onBackToList, onClose }: {
    task: TaskRef;
    onStarted: (live: LiveAttempt) => void;
    onLocked: () => void;
    onAlreadyInProgress: () => void;
    onBackToList: () => void;
    onClose: () => void;
}) {
    const query = useTask(task.id);
    const detail = query.data ?? null;
    // 지난번 실패가 저장소에 남아 있을 수 있다. 다시 묻는 중에는 판단하지 않는다 (그사이 강의를 들었을 수 있다)
    const failed = query.isFetching ? null : query.error;
    const locked = isCode(failed, 'LECTURE_NOT_COMPLETED');
    const loadError = failed && !locked ? errorMessage(failed) : null;
    const startAttempt = useStartAttempt();
    // 성공한 뒤 화면이 넘어갈 때까지도 시작 중으로 보인다
    const starting = startAttempt.isPending || startAttempt.isSuccess;
    const [startError, setStartError] = useState<string | null>(null);
    // 두 번 눌러도 시작 요청은 한 번만 나간다
    const startingRef = useRef(false);

    useEffect(() => {
        if (locked) onLocked();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locked]);

    const start = async () => {
        if (startingRef.current) return;
        startingRef.current = true;
        setStartError(null);
        try {
            onStarted(await startAttempt.mutateAsync(task.id));
        } catch (e) {
            startingRef.current = false;
            if (isCode(e, 'LECTURE_NOT_COMPLETED')) onLocked();
            else if (isCode(e, 'ATTEMPT_ALREADY_IN_PROGRESS')) onAlreadyInProgress();
            else setStartError(`시험을 시작하지 못했어요. ${errorMessage(e)}`);
        }
    };

    return (
        <Dialog
            title={task.title}
            description="과제 안내"
            size="lg"
            onClose={onClose}
            dismissible={!starting}
            footer={
                <>
                    <Button variant="quiet" onClick={onBackToList} disabled={starting} className="mr-auto">과제 목록으로</Button>
                    <Button onClick={onClose} disabled={starting}>나중에 하기</Button>
                    <Button variant="primary" onClick={start} busy={starting} disabled={!detail}>시험 시작</Button>
                </>
            }
        >
            {loadError && (
                <Notice tone="danger" action={<Button size="sm" onClick={() => void query.refetch()}>다시 시도</Button>}>
                    과제 안내를 불러오지 못했어요. {loadError}
                </Notice>
            )}
            {!loadError && !detail && <Loading>시험관이 과제를 준비하고 있어요</Loading>}
            {detail && (
                <div className="space-y-6">
                    <ExaminerSay>
                        이번 과제를 설명할게요. 천천히 읽어 보고, 준비되면 <strong>시험 시작</strong>을 눌러 주세요.
                    </ExaminerSay>

                    <div className="grid gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                        <div className="space-y-5">
                            <BriefSection title="상황">
                                <p className="whitespace-pre-line">{detail.situation}</p>
                            </BriefSection>
                            <BriefSection title="해야 할 일">
                                <p className="whitespace-pre-line">{detail.instruction}</p>
                            </BriefSection>
                        </div>
                        <div className="space-y-5">
                            <BriefSection title="제한 시간">
                                <p><strong className="font-pixel text-[17px]">{detail.time_limit_min}분</strong></p>
                            </BriefSection>
                            <BriefSection title="제공 자료">
                                <ul className="list-disc space-y-0.5 pl-6">
                                    {detail.materials.map((m) => <li key={m.id}>{m.title}</li>)}
                                </ul>
                                <p className="mt-1 text-[13px] leading-5 text-ink-soft">자료의 내용은 시험을 시작하면 볼 수 있어요.</p>
                            </BriefSection>
                        </div>
                    </div>

                    <div className="border-l-[6px] border-sun-deep bg-sun-soft px-4 py-3">
                        <p className="font-pixel text-[14px] font-bold">시작하기 전에 꼭 알아 두세요</p>
                        <ul className="mt-2 list-disc space-y-1 pl-6 text-[15px] leading-7">
                            <li><strong>시작하면 바로 시간이 흘러요.</strong> {detail.time_limit_min}분이 지나면 그때까지 쓴 답안이 자동으로 제출돼요.</li>
                            <li><strong>중간에 나가도 시간은 계속 흘러요.</strong> 시험관에게 다시 말을 걸면 이어서 풀 수 있어요.</li>
                            <li><strong>AI와 나눈 대화와 답안을 고친 과정이 모두 기록되어 평가에 쓰여요.</strong> 붙여넣기와 다른 창으로 옮겨 간 일도 기록돼요.</li>
                        </ul>
                    </div>

                    <BriefSection title="이렇게 평가해요">
                        <p className="mb-3 text-[14px] text-ink-soft">
                            정답 하나를 맞히는 시험이 아니에요. 결과물과 함께 AI를 어떻게 활용했는지를 봐요.
                            이 기준은 시험을 보는 동안에도 <strong className="text-ink">평가 기준</strong> 탭에서 다시 볼 수 있어요.
                        </p>
                        <CriteriaGuide criteria={detail.criteria} req={detail.pass_requirements} />
                    </BriefSection>

                    {startError && <Notice tone="danger">{startError}</Notice>}
                </div>
            )}
        </Dialog>
    );
}

function BriefSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="mb-1.5 font-pixel text-[14px] font-bold text-ink-soft">{title}</h3>
            <div className="text-[15px] leading-7">{children}</div>
        </section>
    );
}

/**
 * 필수 강의를 안 들어서 과제를 볼 수 없을 때 (목록을 연 뒤 상태가 바뀐 경우).
 * 명세 6절·10절대로 필수 강의를 알리고 강의실로 보낸다 (시험 창을 닫고 맵의 캐릭터를 강의실로 옮긴다)
 */
export function LockedNotice({ task, onGoToClassroom, onBackToList, onClose }: {
    task: TaskRef;
    onGoToClassroom: () => void;
    onBackToList: () => void;
    onClose: () => void;
}) {
    const lecture = task.requiredLecture;
    return (
        <Dialog
            title="강의를 먼저 들어야 해요"
            description={task.title}
            size="md"
            onClose={onClose}
            footer={
                <>
                    <Button onClick={onBackToList} className="mr-auto">과제 목록으로</Button>
                    <Button variant="primary" onClick={onGoToClassroom} autoFocus>강의실로 이동</Button>
                </>
            }
        >
            <ExaminerSay>
                이 과제는 아래 강의를 먼저 들어야 볼 수 있어요. 강의실에서 이 강의를 80% 이상 들으면 시험을 볼 수 있어요.
                {lecture && (
                    <strong className="mt-2 block font-bold">필수 강의: {lecture.title}</strong>
                )}
            </ExaminerSay>
        </Dialog>
    );
}
