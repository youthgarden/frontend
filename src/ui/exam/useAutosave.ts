import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { isCode } from './util';

// 답안 자동 저장. 입력이 멈추고 3초 뒤에 저장한다. 직전에 저장한 내용과 같으면 보내지 않는다.
// 실패하면 5초, 10초, 20초, 30초 간격으로 다시 시도한다.

const IDLE_MS = 3000;
const RETRY_MS = [5000, 10000, 20000, 30000];

export type SaveState =
    | { kind: 'clean'; savedAt: string | null }
    | { kind: 'dirty'; savedAt: string | null }
    | { kind: 'saving'; savedAt: string | null }
    | { kind: 'retrying'; savedAt: string | null };

export function useAutosave(attemptId: number, initial: string, handlers: {
    /** 마감이 지나 저장을 받지 않음 (ATTEMPT_TIME_OVER) */
    onTimeOver: () => void;
    /** 이미 제출됐거나 사라진 응시 */
    onGone: (code: 'ATTEMPT_NOT_IN_PROGRESS' | 'ATTEMPT_NOT_FOUND') => void;
}) {
    const [state, setState] = useState<SaveState>({ kind: 'clean', savedAt: null });
    const latest = useRef(initial);
    const lastSaved = useRef(initial);
    const savedAt = useRef<string | null>(null);
    const inflight = useRef<Promise<boolean> | null>(null);
    const timer = useRef<number | undefined>(undefined);
    const failures = useRef(0);
    const stopped = useRef(false);
    const handlersRef = useRef(handlers);
    handlersRef.current = handlers;

    const clearTimer = () => {
        if (timer.current !== undefined) window.clearTimeout(timer.current);
        timer.current = undefined;
    };

    const saveOnce = useCallback(async (): Promise<boolean> => {
        // 앞선 저장이 끝나기를 기다린 뒤 최신 내용으로 다시 판단한다
        while (inflight.current) await inflight.current;
        if (stopped.current) return latest.current === lastSaved.current;
        const text = latest.current;
        if (text === lastSaved.current) {
            setState({ kind: 'clean', savedAt: savedAt.current });
            return true;
        }
        setState({ kind: 'saving', savedAt: savedAt.current });
        const p = api.saveAnswer(attemptId, text).then(
            (res) => {
                lastSaved.current = text;
                savedAt.current = res.saved_at;
                failures.current = 0;
                setState({ kind: latest.current === text ? 'clean' : 'dirty', savedAt: res.saved_at });
                return true;
            },
            (e: unknown) => {
                if (isCode(e, 'ATTEMPT_TIME_OVER')) {
                    stopped.current = true;
                    handlersRef.current.onTimeOver();
                } else if (isCode(e, 'ATTEMPT_NOT_IN_PROGRESS')) {
                    stopped.current = true;
                    handlersRef.current.onGone('ATTEMPT_NOT_IN_PROGRESS');
                } else if (isCode(e, 'ATTEMPT_NOT_FOUND')) {
                    stopped.current = true;
                    handlersRef.current.onGone('ATTEMPT_NOT_FOUND');
                } else if (!stopped.current) {
                    setState({ kind: 'retrying', savedAt: savedAt.current });
                    const wait = RETRY_MS[Math.min(failures.current, RETRY_MS.length - 1)];
                    failures.current += 1;
                    clearTimer();
                    timer.current = window.setTimeout(() => void saveOnce(), wait);
                }
                return false;
            },
        );
        inflight.current = p;
        try {
            return await p;
        } finally {
            inflight.current = null;
        }
    }, [attemptId]);

    /** 입력란이 바뀔 때마다 부른다 */
    const change = useCallback((text: string) => {
        latest.current = text;
        if (stopped.current) return;
        clearTimer();
        setState((s) => (s.kind === 'saving' || s.kind === 'retrying' ? s : { kind: text === lastSaved.current ? 'clean' : 'dirty', savedAt: s.savedAt }));
        timer.current = window.setTimeout(() => void saveOnce(), IDLE_MS);
    }, [saveOnce]);

    /** 기다리지 않고 지금 저장한다 (잠시 나가기 전에). 저장할 것이 없거나 성공하면 true */
    const flush = useCallback(async () => {
        clearTimer();
        const ok = await saveOnce();
        return ok && latest.current === lastSaved.current;
    }, [saveOnce]);

    /** 제출·포기 뒤에는 더 저장하지 않는다 */
    const stop = useCallback(() => {
        stopped.current = true;
        clearTimer();
    }, []);

    /** 제출이나 포기가 실패해 계속 풀 때 다시 켠다 */
    const resume = useCallback(() => {
        stopped.current = false;
        change(latest.current);
    }, [change]);

    useEffect(() => {
        // StrictMode는 같은 ref를 둔 채 정리와 실행을 한 번 더 하므로 여기서 되살린다
        stopped.current = false;
        return () => {
            stopped.current = true;
            clearTimer();
        };
    }, []);

    return { state, change, flush, stop, resume };
}
