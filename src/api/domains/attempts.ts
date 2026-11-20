import { http, type RequestOptions } from '../client';
import type {
    AttemptEventType, AttemptInProgress, AttemptList, AttemptResult, AttemptStatus, ChatMessage, CurrentAttempt,
    SendMessageResponse,
} from '../types';

// 응시 (명세 7절). 담당자가 정해지면 이 파일을 맡는다.
// 조회의 이름표와 훅은 아직 없다. 시험 화면들은 아래 함수를 직접 부른다. 담당자가 필요할 때 더한다.
//
// 더할 때 조심할 것 두 가지 (명세 7절):
// - GET /attempts/current는 부를 때마다 서버가 자동 제출을 처리한다. 조회처럼 보이지만 결과를 저장해 두면 안 된다
//   (staleTime: 0, gcTime: 0).
// - 응시가 생기거나 없어지거나 채점되면 과제 목록(통과 여부, 최고 점수)과 내 정보(레벨)도 낡는다.

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
