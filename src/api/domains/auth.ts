import { http, type RequestOptions } from '../client';
import type { LoginRequest, SignupRequest, SignupResponse, TokenResponse } from '../types';

// 인증 (명세 2절). 배우는 쪽, 담당: 조가을

/** 로그인, 가입, 로그아웃의 401은 토큰 만료가 아니다. 재발급을 시도하지 않는다 */
const NO_AUTH: RequestOptions = { auth: false };

export const authApi = {
    signup: (body: SignupRequest, o?: RequestOptions) => http.post<SignupResponse>('/auth/signup', body, { ...o, ...NO_AUTH }),
    login: (body: LoginRequest, o?: RequestOptions) => http.post<TokenResponse>('/auth/login', body, { ...o, ...NO_AUTH }),
    logout: (o?: RequestOptions) => http.post<null>('/auth/logout', undefined, { ...o, ...NO_AUTH }),
};
