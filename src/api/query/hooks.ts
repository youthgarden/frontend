import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../endpoints';
import type { ProgressRequest } from '../types';
import { keys, queries } from './queries';

// 화면이 쓰는 훅. 조회는 "불러오는 중 / 실패 / 값"을, 변경은 "보내는 중 / 실패"를 돌려준다.
// 값을 바꾸는 훅은 성공한 뒤 그 값에 기대는 조회를 낡은 것으로 표시한다(invalidate).
// 그러면 그 조회를 보고 있는 화면(HUD, 대시보드 ...)이 알아서 다시 불러온다. 화면끼리 "다시 불러와"를 주고받지 않는다.

// ── 조회 ──
export const useJobs = () => useQuery(queries.jobs());
/**
 * 화면을 열 때 반드시 최신 값을 받게 하는 옵션. 저장해 둔 값을 먼저 보여 주고 뒤에서 새로 받는다.
 * 수강률이나 통과 여부처럼 방금 바뀌었을 수 있는 값을 보여 주는 창에 쓴다.
 */
export const FRESH_ON_OPEN = { refetchOnMount: 'always' } as const;

export const useLectures = (enabled = true) => useQuery({ ...queries.lectures(), enabled });
export const useLecture = (id: number) => useQuery(queries.lecture(id));
export const useTasks = (enabled = true) => useQuery({ ...queries.tasks(), enabled });
export const useTask = (id: number) => useQuery(queries.task(id));
export const useCurrentAttempt = () => useQuery(queries.currentAttempt());
export const useAttempts = (params: Parameters<typeof queries.attempts>[0] = {}) => useQuery(queries.attempts(params));
/** 응시 결과. 채점 중이면 2초마다 다시 묻는다 */
export const useAttempt = (id: number) => useQuery(queries.attempt(id));
export const useMessages = (id: number) => useQuery(queries.messages(id));

// ── 무엇이 바뀌면 무엇이 낡는가 ──
// 서버의 규칙을 옮긴 것이다. 한 곳에 모아 두어야 빠뜨리지 않는다.

/** 강의 수강률이 바뀌었다 → 강의 조회, 그리고 과제의 "응시 가능" 여부 */
export function invalidateLectureProgress(qc: QueryClient) {
    return Promise.all([
        qc.invalidateQueries({ queryKey: keys.lectures.all }),
        qc.invalidateQueries({ queryKey: keys.tasks.all }),
    ]);
}

/** 응시가 생기거나 없어지거나 채점됐다 → 응시 조회, 과제의 통과 여부와 최고 점수, 내 레벨 */
export function invalidateAttempts(qc: QueryClient) {
    return Promise.all([
        qc.invalidateQueries({ queryKey: keys.attempts.all }),
        qc.invalidateQueries({ queryKey: keys.tasks.all }),
        qc.invalidateQueries({ queryKey: keys.me }),
    ]);
}

// ── 변경 ──

/** 시청 기록 보고. 수강 완료가 되면 강의와 과제 조회를 낡은 것으로 표시한다 */
export function useReportProgress(lectureId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (body: ProgressRequest) => api.reportProgress(lectureId, body),
        onSuccess: (res) => {
            // 10초마다 오는 보고라서, 매번 전부 다시 부르지 않고 완료된 순간에만 표시한다
            if (res.just_completed) void invalidateLectureProgress(qc);
        },
    });
}

export function useStartAttempt() {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (taskId: number) => api.startAttempt(taskId), onSuccess: () => invalidateAttempts(qc) });
}

export function useGiveUp() {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (attemptId: number) => api.giveUp(attemptId), onSuccess: () => invalidateAttempts(qc) });
}

export function useSubmit(attemptId: number) {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (answer: string) => api.submit(attemptId, answer), onSuccess: () => invalidateAttempts(qc) });
}

export function useRegrade(attemptId: number) {
    const qc = useQueryClient();
    return useMutation({ mutationFn: () => api.regrade(attemptId), onSuccess: () => invalidateAttempts(qc) });
}

/** AI에게 질문. 성공하면 대화 기록 조회에 두 메시지를 이어 붙인다 (다시 불러오지 않는다) */
export function useSendMessage(attemptId: number) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (content: string) => api.sendMessage(attemptId, content),
        onSuccess: (res) => {
            qc.setQueryData(keys.attempts.messages(attemptId), (old: typeof res.user_message[] | undefined) =>
                old ? [...old, res.user_message, res.assistant_message] : old);
        },
    });
}

export function useMarkTutorialSeen() {
    const qc = useQueryClient();
    return useMutation({ mutationFn: () => api.markTutorialSeen(), onSuccess: (me) => qc.setQueryData(keys.me, me) });
}
