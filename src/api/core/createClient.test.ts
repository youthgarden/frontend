import { describe, expect, it, vi } from 'vitest';
import { buildUrl, createClient, type ClientOptions } from './createClient';
import { ApiError, isApiError } from './errors';

// 범용 HTTP 클라이언트의 약속: 주소 만들기, 시간 제한, 끊기, 다시 시도, 훅.
// 다시 시도를 잘못하면 제출이 두 번 가고, 끊기를 잘못하면 닫힌 화면이 값을 바꾼다.

const json = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type FetchArgs = { url: string; init: RequestInit };

function setup(handler: (a: FetchArgs, n: number) => Response | Promise<Response>, options: Partial<ClientOptions> = {}) {
    const calls: FetchArgs[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
        const args = { url: String(url), init };
        calls.push(args);
        return handler(args, calls.length);
    }) as unknown as typeof fetch;
    const client = createClient({ baseUrl: '/api/v1', fetch: fetchMock, retry: { delayMs: () => 0 }, ...options });
    return { client, calls };
}

/** 끊는 신호를 받을 때까지 응답하지 않는 fetch */
const never = ({ init }: FetchArgs) =>
    new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });

describe('buildUrl', () => {
    it('값이 없는 항목은 주소에 넣지 않는다', () => {
        expect(buildUrl('/api/v1', '/attempts', { task_id: 3, page: undefined, size: null })).toBe('/api/v1/attempts?task_id=3');
        expect(buildUrl('/api/v1', '/attempts', {})).toBe('/api/v1/attempts');
    });

    it('값을 주소에 맞게 바꿔 넣는다', () => {
        expect(buildUrl('', '/x', { q: 'a b&c', on: false, n: 0 })).toBe('/x?q=a+b%26c&on=false&n=0');
    });
});

describe('createClient', () => {
    it('본문을 JSON으로 보내고 응답을 풀어 돌려준다', async () => {
        const { client, calls } = setup(() => json(201, { id: 7 }));
        await expect(client.post('/attempts', { task_id: 1 })).resolves.toEqual({ id: 7 });
        expect(calls[0].url).toBe('/api/v1/attempts');
        expect(calls[0].init.method).toBe('POST');
        expect(calls[0].init.body).toBe('{"task_id":1}');
        expect(new Headers(calls[0].init.headers).get('Content-Type')).toBe('application/json');
    });

    it('204는 null로 돌려준다', async () => {
        const { client } = setup(() => json(204));
        await expect(client.delete('/attempts/1')).resolves.toBeNull();
    });

    it('명세의 에러 형식을 ApiError로 바꾼다', async () => {
        const { client } = setup(() => json(409, { error: { code: 'ATTEMPT_ALREADY_IN_PROGRESS', message: '풀던 시험이 있어요.' } }));
        const e = await client.post('/attempts', {}).catch((x) => x);
        expect(isApiError(e, 'ATTEMPT_ALREADY_IN_PROGRESS')).toBe(true);
        expect(isApiError(e, 'TASK_NOT_FOUND')).toBe(false);
        expect(e).toMatchObject({ status: 409, message: '풀던 시험이 있어요.' });
    });

    describe('다시 시도', () => {
        it('조회는 서버가 잠시 답하지 못하면 다시 보낸다', async () => {
            const { client, calls } = setup((_, n) => (n < 3 ? json(503) : json(200, { ok: true })));
            await expect(client.get('/lectures')).resolves.toEqual({ ok: true });
            expect(calls).toHaveLength(3);
        });

        it('정해진 횟수를 넘으면 마지막 실패를 던진다', async () => {
            const { client, calls } = setup(() => json(503));
            await expect(client.get('/lectures')).rejects.toMatchObject({ status: 503 });
            expect(calls).toHaveLength(3); // 처음 1번 + 다시 2번
        });

        it('만들기나 제출은 다시 보내지 않는다. 두 번 처리될 수 있다', async () => {
            const { client, calls } = setup(() => json(503));
            await expect(client.post('/attempts/1/submit', { answer: '' })).rejects.toBeInstanceOf(ApiError);
            expect(calls).toHaveLength(1);
        });

        it('요청이 잘못된 경우(4xx)는 다시 보내지 않는다', async () => {
            const { client, calls } = setup(() => json(404, { error: { code: 'LECTURE_NOT_FOUND', message: '' } }));
            await expect(client.get('/lectures/99')).rejects.toMatchObject({ code: 'LECTURE_NOT_FOUND' });
            expect(calls).toHaveLength(1);
        });

        it('요청마다 끌 수 있다', async () => {
            const { client, calls } = setup(() => json(503));
            await expect(client.get('/lectures', { retry: false })).rejects.toBeInstanceOf(ApiError);
            expect(calls).toHaveLength(1);
        });
    });

    describe('시간 제한과 끊기', () => {
        it('시간 안에 응답이 없으면 TIMEOUT으로 실패한다', async () => {
            const { client } = setup(never);
            await expect(client.post('/slow', {}, { timeoutMs: 20 })).rejects.toMatchObject({ code: 'TIMEOUT' });
        });

        it('신호로 끊으면 ABORTED로 실패하고 다시 보내지 않는다', async () => {
            const { client, calls } = setup(never);
            const controller = new AbortController();
            const pending = client.get('/lectures', { signal: controller.signal });
            controller.abort();
            await expect(pending).rejects.toMatchObject({ code: 'ABORTED' });
            expect(calls).toHaveLength(1);
        });

        it('이미 끊긴 신호로 부르면 바로 실패한다', async () => {
            const { client } = setup(never);
            await expect(client.get('/lectures', { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'ABORTED' });
        });
    });

    describe('로그인', () => {
        const expired = () => json(401, { error: { code: 'TOKEN_EXPIRED', message: '' } });
        const auth = (token: { value: string }, refresh: () => Promise<unknown>, onSessionLost = vi.fn()) => ({
            getToken: () => token.value,
            shouldRefresh: (e: ApiError) => e.code === 'TOKEN_EXPIRED',
            refresh,
            onSessionLost,
        });

        it('토큰을 붙이고, 만료되면 새로 받아 한 번 다시 보낸다', async () => {
            const token = { value: 'old' };
            const refresh = vi.fn(async () => {
                token.value = 'new';
            });
            const { client, calls } = setup(({ init }) =>
                new Headers(init.headers).get('Authorization') === 'Bearer new' ? json(200, { ok: true }) : expired(),
                { auth: auth(token, refresh) });
            await expect(client.post('/attempts', {})).resolves.toEqual({ ok: true });
            expect(refresh).toHaveBeenCalledTimes(1);
            expect(calls).toHaveLength(2);
        });

        it('auth: false면 토큰을 붙이지 않고 재발급도 하지 않는다', async () => {
            const refresh = vi.fn(async () => {});
            const { client, calls } = setup(expired, { auth: auth({ value: 'old' }, refresh) });
            await expect(client.post('/auth/login', {}, { auth: false })).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
            expect(new Headers(calls[0].init.headers).has('Authorization')).toBe(false);
            expect(refresh).not.toHaveBeenCalled();
        });

        it('재발급이 실패하면 로그인이 풀렸다고 알린다', async () => {
            const lost = vi.fn();
            const { client } = setup(expired, { auth: auth({ value: 'old' }, () => Promise.reject(new Error('no')), lost) });
            await expect(client.get('/users/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
            expect(lost).toHaveBeenCalledTimes(1);
        });
    });

    describe('훅과 확장', () => {
        it('보내기 전, 응답 뒤, 최종 실패 때 훅을 부른다', async () => {
            const seen: string[] = [];
            const { client } = setup((_, n) => (n === 1 ? json(200, {}) : json(500)), {
                hooks: {
                    beforeRequest: (ctx, headers) => {
                        headers.set('X-Trace', 'abc');
                        seen.push(`before ${ctx.method} ${ctx.path}`);
                    },
                    afterResponse: (_ctx, res) => seen.push(`after ${res.status}`),
                    onError: (_ctx, e) => seen.push(`error ${e.status}`),
                },
            });
            await client.get('/a');
            await client.post('/b', {}).catch(() => {});
            expect(seen).toEqual(['before GET /a', 'after 200', 'before POST /b', 'after 500', 'error 500']);
        });

        it('extend는 기본값을 바꾼 새 클라이언트를 만들고 원래 것은 그대로 둔다', async () => {
            const { client, calls } = setup(() => json(200, {}));
            await client.extend({ baseUrl: '/api/v2' }).get('/x');
            await client.get('/x');
            expect(calls.map((c) => c.url)).toEqual(['/api/v2/x', '/api/v1/x']);
        });
    });
});
