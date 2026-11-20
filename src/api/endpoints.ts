import { request } from './client';
import type {
    AttemptEventType, AttemptInProgress, AttemptList, AttemptResult, AttemptStatus, ChatMessage, CurrentAttempt,
    Job, LectureDashboard, LectureDetail, LoginRequest, Me, ProgressRequest, ProgressResponse,
    SendMessageResponse, SignupRequest, SignupResponse, TaskDetail, TaskSummary, TokenResponse,
} from './types';

// 명세서 11절 "전체 목록"과 1:1로 맞춘 함수들. 화면은 fetch를 직접 부르지 않고 이 함수만 쓴다.

export const api = {
    // 인증
    signup: (body: SignupRequest) => request<SignupResponse>('POST', '/auth/signup', body),
    login: (body: LoginRequest) => request<TokenResponse>('POST', '/auth/login', body),
    logout: () => request<null>('POST', '/auth/logout'),

    // 직무, 회원
    jobs: () => request<Job[]>('GET', '/jobs'),
    me: () => request<Me>('GET', '/users/me'),
    markTutorialSeen: () => request<Me>('PATCH', '/users/me', { tutorial_seen: true }),

    // 강의
    lectures: () => request<LectureDashboard>('GET', '/lectures'),
    lecture: (id: number) => request<LectureDetail>('GET', `/lectures/${id}`),
    reportProgress: (id: number, body: ProgressRequest) =>
        request<ProgressResponse>('POST', `/lectures/${id}/progress`, body),

    // 과제
    tasks: () => request<TaskSummary[]>('GET', '/tasks'),
    task: (id: number) => request<TaskDetail>('GET', `/tasks/${id}`),

    // 응시
    startAttempt: (taskId: number) => request<AttemptInProgress>('POST', '/attempts', { task_id: taskId }),
    /** 풀던 시험도, 안 본 결과도 없으면 null (204) */
    currentAttempt: () => request<CurrentAttempt>('GET', '/attempts/current'),
    attempts: (params: { task_id?: number; page?: number; size?: number } = {}) => {
        const q = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
        const qs = q.toString();
        return request<AttemptList>('GET', `/attempts${qs ? `?${qs}` : ''}`);
    },
    attempt: (id: number) => request<AttemptResult>('GET', `/attempts/${id}`),
    giveUp: (id: number) => request<null>('DELETE', `/attempts/${id}`),
    sendMessage: (id: number, content: string) =>
        request<SendMessageResponse>('POST', `/attempts/${id}/messages`, { content }),
    messages: (id: number) => request<ChatMessage[]>('GET', `/attempts/${id}/messages`),
    saveAnswer: (id: number, content: string) =>
        request<{ saved_at: string }>('PUT', `/attempts/${id}/answer`, { content }),
    recordEvent: (id: number, type: AttemptEventType, payload?: Record<string, unknown>) =>
        request<null>('POST', `/attempts/${id}/events`, { type, payload }),
    submit: (id: number, answer: string) =>
        request<{ id: number; status: AttemptStatus }>('POST', `/attempts/${id}/submit`, { answer }),
    regrade: (id: number) => request<{ id: number; status: AttemptStatus }>('POST', `/attempts/${id}/regrade`),
};
