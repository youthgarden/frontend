import { abortedError, ApiError, errorFromResponse, networkError, timeoutError } from './errors';

// fetch를 한 겹 감싼 HTTP 클라이언트. 이 서비스의 주소나 토큰 규칙은 모른다.
// 구성은 오픈소스 ky의 방식을 따랐다: 기본값을 가진 인스턴스, 요청마다 덮어쓰는 옵션,
// 시간 제한, 안전한 요청만 다시 시도, 앞뒤에 끼워 넣는 훅.
// 라이브러리를 들이지 않고 직접 둔 이유는 docs/adr/0009에 있다.

type Primitive = string | number | boolean;
export type Query = Record<string, Primitive | null | undefined>;

export interface RequestOptions {
    /** 주소 뒤에 붙는 값. undefined와 null은 빠진다 */
    query?: Query;
    /** JSON으로 보낼 본문 */
    body?: unknown;
    /** 요청을 중간에 끊는 신호. 화면이 닫힐 때 끊는 데 쓴다 */
    signal?: AbortSignal;
    /** 이 시간 안에 응답이 없으면 TIMEOUT으로 실패한다. 0이면 제한이 없다 */
    timeoutMs?: number;
    /** 다시 시도할 횟수. false나 0이면 다시 시도하지 않는다 */
    retry?: number | false;
    /** false면 토큰을 붙이지 않고, 401을 받아도 재발급하지 않는다 */
    auth?: boolean;
    headers?: Record<string, string>;
}

export interface RetryPolicy {
    /** 다시 시도할 최대 횟수 */
    limit: number;
    /** 다시 보내도 결과가 달라지지 않는 메서드만 넣는다 */
    methods: string[];
    /** 다시 시도할 HTTP 상태 */
    statuses: number[];
    /** n번째 재시도 전에 기다릴 시간(ms). n은 1부터 */
    delayMs: (attempt: number) => number;
}

/** 로그인을 다루는 방식. 클라이언트는 토큰이 어디에 있고 어떻게 다시 받는지 모른다 */
export interface AuthStrategy {
    getToken: () => string | null;
    /** 이 실패가 토큰 만료 때문인가. true면 refresh 뒤 한 번 다시 보낸다 */
    shouldRefresh: (error: ApiError) => boolean;
    /** 토큰을 새로 받는다. 실패하면 던진다 */
    refresh: () => Promise<unknown>;
    /** 재발급까지 실패했다 */
    onSessionLost?: () => void;
}

export interface RequestContext {
    method: string;
    path: string;
    url: string;
    options: RequestOptions;
    /** 몇 번째 시도인가. 처음이 0 */
    attempt: number;
}

export interface Hooks {
    /** 보내기 직전. 헤더를 더하거나 기록을 남긴다 */
    beforeRequest?: (ctx: RequestContext, headers: Headers) => void;
    /** 성공이든 실패든 응답을 받은 직후 */
    afterResponse?: (ctx: RequestContext, res: Response) => void;
    /** 최종 실패 (다시 시도까지 끝난 뒤) */
    onError?: (ctx: RequestContext, error: ApiError) => void;
}

export interface ClientOptions {
    /** 모든 경로 앞에 붙는 주소. 예: '/api/v1' */
    baseUrl: string;
    timeoutMs?: number;
    retry?: Partial<RetryPolicy>;
    auth?: AuthStrategy;
    hooks?: Hooks;
    /** 테스트에서 바꿔 끼운다. 기본은 전역 fetch (부르는 시점에 읽는다) */
    fetch?: typeof fetch;
}

export interface HttpClient {
    request<T>(method: string, path: string, options?: RequestOptions): Promise<T>;
    get<T>(path: string, options?: RequestOptions): Promise<T>;
    post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
    delete<T>(path: string, options?: RequestOptions): Promise<T>;
    /** 기본값 일부를 바꾼 새 클라이언트. 원래 것은 그대로다 */
    extend(overrides: Partial<ClientOptions>): HttpClient;
}

const DEFAULT_RETRY: RetryPolicy = {
    limit: 2,
    // 조회만 다시 보낸다. 만들기나 제출을 다시 보내면 두 번 처리될 수 있다
    methods: ['GET'],
    statuses: [502, 503, 504],
    delayMs: (attempt) => Math.min(300 * 2 ** (attempt - 1), 3000),
};
const DEFAULT_TIMEOUT_MS = 15_000;

export function buildUrl(baseUrl: string, path: string, query?: Query) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) q.set(k, String(v));
    const qs = q.toString();
    return baseUrl + path + (qs ? `?${qs}` : '');
}

const sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
        if (signal?.aborted) return reject(abortedError());
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(abortedError());
        }, { once: true });
    });

export function createClient(config: ClientOptions): HttpClient {
    const retryPolicy: RetryPolicy = { ...DEFAULT_RETRY, ...config.retry };
    const { auth, hooks } = config;

    /** 한 번 보낸다. 시간 제한과 끊는 신호를 하나로 묶는다 */
    async function send(ctx: RequestContext): Promise<Response> {
        const { options } = ctx;
        // 이미 끊긴 요청은 보내지 않는다
        if (options.signal?.aborted) throw abortedError();
        const headers = new Headers(options.headers);
        if (options.body !== undefined) headers.set('Content-Type', 'application/json');
        const token = options.auth === false ? null : auth?.getToken();
        if (token) headers.set('Authorization', `Bearer ${token}`);
        hooks?.beforeRequest?.(ctx, headers);

        const controller = new AbortController();
        let timedOut = false;
        const timeoutMs = options.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const timer = timeoutMs > 0 ? setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeoutMs) : undefined;
        const onAbort = () => controller.abort();
        options.signal?.addEventListener('abort', onAbort, { once: true });

        try {
            const res = await (config.fetch ?? fetch)(ctx.url, {
                method: ctx.method,
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
                // 리프레시 토큰 쿠키가 인증 요청에 실려 가야 한다
                credentials: 'same-origin',
                signal: controller.signal,
            });
            hooks?.afterResponse?.(ctx, res);
            return res;
        } catch {
            if (timedOut) throw timeoutError();
            if (options.signal?.aborted) throw abortedError();
            throw networkError();
        } finally {
            clearTimeout(timer);
            options.signal?.removeEventListener('abort', onAbort);
        }
    }

    /** 다시 시도까지 포함해 보내고, 성공한 응답만 돌려준다 */
    async function sendWithRetry(method: string, path: string, options: RequestOptions): Promise<Response> {
        const url = buildUrl(config.baseUrl, path, options.query);
        const limit = options.retry === false ? 0 : options.retry ?? retryPolicy.limit;
        const retryable = retryPolicy.methods.includes(method);

        for (let attempt = 0; ; attempt++) {
            const ctx: RequestContext = { method, path, url, options, attempt };
            let error: ApiError;
            try {
                const res = await send(ctx);
                if (res.ok) return res;
                error = await errorFromResponse(res);
            } catch (e) {
                error = e instanceof ApiError ? e : networkError();
            }
            const canRetry =
                retryable && attempt < limit &&
                (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || retryPolicy.statuses.includes(error.status));
            if (!canRetry) throw error;
            await sleep(retryPolicy.delayMs(attempt + 1), options.signal);
        }
    }

    async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
        const first: RequestContext = { method, path, url: buildUrl(config.baseUrl, path, options.query), options, attempt: 0 };
        try {
            let res: Response;
            try {
                res = await sendWithRetry(method, path, options);
            } catch (e) {
                const error = e as ApiError;
                if (!auth || options.auth === false || !auth.shouldRefresh(error)) throw error;
                // 토큰이 만료됐다: 새로 받고 원래 요청을 한 번만 다시 보낸다
                try {
                    await auth.refresh();
                } catch {
                    auth.onSessionLost?.();
                    throw error;
                }
                res = await sendWithRetry(method, path, options);
            }
            if (res.status === 204) return null as T;
            return (await res.json()) as T;
        } catch (e) {
            const error = e instanceof ApiError ? e : networkError();
            hooks?.onError?.(first, error);
            throw error;
        }
    }

    return {
        request,
        get: (path, options) => request('GET', path, options),
        post: (path, body, options) => request('POST', path, { ...options, body }),
        put: (path, body, options) => request('PUT', path, { ...options, body }),
        patch: (path, body, options) => request('PATCH', path, { ...options, body }),
        delete: (path, options) => request('DELETE', path, options),
        extend: (overrides) =>
            createClient({
                ...config,
                ...overrides,
                retry: { ...config.retry, ...overrides.retry },
                hooks: { ...config.hooks, ...overrides.hooks },
            }),
    };
}
