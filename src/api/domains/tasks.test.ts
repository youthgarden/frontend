import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateLectureProgress } from './lectures';
import { taskKeys } from './tasks';

// 과제 안내는 과제 이름표 아래에 있다. 과제에 관한 것이 낡으면 함께 낡는다.

describe('taskKeys', () => {
    it('과제 안내는 과제 조회 전부(taskKeys.all)에 들어 있어, 수강률이 바뀌면 함께 낡는다', async () => {
        const qc = new QueryClient();
        qc.setQueryData(taskKeys.list(), []);
        qc.setQueryData(taskKeys.detail(1), {});

        await invalidateLectureProgress(qc);

        const stale = qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => JSON.stringify(q.queryKey)).sort();
        expect(stale).toEqual(['["tasks","detail",1]', '["tasks","list"]']);
    });
});
