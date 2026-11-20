import { http, type RequestOptions } from './client';
import type {
    AttemptEventType, AttemptInProgress, AttemptList, AttemptResult, AttemptStatus, ChatMessage, CurrentAttempt,
    Job, LectureDashboard, LectureDetail, LoginRequest, Me, ProgressRequest, ProgressResponse,
    SendMessageResponse, SignupRequest, SignupResponse, TaskDetail, TaskSummary, TokenResponse,
} from './types';

// 명세서 11절 "전체 목록"과 1:1로 맞춘 함수들. 화면은 fetch를 직접 부르지 않고 이 함수만 쓴다.
// 모든 함수의 마지막 인자는 요청 옵션이다. 화면이 닫힐 때 요청을 끊으려면 { signal }을 넘긴다.
//
// 새 API를 더할 때: 1) types.ts에 응답 타입, 2) 여기에 함수 한 줄, 3) 조회라면 query/queries.ts에 한 줄.

type Opt = RequestOptions;

/** 로그인, 가입, 로그아웃의 401은 토큰 만료가 아니다. 재발급을 시도하지 않는다 */
const NO_AUTH: Opt = { auth: false };
/** AI의 답은 오래 걸릴 수 있다 */
const AI_TIMEOUT_MS = 60_000;

export interface AttemptListParams { task_id?: number; page?: number; size?: number }

export const api = {
    // 인증
    signup: (body: SignupRequest, o?: Opt) => http.post<SignupResponse>('/auth/signup', body, { ...o, ...NO_AUTH }),
    login: (body: LoginRequest, o?: Opt) => http.post<TokenResponse>('/auth/login', body, { ...o, ...NO_AUTH }),
    logout: (o?: Opt) => http.post<null>('/auth/logout', undefined, { ...o, ...NO_AUTH }),

    // 직무, 회원
    jobs: (o?: Opt) => http.get<Job[]>('/jobs', o),
    me: (o?: Opt) => http.get<Me>('/users/me', o),
    markTutorialSeen: (o?: Opt) => http.patch<Me>('/users/me', { tutorial_seen: true }, o),

    // 강의
    lectures: (o?: Opt) => http.get<LectureDashboard>('/lectures', o),
    lecture: (id: number, o?: Opt) => http.get<LectureDetail>(`/lectures/${id}`, o),
    reportProgress: (id: number, body: ProgressRequest, o?: Opt) =>
        http.post<ProgressResponse>(`/lectures/${id}/progress`, body, o),

    // 과제
    tasks: (o?: Opt) => http.get<TaskSummary[]>('/tasks', o),
    task: (id: number, o?: Opt) => http.get<TaskDetail>(`/tasks/${id}`, o),

    // 응시
    startAttempt: (taskId: number, o?: Opt) => http.post<AttemptInProgress>('/attempts', { task_id: taskId }, o),
    /** 풀던 시험도, 안 본 결과도 없으면 null (204) */
    currentAttempt: (o?: Opt) => http.get<CurrentAttempt>('/attempts/current', o),
    attempts: (params: AttemptListParams = {}, o?: Opt) => http.get<AttemptList>('/attempts', { ...o, query: { ...params } }),
    attempt: (id: number, o?: Opt) => http.get<AttemptResult>(`/attempts/${id}`, o),
    giveUp: (id: number, o?: Opt) => http.delete<null>(`/attempts/${id}`, o),
    sendMessage: (id: number, content: string, o?: Opt) =>
        http.post<SendMessageResponse>(`/attempts/${id}/messages`, { content }, { timeoutMs: AI_TIMEOUT_MS, ...o }),
    messages: (id: number, o?: Opt) => http.get<ChatMessage[]>(`/attempts/${id}/messages`, o),
    saveAnswer: (id: number, content: string, o?: Opt) =>
        http.put<{ saved_at: string }>(`/attempts/${id}/answer`, { content }, o),
    recordEvent: (id: number, type: AttemptEventType, payload?: Record<string, unknown>, o?: Opt) =>
        http.post<null>(`/attempts/${id}/events`, { type, payload }, o),
    submit: (id: number, answer: string, o?: Opt) =>
        http.post<{ id: number; status: AttemptStatus }>(`/attempts/${id}/submit`, { answer }, o),
    regrade: (id: number, o?: Opt) => http.post<{ id: number; status: AttemptStatus }>(`/attempts/${id}/regrade`, undefined, o),
};
