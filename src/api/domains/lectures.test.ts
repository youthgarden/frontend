import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidateLectureProgress, lectureKeys } from './lectures';
import { taskKeys } from './tasks';
import { userKeys } from './users';

// "무엇이 바뀌면 무엇을 다시 불러오는가"의 약속. 빠뜨리면 HUD와 창의 숫자가 어긋난다.

describe('invalidateLectureProgress', () => {
    it('강의 수강률이 바뀌면 강의 조회 전부와 과제 목록이 낡는다. 내 정보는 그대로다', async () => {
        const qc = new QueryClient();
        qc.setQueryData(userKeys.me, {});
        qc.setQueryData(lectureKeys.dashboard(), {});
        qc.setQueryData([...lectureKeys.all, 'detail', 3], {});
        qc.setQueryData(taskKeys.list(), []);

        await invalidateLectureProgress(qc);

        const stale = qc.getQueryCache().getAll().filter((q) => q.state.isInvalidated).map((q) => JSON.stringify(q.queryKey)).sort();
        expect(stale).toEqual(['["lectures","dashboard"]', '["lectures","detail",3]', '["tasks","list"]']);
    });
});
