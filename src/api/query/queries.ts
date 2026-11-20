import { queryOptions } from '@tanstack/react-query';
import { api, type AttemptListParams } from '../endpoints';

// 조회 하나하나의 "이름표(key)와 불러오는 방법"을 한 곳에 모은다.
// 화면은 useQuery(queries.lectures())처럼 쓰고, 값을 바꾼 뒤에는 keys로 그 조회를 낡은 것으로 표시한다.
// 이름표를 화면마다 문자열로 적으면 오타 하나로 화면이 갱신되지 않는다. 그래서 여기서만 만든다.
// (TanStack Query가 권하는 "query key factory + queryOptions" 방식이다.)

/**
 * 이름표. 앞부분이 같으면 한꺼번에 가리킬 수 있다.
 *   keys.lectures.all      → 강의에 관한 조회 전부 (대시보드 + 각 강의 상세)
 *   keys.lectures.detail(3) → 3번 강의 상세 하나
 */
export const keys = {
    jobs: ['jobs'] as const,
    me: ['me'] as const,
    lectures: {
        all: ['lectures'] as const,
        dashboard: () => [...keys.lectures.all, 'dashboard'] as const,
        detail: (id: number) => [...keys.lectures.all, 'detail', id] as const,
    },
    tasks: {
        all: ['tasks'] as const,
        list: () => [...keys.tasks.all, 'list'] as const,
        detail: (id: number) => [...keys.tasks.all, 'detail', id] as const,
    },
    attempts: {
        all: ['attempts'] as const,
        current: () => [...keys.attempts.all, 'current'] as const,
        list: (params: AttemptListParams = {}) => [...keys.attempts.all, 'list', params] as const,
        detail: (id: number) => [...keys.attempts.all, 'detail', id] as const,
        messages: (id: number) => [...keys.attempts.all, 'messages', id] as const,
    },
};

/** 채점 결과를 물어보는 간격 (명세 7절: 2초마다) */
export const GRADING_POLL_MS = 2000;

export const queries = {
    /** 직무 목록은 거의 바뀌지 않는다 */
    jobs: () => queryOptions({ queryKey: keys.jobs, queryFn: ({ signal }) => api.jobs({ signal }), staleTime: Infinity }),
    me: () => queryOptions({ queryKey: keys.me, queryFn: ({ signal }) => api.me({ signal }) }),

    lectures: () => queryOptions({ queryKey: keys.lectures.dashboard(), queryFn: ({ signal }) => api.lectures({ signal }) }),
    lecture: (id: number) =>
        queryOptions({ queryKey: keys.lectures.detail(id), queryFn: ({ signal }) => api.lecture(id, { signal }) }),

    tasks: () => queryOptions({ queryKey: keys.tasks.list(), queryFn: ({ signal }) => api.tasks({ signal }) }),
    task: (id: number) => queryOptions({ queryKey: keys.tasks.detail(id), queryFn: ({ signal }) => api.task(id, { signal }) }),

    /**
     * 풀던 시험이나 안 본 결과가 있는지. 부를 때마다 서버가 자동 제출을 처리하므로 (명세 7절)
     * 저장해 둔 값을 쓰지 않고 항상 새로 묻는다.
     */
    currentAttempt: () =>
        queryOptions({
            queryKey: keys.attempts.current(),
            queryFn: ({ signal }) => api.currentAttempt({ signal }),
            staleTime: 0,
            gcTime: 0,
        }),
    attempts: (params: AttemptListParams = {}) =>
        queryOptions({ queryKey: keys.attempts.list(params), queryFn: ({ signal }) => api.attempts(params, { signal }) }),
    /** 응시 결과. 채점 중이면 2초마다 다시 묻고, 채점이 끝나면 멈춘다 */
    attempt: (id: number) =>
        queryOptions({
            queryKey: keys.attempts.detail(id),
            queryFn: ({ signal }) => api.attempt(id, { signal }),
            refetchInterval: (query) => (query.state.data?.status === 'GRADING' ? GRADING_POLL_MS : false),
        }),
    messages: (id: number) =>
        queryOptions({ queryKey: keys.attempts.messages(id), queryFn: ({ signal }) => api.messages(id, { signal }) }),
};
