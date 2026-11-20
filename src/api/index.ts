// API 모듈의 입구. 화면은 여기에서만 가져다 쓴다.
//
//   import { api, isApiError, errorMessage, useLectures } from '../../api';
//
// 사용법과 새 API를 더하는 방법은 docs/api-module.md에 있다.

// 명세의 API를 부르는 함수
export { api } from './endpoints';
export type { AttemptListParams } from './endpoints';

// 실패 다루기
export { ApiError, errorMessage, isAborted, isApiError } from './core/errors';

// 로그인 상태 (세션과 멀티플레이 연결이 쓴다)
export {
    API_BASE, getAccessToken, notifySessionLost, refreshAccessToken, request, setAccessToken, setSessionLostHandler,
} from './client';
export type { RequestOptions } from './client';

// React에서 쓰는 조회와 변경
export { keys, queries, GRADING_POLL_MS } from './query/queries';
export { createQueryClient } from './query/queryClient';
export * from './query/hooks';

// 응답 타입
export type * from './types';
