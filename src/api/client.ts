import type { ErrorCode, TokenResponse } from './types';

// 모든 REST 요청이 지나는 한 곳.
// - 액세스 토큰은 메모리에만 둔다 (명세: 프론트 메모리 보관). 새로고침하면 사라지고 /auth/refresh로 복구한다.
// - 401 TOKEN_EXPIRED를 받으면 재발급한 뒤 원래 요청을 한 번만 다시 보낸다.
// - 재발급은 한 번에 하나만 보낸다. 여러 요청이 동시에 401을 받아도 같은 재발급 결과를 기다린다.

export const API_BASE = '/api/v1';

export class ApiError extends Error {
    constructor(
        public code: ErrorCode,
        /** 화면에 그대로 보여줘도 되는 문장 */
        message: string,
        public status: number,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/** 화면에 보여줄 문장을 꺼낸다. ApiError가 아니면 일반 문장을 돌려준다. */
export function errorMessage(e: unknown): string {
    if (e instanceof ApiError && e.message) return e.message;
    return '알 수 없는 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';
}

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

async function parseError(res: Response): Promise<ApiError> {
    try {
        const body = await res.json();
        if (body?.error?.code) return new ApiError(body.error.code, body.error.message ?? '', res.status);
        // 422는 FastAPI 기본 형식({"detail": ...})이다
        if (res.status === 422) return new ApiError('UNKNOWN', '입력한 내용을 다시 확인해 주세요.', 422);
    } catch {
        // 본문이 JSON이 아님
    }
    return new ApiError('UNKNOWN', '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.', res.status);
}

async function send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type', 'application/json');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    try {
        // credentials: 리프레시 토큰 쿠키가 /auth 요청에 실려 가야 한다
        return await fetch(API_BASE + path, { ...init, headers, credentials: 'same-origin' });
    } catch {
        throw new ApiError('NETWORK_ERROR', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.', 0);
    }
}

/** 액세스 토큰을 새로 받는다. 동시에 여러 번 불려도 요청은 한 번만 나간다. */
export function refreshAccessToken(): Promise<string> {
    if (!refreshing) {
        refreshing = (async () => {
            const res = await send('/auth/refresh', { method: 'POST' });
            if (!res.ok) {
                accessToken = null;
                throw await parseError(res);
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

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, body: body === undefined ? undefined : JSON.stringify(body) };
    let res = await send(path, init);

    if (res.status === 401 && !path.startsWith('/auth/')) {
        const err = await parseError(res);
        if (err.code !== 'TOKEN_EXPIRED' && err.code !== 'INVALID_TOKEN') throw err;
        try {
            await refreshAccessToken();
        } catch {
            onSessionLost?.();
            throw err;
        }
        res = await send(path, init);
    }

    if (!res.ok) throw await parseError(res);
    if (res.status === 204) return null as T;
    return (await res.json()) as T;
}
