import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../core/errors';
import type { AttemptList, AttemptResult } from '../types';
import {
    attemptApi, attemptKeys, attemptQueries, invalidateAttemptChange, invalidateGradingDone, nextAttemptPage,
    RESULT_POLL_MS, resultPollInterval,
} from './attempts';
import { lectureKeys } from './lectures';
import { taskKeys } from './tasks';
import { userKeys } from './users';

// 응시의 약속: 무엇이 바뀌면 무엇이 낡는가, 언제 결과를 다시 묻는가, first_view를 어떻게 지키는가.

afterEach(() => {
    vi.restoreAllMocks();
});

const staleKeys = (qc: QueryClient) =>
    qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => JSON.stringify(q.queryKey)).sort();

function fillCache(qc: QueryClient) {
    qc.setQueryData(userKeys.me, {});
    qc.setQueryData(lectureKeys.dashboard(), {});
    qc.setQueryData(taskKeys.list(), []);
    qc.setQueryData(attemptKeys.list(20), {});
    qc.setQueryData(attemptKeys.detail(7), {});
    qc.setQueryData(attemptKeys.messages(7), []);
}

function result(over: Partial<AttemptResult> = {}): AttemptResult {
    return {
        id: 7, status: 'GRADED', task: { id: 1, title: '과제' }, started_at: '', submitted_at: '', answer: '',
        total_score: 85, passed: true, pass_score: 80, summary_feedback: null, scores: [], recommended_lecture: null,
        level_up: { leveled_up: true, level: 2 }, first_view: false, ...over,
    };
}

describe('invalidateAttemptChange', () => {
    it('응시가 바뀌면 응시 조회 전부, 과제 목록, 내 정보가 낡는다. 강의는 그대로다', async () => {
        const qc = new QueryClient();
        fillCache(qc);

        await invalidateAttemptChange(qc);

        expect(staleKeys(qc)).toEqual([
            '["attempts","detail",7]', '["attempts","list",{"size":20}]', '["attempts","messages",7]', '["me"]', '["tasks","list"]',
        ]);
    });
});

describe('invalidateGradingDone', () => {
    it('채점이 끝나면 지난 결과 목록, 과제 목록, 내 정보가 낡는다. 결과 조회 자신과 대화 기록은 그대로다', async () => {
        const qc = new QueryClient();
        fillCache(qc);

        await invalidateGradingDone(qc);

        expect(staleKeys(qc)).toEqual(['["attempts","list",{"size":20}]', '["me"]', '["tasks","list"]']);
    });
});

describe('resultPollInterval', () => {
    const at = (state: Partial<Parameters<typeof resultPollInterval>[0]['state']>) =>
        resultPollInterval({ state: { data: undefined, status: 'success', error: null, fetchFailureCount: 0, ...state } });

    it('채점 중일 때만 2초마다 다시 묻는다', () => {
        expect(at({ data: result({ status: 'GRADING' }) })).toBe(RESULT_POLL_MS);
        expect(RESULT_POLL_MS).toBe(2000);
    });

    it('채점이 끝났거나 실패했으면 멈춘다', () => {
        expect(at({ data: result({ status: 'GRADED' }) })).toBe(false);
        expect(at({ data: result({ status: 'GRADING_FAILED' }) })).toBe(false);
    });

    it('처음 불러오는 중에는 따로 묻지 않는다', () => {
        expect(at({ status: 'pending' })).toBe(false);
    });

    it('묻다가 실패하면 간격을 늘려 가며 계속 묻는다 (최대 10초)', () => {
        const err = new ApiError('NETWORK_ERROR', '', 0);
        expect(at({ status: 'error', error: err, fetchFailureCount: 1 })).toBe(4000);
        expect(at({ status: 'error', error: err, fetchFailureCount: 2, data: result({ status: 'GRADING' }) })).toBe(6000);
        expect(at({ status: 'error', error: err, fetchFailureCount: 9 })).toBe(10000);
    });

    it('응시가 없으면 멈추고, 끝난 결과를 보는 중의 실패로는 다시 묻지 않는다', () => {
        expect(at({ status: 'error', error: new ApiError('ATTEMPT_NOT_FOUND', '', 404), fetchFailureCount: 1 })).toBe(false);
        expect(at({ status: 'error', error: new ApiError('NETWORK_ERROR', '', 0), fetchFailureCount: 1, data: result() })).toBe(false);
    });
});

describe('attemptQueries.detail', () => {
    it('first_view: true를 받은 순간 알리고, 다음 조회의 false로는 다시 알리지 않는다', async () => {
        const qc = new QueryClient();
        const spy = vi.spyOn(attemptApi, 'attempt')
            .mockResolvedValueOnce(result({ first_view: true }))
            .mockResolvedValueOnce(result({ first_view: false }));
        const onFirstView = vi.fn();

        await qc.fetchQuery(attemptQueries.detail(7, onFirstView));
        await qc.fetchQuery({ ...attemptQueries.detail(7, onFirstView), staleTime: 0 });

        expect(spy).toHaveBeenCalledTimes(2);
        expect(onFirstView).toHaveBeenCalledTimes(1);
        expect(onFirstView.mock.calls[0][0]).toMatchObject({ id: 7, first_view: true });
    });

    it('보던 화면이 떨어져도(StrictMode) 요청을 끊지 않아 first_view: true를 놓치지 않는다', async () => {
        const qc = new QueryClient();
        let resolve!: (r: AttemptResult) => void;
        vi.spyOn(attemptApi, 'attempt').mockReturnValueOnce(new Promise((r) => { resolve = r; }));
        const onFirstView = vi.fn();

        const observer = new QueryObserver(qc, attemptQueries.detail(7, onFirstView));
        const unsubscribe = observer.subscribe(() => {});
        unsubscribe();
        resolve(result({ first_view: true }));
        await vi.waitFor(() => expect(onFirstView).toHaveBeenCalledTimes(1));
        await vi.waitFor(() => expect(qc.getQueryData(attemptKeys.detail(7))).toMatchObject({ first_view: true }));
    });

    it('채점 중이던 결과가 끝나면 지난 결과 목록, 과제 목록, 내 정보를 낡게 한다', async () => {
        const qc = new QueryClient();
        qc.setQueryData(taskKeys.list(), []);
        qc.setQueryData(userKeys.me, {});
        qc.setQueryData(attemptKeys.detail(7), result({ status: 'GRADING' }));
        vi.spyOn(attemptApi, 'attempt').mockResolvedValueOnce(result({ status: 'GRADED', first_view: false }));

        await qc.fetchQuery({ ...attemptQueries.detail(7), staleTime: 0 });

        await vi.waitFor(() => expect(staleKeys(qc)).toEqual(['["me"]', '["tasks","list"]']));
    });

    it('채점 중인 결과를 다시 물어 여전히 채점 중이면 아무것도 낡게 하지 않는다', async () => {
        const qc = new QueryClient();
        qc.setQueryData(taskKeys.list(), []);
        qc.setQueryData(attemptKeys.detail(7), result({ status: 'GRADING' }));
        vi.spyOn(attemptApi, 'attempt').mockResolvedValueOnce(result({ status: 'GRADING' }));

        await qc.fetchQuery({ ...attemptQueries.detail(7), staleTime: 0 });

        expect(staleKeys(qc)).toEqual([]);
    });
});

describe('attemptQueries.current', () => {
    it('저장해 두지 않고, 받은 순간의 단조 시계 값을 함께 돌려준다', async () => {
        const options = attemptQueries.current();
        expect(options.staleTime).toBe(0);
        expect(options.gcTime).toBe(0);

        const qc = new QueryClient();
        vi.spyOn(attemptApi, 'currentAttempt').mockResolvedValueOnce(null);
        const before = performance.now();
        const res = await qc.fetchQuery(options);
        expect(res.current).toBeNull();
        expect(res.receivedAt).toBeGreaterThanOrEqual(before);
    });
});

describe('nextAttemptPage', () => {
    const page = (p: number, total: number): AttemptList => ({ items: [], page: p, size: 20, total });

    it('남은 결과가 있으면 다음 쪽, 다 불렀으면 없음', () => {
        expect(nextAttemptPage(page(1, 21))).toBe(2);
        expect(nextAttemptPage(page(1, 20))).toBeUndefined();
        expect(nextAttemptPage(page(2, 40))).toBeUndefined();
        expect(nextAttemptPage(page(1, 0))).toBeUndefined();
    });
});
