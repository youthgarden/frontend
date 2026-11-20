import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { AttemptResult, LectureDashboard, TaskSummary } from '../types';
import { invalidateAttempts, invalidateLectureProgress } from './hooks';
import { GRADING_POLL_MS, keys, queries } from './queries';

// "무엇이 바뀌면 무엇을 다시 불러오는가"의 약속. 빠뜨리면 HUD와 창의 숫자가 어긋난다.

function seeded() {
    const qc = new QueryClient();
    qc.setQueryData(keys.me, { id: 1 });
    qc.setQueryData(keys.jobs, []);
    qc.setQueryData(keys.lectures.dashboard(), {} as LectureDashboard);
    qc.setQueryData(keys.lectures.detail(3), {});
    qc.setQueryData(keys.tasks.list(), [] as TaskSummary[]);
    qc.setQueryData(keys.attempts.list({ page: 1 }), {});
    qc.setQueryData(keys.attempts.detail(9), {});
    return qc;
}
const stale = (qc: QueryClient) =>
    qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => JSON.stringify(q.queryKey)).sort();

describe('낡은 것으로 표시하기', () => {
    it('강의 수강률이 바뀌면 강의 조회 전부와 과제 목록이 낡는다', async () => {
        const qc = seeded();
        await invalidateLectureProgress(qc);
        expect(stale(qc)).toEqual([
            '["lectures","dashboard"]',
            '["lectures","detail",3]',
            '["tasks","list"]',
        ]);
    });

    it('응시가 바뀌면 응시 조회 전부, 과제 목록, 내 정보가 낡는다. 강의와 직무는 그대로다', async () => {
        const qc = seeded();
        await invalidateAttempts(qc);
        expect(stale(qc)).toEqual([
            '["attempts","detail",9]',
            '["attempts","list",{"page":1}]',
            '["me"]',
            '["tasks","list"]',
        ]);
    });
});

describe('이름표', () => {
    it('조건이 다른 목록은 서로 다른 조회다', () => {
        expect(keys.attempts.list({ task_id: 1 })).not.toEqual(keys.attempts.list({ task_id: 2 }));
        expect(keys.attempts.list()).toEqual(keys.attempts.list({}));
    });
});

describe('채점 결과 묻기', () => {
    const interval = (status: AttemptResult['status'] | undefined) => {
        const fn = queries.attempt(1).refetchInterval as (q: { state: { data?: { status: string } } }) => number | false;
        return fn({ state: { data: status ? { status } : undefined } });
    };

    it('채점 중일 때만 2초마다 다시 묻는다', () => {
        expect(interval('GRADING')).toBe(GRADING_POLL_MS);
        expect(interval('GRADED')).toBe(false);
        expect(interval('GRADING_FAILED')).toBe(false);
        expect(interval(undefined)).toBe(false);
    });
});
