// HTTP 도우미: 에러 형식, 입력 검증(FastAPI 422 형식 흉내), 본문 읽기, 응답 쓰기.

import type { IncomingMessage, ServerResponse } from 'node:http';

/** 명세 1절 에러 형식 {"error":{"code","message"}} */
export class HttpError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
    }
}

export interface Issue {
    type: string;
    loc: (string | number)[];
    msg: string;
    input: unknown;
    ctx?: Record<string, unknown>;
}

/** 422. FastAPI 기본 형식 {"detail":[...]} */
export class ValidationError extends Error {
    constructor(public detail: Issue[]) {
        super('validation');
    }
}

export const MESSAGES = {
    INVALID_CREDENTIALS: '아이디 또는 비밀번호가 맞지 않아요.',
    TOKEN_EXPIRED: '로그인이 만료됐어요. 다시 시도해 주세요.',
    INVALID_TOKEN: '로그인 정보가 올바르지 않아요. 다시 로그인해 주세요.',
    INVALID_REFRESH_TOKEN: '로그인이 만료됐어요. 다시 로그인해 주세요.',
    LOGIN_ID_TAKEN: '이미 쓰고 있는 아이디예요. 다른 아이디를 입력해 주세요.',
    INVALID_JOB: '선택할 수 없는 직무예요.',
    LECTURE_NOT_FOUND: '강의를 찾을 수 없어요.',
    TASK_NOT_FOUND: '과제를 찾을 수 없어요.',
    ATTEMPT_NOT_FOUND: '시험 기록을 찾을 수 없어요.',
    LECTURE_NOT_COMPLETED: '이 과제는 필수 강의를 먼저 들어야 볼 수 있어요.',
    ATTEMPT_NOT_IN_PROGRESS: '이미 끝난 시험이에요.',
    ATTEMPT_ALREADY_IN_PROGRESS: '풀던 시험이 있어요. 이어 풀거나 포기한 뒤 새 시험을 시작해 주세요.',
    ATTEMPT_TIME_OVER: '제한 시간이 지났어요. 지금 답안으로 제출해 주세요.',
    ATTEMPT_NOT_REGRADABLE: '다시 채점할 수 있는 상태가 아니에요.',
    AI_UNAVAILABLE: 'AI가 잠시 답하지 못했어요. 다시 시도해 주세요.',
} as const;

export type Code = keyof typeof MESSAGES;

export function fail(status: number, code: Code): never {
    throw new HttpError(status, code, MESSAGES[code]);
}

export interface Reply {
    status: number;
    body?: unknown;
    headers?: Record<string, string | string[]>;
}

/** ISO 8601 UTC, 끝에 Z. 밀리초는 뺀다 (명세 예: 2026-11-20T03:00:00Z) */
export function iso(ms: number): string;
export function iso(ms: number | null): string | null;
export function iso(ms: number | null) {
    return ms === null ? null : new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const MAX_BODY = 1024 * 1024;

/** 본문을 JSON으로 읽는다. 비어 있으면 undefined. JSON이 아니면 422 */
export async function readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buf = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
        size += buf.length;
        if (size > MAX_BODY) throw new ValidationError([{ type: 'too_large', loc: ['body'], msg: 'Request body is too large', input: null }]);
        chunks.push(buf);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text.trim()) return undefined;
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new ValidationError([{ type: 'json_invalid', loc: ['body', 0], msg: 'JSON decode error', input: {}, ctx: { error: (e as Error).message } }]);
    }
}

export function writeReply(res: ServerResponse, reply: Reply) {
    if (res.headersSent) return;
    res.statusCode = reply.status;
    for (const [k, v] of Object.entries(reply.headers ?? {})) res.setHeader(k, v);
    res.setHeader('Cache-Control', 'no-store');
    if (reply.body === undefined || reply.status === 204) {
        res.end();
        return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(reply.body));
}

type Where = 'body' | 'query' | 'path';

/**
 * 입력 검증. 문제를 모아 두었다가 done()에서 한꺼번에 422로 던진다.
 * pydantic의 오류 type/msg를 흉내 낸다 (모두 같지는 않다).
 */
export class Check {
    issues: Issue[] = [];
    private obj: Record<string, unknown>;

    constructor(private source: unknown, private where: Where) {
        if (where === 'body' && (source === undefined || source === null || typeof source !== 'object' || Array.isArray(source))) {
            this.issues.push(source === undefined
                ? { type: 'missing', loc: ['body'], msg: 'Field required', input: null }
                : { type: 'model_attributes_type', loc: ['body'], msg: 'Input should be a valid dictionary or object to extract fields from', input: source });
            this.obj = {};
        } else {
            this.obj = (source ?? {}) as Record<string, unknown>;
        }
    }

    private loc(field: string) {
        return [this.where, field];
    }

    private missing(field: string) {
        this.issues.push({ type: 'missing', loc: this.loc(field), msg: 'Field required', input: this.where === 'body' ? this.source : null });
    }

    str(field: string, opt: { min?: number; max?: number; pattern?: RegExp; optional?: boolean } = {}): string {
        const v = this.obj[field];
        if (v === undefined || v === null) {
            if (!opt.optional) this.missing(field);
            return '';
        }
        if (typeof v !== 'string') {
            this.issues.push({ type: 'string_type', loc: this.loc(field), msg: 'Input should be a valid string', input: v });
            return '';
        }
        const len = [...v].length;
        if (opt.min !== undefined && len < opt.min) {
            this.issues.push({ type: 'string_too_short', loc: this.loc(field), msg: `String should have at least ${opt.min} character${opt.min === 1 ? '' : 's'}`, input: v, ctx: { min_length: opt.min } });
        } else if (opt.max !== undefined && len > opt.max) {
            this.issues.push({ type: 'string_too_long', loc: this.loc(field), msg: `String should have at most ${opt.max} characters`, input: v, ctx: { max_length: opt.max } });
        } else if (opt.pattern && !opt.pattern.test(v)) {
            this.issues.push({ type: 'string_pattern_mismatch', loc: this.loc(field), msg: `String should match pattern '${opt.pattern.source}'`, input: v, ctx: { pattern: opt.pattern.source } });
        }
        return v;
    }

    int(field: string, opt: { min?: number; max?: number; optional?: boolean; def?: number } = {}): number {
        const v = this.obj[field];
        if (v === undefined || v === null || v === '') {
            if (opt.def !== undefined) return opt.def;
            if (!opt.optional) this.missing(field);
            return NaN;
        }
        const n = typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN;
        if (!Number.isInteger(n)) {
            this.issues.push({ type: 'int_parsing', loc: this.loc(field), msg: 'Input should be a valid integer, unable to parse string as an integer', input: v });
            return NaN;
        }
        if (opt.min !== undefined && n < opt.min) {
            this.issues.push({ type: 'greater_than_equal', loc: this.loc(field), msg: `Input should be greater than or equal to ${opt.min}`, input: v, ctx: { ge: opt.min } });
        } else if (opt.max !== undefined && n > opt.max) {
            this.issues.push({ type: 'less_than_equal', loc: this.loc(field), msg: `Input should be less than or equal to ${opt.max}`, input: v, ctx: { le: opt.max } });
        }
        return n;
    }

    num(field: string): number {
        const v = this.obj[field];
        if (v === undefined || v === null) {
            this.missing(field);
            return NaN;
        }
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            this.issues.push({ type: 'float_type', loc: this.loc(field), msg: 'Input should be a valid number', input: v });
            return NaN;
        }
        return v;
    }

    bool(field: string): boolean {
        const v = this.obj[field];
        if (v === undefined || v === null) {
            this.missing(field);
            return false;
        }
        if (typeof v !== 'boolean') {
            this.issues.push({ type: 'bool_type', loc: this.loc(field), msg: 'Input should be a valid boolean', input: v });
            return false;
        }
        return v;
    }

    oneOf<T extends string>(field: string, values: readonly T[]): T {
        const v = this.obj[field];
        if (v === undefined || v === null) {
            this.missing(field);
            return values[0];
        }
        if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) {
            const expected = values.map((x) => `'${x}'`).join(', ');
            this.issues.push({ type: 'literal_error', loc: this.loc(field), msg: `Input should be ${expected}`, input: v, ctx: { expected } });
            return values[0];
        }
        return v as T;
    }

    raw(field: string): unknown {
        return this.obj[field];
    }

    add(issue: Omit<Issue, 'loc'> & { field: string | (string | number)[] }) {
        const { field, ...rest } = issue;
        this.issues.push({ ...rest, loc: Array.isArray(field) ? [this.where, ...field] : this.loc(field) });
    }

    done() {
        if (this.issues.length) throw new ValidationError(this.issues);
    }
}

/** 경로의 {id}. 숫자가 아니면 422 (FastAPI의 int 경로 매개변수처럼) */
export function pathId(raw: string, name = 'id') {
    const c = new Check({ [name]: raw }, 'path');
    const n = c.int(name);
    c.done();
    return n;
}
