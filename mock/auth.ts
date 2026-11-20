// 인증 도우미: 비밀번호 해시, 액세스 토큰(JWT 모양), 리프레시 토큰.
// 명세 2절을 따르되, 모의 서버라 서명 키는 고정값이다.

import crypto from 'node:crypto';
import type { Store } from './store';

const SECRET = 'youthgarten-mock-secret-not-for-production';
export const REFRESH_TTL_SEC = 14 * 24 * 60 * 60;
export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_PATH = '/api/v1/auth';

// ── 비밀번호 (명세는 bcrypt. 모의 서버는 의존성을 늘리지 않으려 Node 내장 scrypt를 쓴다) ──
export function hashPassword(password: string) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 32, { N: 4096 });
    return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
    const [kind, saltHex, hashHex] = stored.split('$');
    if (kind !== 'scrypt' || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 4096 });
    return crypto.timingSafeEqual(expected, actual);
}

export function sha256(text: string) {
    return crypto.createHash('sha256').update(text).digest('hex');
}

// ── 액세스 토큰: HS256 JWT ──
const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString('base64url');

export function signAccess(userId: number, epoch: string, ttlSec: number) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64({ alg: 'HS256', typ: 'JWT' });
    // ep, jti는 명세에 없는 모의 서버용 필드: 초기화 전 토큰을 가려내고, 토큰마다 값이 달라지게 한다
    const payload = b64({ sub: String(userId), type: 'access', iat: now, exp: now + ttlSec, ep: epoch, jti: crypto.randomBytes(6).toString('hex') });
    const sig = crypto.createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${sig}`;
}

export type TokenCheck = { ok: true; userId: number } | { ok: false; code: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' };

export function verifyAccess(token: string | null | undefined, store: Store): TokenCheck {
    if (!token) return { ok: false, code: 'INVALID_TOKEN' };
    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, code: 'INVALID_TOKEN' };
    const [h, p, s] = parts;
    const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
    if (s.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected))) {
        return { ok: false, code: 'INVALID_TOKEN' };
    }
    let payload: { sub?: unknown; type?: unknown; exp?: unknown; ep?: unknown };
    try {
        payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    } catch {
        return { ok: false, code: 'INVALID_TOKEN' };
    }
    if (payload.type !== 'access' || typeof payload.exp !== 'number' || typeof payload.sub !== 'string') {
        return { ok: false, code: 'INVALID_TOKEN' };
    }
    if (payload.ep !== store.data.epoch) return { ok: false, code: 'INVALID_TOKEN' };
    const userId = Number(payload.sub);
    if (!store.user(userId)) return { ok: false, code: 'INVALID_TOKEN' };
    if (payload.exp * 1000 <= Date.now()) return { ok: false, code: 'TOKEN_EXPIRED' };
    const hash = sha256(token);
    if (store.data.expired_tokens.some((t) => t.token_hash === hash)) return { ok: false, code: 'TOKEN_EXPIRED' };
    return { ok: true, userId };
}

/** 검수용: 이 토큰을 지금 만료된 것으로 친다 */
export function forceExpire(token: string, store: Store) {
    const now = Date.now();
    const exp = (() => {
        try {
            const p = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { exp?: number };
            return typeof p.exp === 'number' ? p.exp * 1000 : now + 3600_000;
        } catch {
            return now + 3600_000;
        }
    })();
    // 이미 지난 기록은 지운다
    store.data.expired_tokens = store.data.expired_tokens.filter((t) => t.exp > now);
    store.data.expired_tokens.push({ token_hash: sha256(token), exp });
    store.touch();
}

// ── 리프레시 토큰 ──
export function issueRefresh(userId: number, store: Store) {
    const raw = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    store.data.refresh_tokens.push({
        id: store.nextId('refresh'),
        user_id: userId,
        token_hash: sha256(raw),
        expires_at: now + REFRESH_TTL_SEC * 1000,
        revoked_at: null,
        created_at: now,
    });
    // 오래된 행이 쌓이지 않게 만료되었거나 하루 전에 폐기된 행을 지운다
    store.data.refresh_tokens = store.data.refresh_tokens.filter((r) => r.expires_at > now && (r.revoked_at === null || r.revoked_at > now - 86_400_000));
    store.touch();
    return raw;
}

/** 쓸 수 있는 리프레시 토큰 행을 찾는다 (없거나 만료·폐기면 undefined) */
export function findRefresh(raw: string | undefined, store: Store) {
    if (!raw) return undefined;
    const hash = sha256(raw);
    const row = store.data.refresh_tokens.find((r) => r.token_hash === hash);
    if (!row || row.revoked_at !== null || row.expires_at <= Date.now()) return undefined;
    return row;
}

export function refreshCookie(raw: string) {
    return `${REFRESH_COOKIE}=${raw}; HttpOnly; SameSite=Lax; Path=${REFRESH_PATH}; Max-Age=${REFRESH_TTL_SEC}`;
}

export function clearRefreshCookie() {
    return `${REFRESH_COOKIE}=; HttpOnly; SameSite=Lax; Path=${REFRESH_PATH}; Max-Age=0`;
}

export function parseCookies(header: string | undefined) {
    const out: Record<string, string> = {};
    if (!header) return out;
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i < 0) continue;
        const value = part.slice(i + 1).trim();
        try {
            out[part.slice(0, i).trim()] = decodeURIComponent(value);
        } catch {
            out[part.slice(0, i).trim()] = value;
        }
    }
    return out;
}
