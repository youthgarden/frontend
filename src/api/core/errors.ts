import type { ErrorCode } from '../types';

// 통신에서 생기는 모든 실패를 한 가지 모양으로 만든다.
// 화면은 code로 갈래를 나누고 message는 그대로 보여 준다.

export class ApiError extends Error {
    constructor(
        public code: ErrorCode,
        /** 화면에 그대로 보여줘도 되는 문장 */
        message: string,
        /** HTTP 상태. 서버에 닿지 못했으면 0 */
        public status: number,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

/**
 * 이 오류가 그 코드 중 하나인지 본다. 코드를 주지 않으면 ApiError인지만 본다.
 *
 *   if (isApiError(e, 'LECTURE_NOT_COMPLETED')) { ... }
 */
export function isApiError(e: unknown, ...codes: ErrorCode[]): e is ApiError {
    return e instanceof ApiError && (codes.length === 0 || codes.includes(e.code));
}

/** 화면에 보여줄 문장을 꺼낸다. ApiError가 아니면 일반 문장을 돌려준다. */
export function errorMessage(e: unknown): string {
    if (e instanceof ApiError && e.message) return e.message;
    return '알 수 없는 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.';
}

/** 요청을 일부러 끊은 것인가 (화면이 닫혔다 등). 사용자에게 알릴 실패가 아니다 */
export function isAborted(e: unknown) {
    return isApiError(e, 'ABORTED');
}

const MESSAGES = {
    NETWORK_ERROR: '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.',
    TIMEOUT: '응답이 너무 늦어요. 잠시 뒤 다시 시도해 주세요.',
    ABORTED: '요청을 취소했어요.',
    UNKNOWN: '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    INVALID_INPUT: '입력한 내용을 다시 확인해 주세요.',
} as const;

export const networkError = () => new ApiError('NETWORK_ERROR', MESSAGES.NETWORK_ERROR, 0);
export const timeoutError = () => new ApiError('TIMEOUT', MESSAGES.TIMEOUT, 0);
export const abortedError = () => new ApiError('ABORTED', MESSAGES.ABORTED, 0);

/** 실패한 응답을 ApiError로 바꾼다. 명세의 에러 형식({"error": {"code", "message"}})을 읽는다 */
export async function errorFromResponse(res: Response): Promise<ApiError> {
    try {
        const body = await res.json();
        if (body?.error?.code) return new ApiError(body.error.code, body.error.message ?? '', res.status);
        // 422는 FastAPI 기본 형식({"detail": ...})이다
        if (res.status === 422) return new ApiError('UNKNOWN', MESSAGES.INVALID_INPUT, 422);
    } catch {
        // 본문이 JSON이 아님
    }
    return new ApiError('UNKNOWN', MESSAGES.UNKNOWN, res.status);
}
