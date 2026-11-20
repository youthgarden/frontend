import { useCallback, useRef, useState } from 'react';
import type { AttemptPendingResult, ChatMessage } from '../../api/types';
import { useMapLock } from '../kit';
import { AttemptOutcome, type PendingLevelUp } from './AttemptOutcome';
import { EntryCheck, ExaminerMenu, ResumePrompt, UnseenResult } from './EntryViews';
import { ExamRoom } from './ExamRoom';
import { History } from './History';
import { LockedNotice, TaskBrief } from './TaskBrief';
import { TaskList } from './TaskList';
import type { LiveAttempt } from './useCountdown';
import type { TaskRef } from './util';

// 시험장 흐름 전체. 맵에서 AI 시험관 앞에서 F를 누르면 뜨고, 안에서 화면을 상태로 바꿔 가며 보여 준다.
//
//   확인 중 ─┬─ 풀던 시험 있음 ── 이어 풀기 ─────────────── 시험 화면 ── 제출 ── 채점 대기 ── 결과
//            ├─ 안 본 결과 있음 ── 결과 보기 ──────────────────────────────────── 채점 대기 / 결과
//            └─ 시험관 메뉴 ─┬─ 새 시험 보기 ── 과제 목록 ── 과제 안내 ── 시험 시작 ── 시험 화면
//                            └─ 지난 결과 보기 ── 목록 ── 채점 대기 / 결과 (목록으로 돌아옴)

type View =
    | { kind: 'entry'; key: number }
    | { kind: 'resume'; live: LiveAttempt }
    | { kind: 'unseen'; pending: AttemptPendingResult }
    | { kind: 'menu' }
    | { kind: 'tasks' }
    | { kind: 'brief'; task: TaskRef }
    | { kind: 'locked'; task: TaskRef }
    | { kind: 'exam'; live: LiveAttempt; messages: ChatMessage[] }
    | { kind: 'outcome'; attemptId: number; fromHistory: boolean }
    | { kind: 'history' };

export function ExamFlow({ onClose, onOpenLecture, onLevelUp }: {
    onClose: () => void;
    onOpenLecture: (lectureId: number) => void;
    onLevelUp: (level: number) => void;
}) {
    // 화면이 바뀌는 사이에도 맵 조작이 풀리지 않게 흐름 전체에서 한 번 더 잠근다
    useMapLock();
    const [view, setView] = useState<View>({ kind: 'entry', key: 0 });

    // 처음 본 결과에서 오른 레벨. 어느 길로 창을 떠나든(맵으로, 강의로) 떠나기 직전에 한 번 알린다
    const [levelUp, setLevelUp] = useState<PendingLevelUp | null>(null);
    const levelUpRef = useRef<PendingLevelUp | null>(null);
    const rememberLevelUp = useCallback((p: PendingLevelUp) => {
        levelUpRef.current = p;
        setLevelUp(p);
    }, []);
    const flushLevelUp = () => {
        const p = levelUpRef.current;
        levelUpRef.current = null;
        if (p) onLevelUp(p.level);
    };
    const close = () => {
        flushLevelUp();
        onClose();
    };
    const openLecture = (lectureId: number) => {
        flushLevelUp();
        onOpenLecture(lectureId);
    };

    const recheck = () => setView((v) => ({ kind: 'entry', key: v.kind === 'entry' ? v.key + 1 : 0 }));

    switch (view.kind) {
        case 'entry':
            return (
                <EntryCheck
                    key={view.key}
                    onResume={(live) => setView({ kind: 'resume', live })}
                    onUnseen={(pending) => setView({ kind: 'unseen', pending })}
                    onMenu={() => setView({ kind: 'menu' })}
                    onClose={close}
                />
            );
        case 'resume':
            return (
                <ResumePrompt
                    live={view.live}
                    onContinue={(live, messages) => setView({ kind: 'exam', live, messages })}
                    onGaveUp={() => setView({ kind: 'menu' })}
                    onClose={close}
                />
            );
        case 'unseen':
            return (
                <UnseenResult
                    pending={view.pending}
                    onView={() => setView({ kind: 'outcome', attemptId: view.pending.id, fromHistory: false })}
                    onMenu={() => setView({ kind: 'menu' })}
                    onClose={close}
                />
            );
        case 'menu':
            return (
                <ExaminerMenu
                    onNew={() => setView({ kind: 'tasks' })}
                    onHistory={() => setView({ kind: 'history' })}
                    onClose={close}
                />
            );
        case 'tasks':
            return (
                <TaskList
                    onPick={(task) => setView({ kind: 'brief', task })}
                    onOpenLecture={openLecture}
                    onBack={() => setView({ kind: 'menu' })}
                    onClose={close}
                />
            );
        case 'brief':
            return (
                <TaskBrief
                    task={view.task}
                    onStarted={(live) => setView({ kind: 'exam', live, messages: [] })}
                    onLocked={() => setView({ kind: 'locked', task: view.task })}
                    onAlreadyInProgress={recheck}
                    onBackToList={() => setView({ kind: 'tasks' })}
                    onClose={close}
                />
            );
        case 'locked':
            return (
                <LockedNotice
                    task={view.task}
                    onOpenLecture={openLecture}
                    onBackToList={() => setView({ kind: 'tasks' })}
                    onClose={close}
                />
            );
        case 'exam':
            return (
                <ExamRoom
                    key={view.live.attempt.id}
                    live={view.live}
                    initialMessages={view.messages}
                    onSubmitted={(attemptId) => setView({ kind: 'outcome', attemptId, fromHistory: false })}
                    onLeave={close}
                    onGaveUp={close}
                />
            );
        case 'outcome':
            return (
                <AttemptOutcome
                    key={view.attemptId}
                    attemptId={view.attemptId}
                    pendingLevelUp={levelUp}
                    onFirstLevelUp={rememberLevelUp}
                    onBack={view.fromHistory ? () => setView({ kind: 'history' }) : undefined}
                    onClose={close}
                    onOpenLecture={openLecture}
                    onRetry={(task) => setView({ kind: 'brief', task })}
                />
            );
        case 'history':
            return (
                <History
                    onOpen={(attemptId) => setView({ kind: 'outcome', attemptId, fromHistory: true })}
                    onNew={() => setView({ kind: 'tasks' })}
                    onBack={() => setView({ kind: 'menu' })}
                    onClose={close}
                />
            );
    }
}
