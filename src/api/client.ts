import { createClient, type RequestOptions } from './core/createClient';
import { errorFromResponse, networkError, type ApiError } from './core/errors';
import type { TokenResponse } from './types';

// 이 서비스의 HTTP 클라이언트 하나. 모든 REST 요청이 여기를 지난다.
// 범용 부분(시간 제한, 다시 시도, 훅)은 core/createClient.ts에 있고, 여기에는 이 서비스의 규칙만 둔다.
// - 기본 주소는 /api/v1 (명세 1절)
// - 액세스 토큰은 메모리에만 둔다. 새로고침하면 사라지고 /auth/refresh로 복구한다 (명세 2절)
// - 401 TOKEN_EXPIRED를 받으면 재발급한 뒤 원래 요청을 한 번만 다시 보낸다
// - 재발급은 한 번에 하나만 보낸다. 여러 요청이 동시에 401을 받아도 같은 재발급 결과를 기다린다

export const API_BASE = '/api/v1';

export { ApiError, errorMessage, isAborted, isApiError } from './core/errors';
export type { RequestOptions } from './core/createClient';

let accessToken: string | null = null;
let refreshing: Promise<string> | null = null;
let onSessionLost: (() => void) | null = null;

export function getAccessToken() {
    return accessToken;
}
export function setAccessToken(token: string | null) {
    accessToken = token;
}
/** 재발급까지 실패해 로그인이 풀렸을 때 부를 함수를 등록한다 (세션 쪽에서 한 번 등록). */
export function setSessionLostHandler(fn: (() => void) | null) {
    onSessionLost = fn;
}
/** 로그인이 풀린 것을 알린다. REST 밖(멀티플레이 연결)에서 인증이 끝내 실패했을 때 부른다. 화면이 로그인으로 돌아간다. */
export function notifySessionLost() {
    onSessionLost?.();
}

/** 액세스 토큰을 새로 받는다. 동시에 여러 번 불려도 요청은 한 번만 나간다. */
export function refreshAccessToken(): Promise<string> {
    if (!refreshing) {
        refreshing = (async () => {
            let res: Response;
            try {
                // 재발급은 클라이언트를 거치지 않고 직접 보낸다. 거치면 재발급의 401이 또 재발급을 부른다
                res = await fetch(`${API_BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
            } catch {
                throw networkError();
            }
            if (!res.ok) {
                accessToken = null;
                throw await errorFromResponse(res);
            }
            const body = (await res.json()) as TokenResponse;
            accessToken = body.access_token;
            return body.access_token;
        })().finally(() => {
            refreshing = null;
        });
    }
    return refreshing;
}

const isTokenProblem = (e: ApiError) => e.status === 401 && (e.code === 'TOKEN_EXPIRED' || e.code === 'INVALID_TOKEN');

export const http = createClient({
    baseUrl: API_BASE,
    auth: {
        getToken: () => accessToken,
        shouldRefresh: isTokenProblem,
        refresh: refreshAccessToken,
        onSessionLost: () => onSessionLost?.(),
    },
});

/**
 * 메서드와 경로로 직접 부른다. 명세에 있는 API는 endpoints.ts의 `api`를 쓰고,
 * 이 함수는 명세 밖의 주소(모의 서버 조작판)를 부를 때만 쓴다.
 */
export function request<T>(method: string, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    // 로그인, 가입, 로그아웃의 401은 토큰 만료가 아니다. 재발급하지 않는다
    const auth = path.startsWith('/auth/') ? false : options?.auth;
    return http.request<T>(method, path, { ...options, body, auth });
}
