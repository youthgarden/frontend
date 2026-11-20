import {
    infiniteQueryOptions, queryOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient,
} from '@tanstack/react-query';
import { useRef } from 'react';
import { http, type RequestOptions } from '../client';
import { isApiError } from '../core/errors';
import { FRESH_ON_OPEN, NEVER_CACHE } from '../query/options';
import type {
    AttemptEventType, AttemptInProgress, AttemptList, AttemptResult, AttemptStatus, ChatMessage, CurrentAttempt,
    SendMessageResponse,
} from '../types';
import { taskKeys } from './tasks';
import { userKeys } from './users';

// 응시 (명세 7절). 검증받는 쪽, 담당: 김균호
//
// 조심할 것 (명세 7절):
// - GET /attempts/current는 부를 때마다 서버가 자동 제출을 처리한다. 조회처럼 보이지만 결과를 저장해 두지 않는다.
// - GET /attempts/{id}의 first_view는 채점이 끝난 결과를 처음 조회한 응답에만 true다. 같은 조회를 다시 불러오면
//   false로 바뀌므로, 화면은 이 값을 저장소에서 꺼내 보지 않고 응답을 받는 순간 알림(onFirstView)으로 받는다.
// - 응시가 생기거나 없어지거나 제출되거나 채점되면 과제 목록(통과 여부, 최고 점수)과 내 정보(레벨)도 낡는다.
//
// 답안 저장과 행동 기록은 훅이 없다. 시험 화면의 자동 저장(입력이 멈추면 저장, 실패하면 간격을 늘려 다시 시도)과
// 행동 기록(실패해도 알리지 않음)이 attemptApi를 직접 부른다. 두 요청은 어떤 조회도 낡게 하지 않는다.

/** AI의 답은 오래 걸릴 수 있다 */
const AI_TIMEOUT_MS = 60_000;

export interface AttemptListParams { task_id?: number; page?: number; size?: number }

export const attemptApi = {
    startAttempt: (taskId: number, o?: RequestOptions) => http.post<AttemptInProgress>('/attempts', { task_id: taskId }, o),
    /** 풀던 시험도, 안 본 결과도 없으면 null (204) */
    currentAttempt: (o?: RequestOptions) => http.get<CurrentAttempt>('/attempts/current', o),
    attempts: (params: AttemptListParams = {}, o?: RequestOptions) =>
        http.get<AttemptList>('/attempts', { ...o, query: { ...params } }),
    attempt: (id: number, o?: RequestOptions) => http.get<AttemptResult>(`/attempts/${id}`, o),
    giveUp: (id: number, o?: RequestOptions) => http.delete<null>(`/attempts/${id}`, o),
    sendMessage: (id: number, content: string, o?: RequestOptions) =>
        http.post<SendMessageResponse>(`/attempts/${id}/messages`, { content }, { timeoutMs: AI_TIMEOUT_MS, ...o }),
    messages: (id: number, o?: RequestOptions) => http.get<ChatMessage[]>(`/attempts/${id}/messages`, o),
    saveAnswer: (id: number, content: string, o?: RequestOptions) =>
        http.put<{ saved_at: string }>(`/attempts/${id}/answer`, { content }, o),
    recordEvent: (id: number, type: AttemptEventType, payload?: Record<string, unknown>, o?: RequestOptions) =>
        http.post<null>(`/attempts/${id}/events`, { type, payload }, o),
    submit: (id: number, answer: string, o?: RequestOptions) =>
        http.post<{ id: number; status: AttemptStatus }>(`/attempts/${id}/submit`, { answer }, o),
    regrade: (id: number, o?: RequestOptions) =>
        http.post<{ id: number; status: AttemptStatus }>(`/attempts/${id}/regrade`, undefined, o),
};

/**
 * 풀고 있는 응시와, 응답을 받은 순간의 단조 시계 값(performance.now()).
 * 남은 시간은 "서버가 준 remaining_sec - 받은 뒤 흐른 시간"으로 센다 (명세 7절 시간 규칙).
 * 받은 순간을 화면이 그린 뒤에 재면 그만큼 늦으므로, 응답이 오자마자 여기서 잰다.
 */
export interface TimedAttempt { attempt: AttemptInProgress; receivedAt: number }

/** GET /attempts/current의 응답과 받은 순간 */
export interface TimedCurrentAttempt { current: CurrentAttempt; receivedAt: number }

/** 이름표. attemptKeys.all은 응시에 관한 조회 전부다 */
export const attemptKeys = {
    all: ['attempts'] as const,
    current: () => [...attemptKeys.all, 'current'] as const,
    lists: () => [...attemptKeys.all, 'list'] as const,
    list: (size: number) => [...attemptKeys.lists(), { size }] as const,
    detail: (id: number) => [...attemptKeys.all, 'detail', id] as const,
    messages: (id: number) => [...attemptKeys.all, 'messages', id] as const,
};

/** 채점을 기다릴 때 결과를 다시 묻는 간격 (명세 7절 POST /attempts/{id}/submit) */
export const RESULT_POLL_MS = 2000;

/**
 * 응시 결과를 다시 물을 간격. 채점 중(GRADING)일 때만 2초마다 묻고, 채점이 끝나면 멈춘다.
 * 묻다가 실패하면 잠깐 끊긴 것일 수 있으니 간격을 늘려 가며(최대 10초) 계속 묻는다.
 * 단, 응시가 없으면(ATTEMPT_NOT_FOUND) 멈추고, 이미 채점이 끝난 결과를 보는 중이면 다시 묻지 않는다.
 */
export function resultPollInterval(query: {
    state: { data: AttemptResult | undefined; status: string; error: unknown; fetchFailureCount: number };
}): number | false {
    const { data, status, error, fetchFailureCount } = query.state;
    if (data && data.status !== 'GRADING') return false;
    if (status === 'error') {
        if (isApiError(error, 'ATTEMPT_NOT_FOUND')) return false;
        return RESULT_POLL_MS * Math.min(fetchFailureCount + 1, 5);
    }
    return data?.status === 'GRADING' ? RESULT_POLL_MS : false;
}

/** 지난 결과의 다음 쪽. 다 불렀으면 undefined */
export function nextAttemptPage(last: AttemptList): number | undefined {
    return last.page * last.size < last.total ? last.page + 1 : undefined;
}

export const attemptQueries = {
    /** 풀던 시험이나 안 본 결과. 부를 때마다 서버가 자동 제출을 처리하므로 저장해 두지 않는다 */
    current: () =>
        queryOptions({
            queryKey: attemptKeys.current(),
            queryFn: async ({ signal }): Promise<TimedCurrentAttempt> => {
                const current = await attemptApi.currentAttempt({ signal });
                return { current, receivedAt: performance.now() };
            },
            ...NEVER_CACHE,
        }),
    /** 지난 결과. 최신순으로 size개씩 이어 붙인다 */
    list: (size: number) =>
        infiniteQueryOptions({
            queryKey: attemptKeys.list(size),
            queryFn: ({ pageParam, signal }) => attemptApi.attempts({ page: pageParam, size }, { signal }),
            initialPageParam: 1,
            getNextPageParam: nextAttemptPage,
        }),
    /**
     * 응시 결과. 채점 중이면 2초마다 다시 묻는다.
     *
     * onFirstView는 first_view: true인 응답을 받은 순간 부른다. 저장소에 남는 값은 나중 응답(false)으로 덮일 수 있다.
     * 같은 이유로 signal을 쓰지 않는다. signal을 쓰면 StrictMode가 화면을 한 번 떼었다 붙일 때 저장소가 첫 요청을 끊는데,
     * 서버는 그 요청에서 이미 "봤음"을 기록했을 수 있어 first_view: true를 영영 받지 못한다.
     * 끊지 않은 요청은 끝까지 와서 onFirstView를 부르고, 다시 붙은 화면은 같은 요청의 결과를 받는다.
     */
    detail: (id: number, onFirstView?: (result: AttemptResult) => void) =>
        queryOptions({
            queryKey: attemptKeys.detail(id),
            queryFn: async ({ client, queryKey }) => {
                const before = client.getQueryData<AttemptResult>(queryKey)?.status;
                const result = await attemptApi.attempt(id);
                if (result.first_view) onFirstView?.(result);
                // 채점이 끝난 것을 지금 알았다. 이 조회 자신은 빼고 낡았다고 표시한다 (자신을 넣으면 끝없이 다시 부른다)
                if (result.first_view || (before === 'GRADING' && result.status !== 'GRADING')) void invalidateGradingDone(client);
                return result;
            },
            refetchInterval: resultPollInterval,
            // 다른 탭을 보고 있어도 채점 결과를 계속 확인한다
            refetchIntervalInBackground: true,
        }),
    messages: (id: number) =>
        queryOptions({ queryKey: attemptKeys.messages(id), queryFn: ({ signal }) => attemptApi.messages(id, { signal }) }),
};

/**
 * 응시가 생기거나 없어지거나 제출되거나 다시 채점에 들어갔다고 알린다.
 * 응시 조회 전부, 과제 목록(통과 여부, 최고 점수), 내 정보(레벨)가 낡는다.
 */
export function invalidateAttemptChange(qc: QueryClient) {
    return Promise.all([
        qc.invalidateQueries({ queryKey: attemptKeys.all }),
        qc.invalidateQueries({ queryKey: taskKeys.all }),
        qc.invalidateQueries({ queryKey: userKeys.me }),
    ]);
}

/**
 * 결과를 묻다가 채점이 끝난 것을 알았다. 그 결과 조회 자신을 뺀 나머지가 낡는다:
 * 지난 결과 목록(점수), 과제 목록(통과 여부, 최고 점수), 내 정보(레벨).
 */
export function invalidateGradingDone(qc: QueryClient) {
    return Promise.all([
        qc.invalidateQueries({ queryKey: attemptKeys.lists() }),
        qc.invalidateQueries({ queryKey: taskKeys.all }),
        qc.invalidateQueries({ queryKey: userKeys.me }),
    ]);
}

// ── 조회 훅 ──

/** 시험관에게 말을 걸 때마다 새로 묻는다 */
export const useCurrentAttempt = () => useQuery(attemptQueries.current());

/** 지난 결과 목록. 방금 채점이 끝났을 수 있으므로 창을 열 때마다 최신 값을 받는다 */
export const useAttemptHistory = (size: number) => useInfiniteQuery({ ...attemptQueries.list(size), ...FRESH_ON_OPEN });

/**
 * 응시 결과. 채점 중이면 2초마다 다시 묻고, 화면이 닫히면 멈춘다.
 * onFirstView는 처음 보는 결과(first_view: true)를 받은 순간 한 번 불린다. 레벨업 연출은 이것으로만 정한다.
 */
export function useAttemptResult(id: number, onFirstView?: (result: AttemptResult) => void) {
    const ref = useRef(onFirstView);
    ref.current = onFirstView;
    return useQuery({ ...attemptQueries.detail(id, (r) => ref.current?.(r)), ...FRESH_ON_OPEN });
}

/** 대화 기록 */
export const useAttemptMessages = (id: number) => useQuery(attemptQueries.messages(id));

// ── 변경 훅 ──
// 값을 바꾸는 요청은 다시 보내지 않는다 (HTTP 클라이언트와 저장소의 기본값). 두 번 처리될 수 있기 때문이다.
// 낡음 표시는 기다리지 않는다. 기다리면 다시 불러오기가 끝날 때까지 화면이 다음으로 넘어가지 못한다.
// 실패해도 표시한다. 409(이미 제출됨 등)는 그사이 서버의 응시가 바뀌었다는 뜻이다.

function setResultStatus(qc: QueryClient, res: { id: number; status: AttemptStatus }) {
    qc.setQueryData<AttemptResult>(attemptKeys.detail(res.id), (d) => (d ? { ...d, status: res.status } : d));
}

/** 시험 시작. 받은 순간의 단조 시계 값을 함께 돌려준다 */
export function useStartAttempt() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: async (taskId: number): Promise<TimedAttempt> => {
            const attempt = await attemptApi.startAttempt(taskId);
            return { attempt, receivedAt: performance.now() };
        },
        onSettled: () => {
            void invalidateAttemptChange(qc);
        },
    });
}

/** 포기하기. 응시와 딸린 기록이 지워진다 */
export function useGiveUpAttempt() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => attemptApi.giveUp(id),
        onSettled: () => {
            void invalidateAttemptChange(qc);
        },
    });
}

/** AI에게 질문. 대화 기록이 낡는다 */
export function useSendMessage(attemptId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (content: string) => attemptApi.sendMessage(attemptId, content),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: attemptKeys.messages(attemptId) });
        },
    });
}

/** 제출 */
export function useSubmitAttempt() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, answer }: { id: number; answer: string }) => attemptApi.submit(id, answer),
        onSuccess: (res) => setResultStatus(qc, res),
        onSettled: () => {
            void invalidateAttemptChange(qc);
        },
    });
}

/** 채점에 실패한 응시를 다시 채점. 성공하면 보고 있던 결과가 바로 "채점 중"으로 바뀐다 */
export function useRegradeAttempt() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => attemptApi.regrade(id),
        onSuccess: (res) => setResultStatus(qc, res),
        onSettled: () => {
            void invalidateAttemptChange(qc);
        },
    });
}
