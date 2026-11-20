import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttemptInProgress } from '../../api';
import { deadlineOf, secondsLeftNow, type LiveAttempt } from './useCountdown';

// 남은 시간은 사용자 PC의 벽시계가 아니라 "서버가 준 remaining_sec"과 "응답을 받은 순간의 단조 시계"로 센다.
// 여기가 틀리면 시간이 남았는데 자동 제출되거나, 끝났는데 계속 쓸 수 있는 것처럼 보인다.

function attempt(remaining_sec: number): AttemptInProgress {
    return {
        id: 1,
        status: 'IN_PROGRESS',
        started_at: '2026-11-20T03:00:00Z',
        deadline_at: '2026-11-20T03:30:00Z',
        remaining_sec,
        task: { id: 1, title: '과제', situation: '', instruction: '', materials: [] },
    };
}

function live(remaining: number, receivedAt: number): LiveAttempt {
    return { attempt: attempt(remaining), receivedAt };
}

/** performance.now()가 돌려줄 값을 정한다 */
function nowIs(ms: number) {
    vi.spyOn(performance, 'now').mockReturnValue(ms);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('deadlineOf', () => {
    it('받은 순간 + 남은 초 (ms)', () => {
        expect(deadlineOf(live(1800, 5000))).toBe(5000 + 1_800_000);
        expect(deadlineOf(live(0, 123.5))).toBe(123.5);
        expect(deadlineOf(live(0.25, 1000))).toBe(1250);
    });

    it('벽시계(Date)와 서버의 deadline_at은 쓰지 않는다', () => {
        const a = live(600, 0);
        const b = { ...a, attempt: { ...a.attempt, deadline_at: '2000-01-01T00:00:00Z', started_at: '1999-01-01T00:00:00Z' } };
        expect(deadlineOf(b)).toBe(deadlineOf(a));
        vi.spyOn(Date, 'now').mockReturnValue(0);
        expect(deadlineOf(a)).toBe(600_000);
    });
});

describe('secondsLeftNow', () => {
    const base = 10_000;

    it('받은 그 순간에는 서버가 준 남은 초 그대로', () => {
        nowIs(base);
        expect(secondsLeftNow(live(1800, base))).toBe(1800);
    });

    it('흐른 시간만큼 줄고, 1초가 다 지나기 전에는 올림해서 그대로 보인다', () => {
        const l = live(1800, base);
        nowIs(base + 1);
        expect(secondsLeftNow(l)).toBe(1800);
        nowIs(base + 999);
        expect(secondsLeftNow(l)).toBe(1800);
        nowIs(base + 1000);
        expect(secondsLeftNow(l)).toBe(1799);
        nowIs(base + 1001);
        expect(secondsLeftNow(l)).toBe(1799);
        nowIs(base + 60_000);
        expect(secondsLeftNow(l)).toBe(1740);
        nowIs(base + 1_799_000);
        expect(secondsLeftNow(l)).toBe(1);
        nowIs(base + 1_799_999);
        expect(secondsLeftNow(l)).toBe(1);
    });

    it('마감 순간에 0이 되고, 지나도 0 아래로 내려가지 않는다', () => {
        const l = live(30, base);
        nowIs(base + 30_000);
        expect(secondsLeftNow(l)).toBe(0);
        nowIs(base + 30_001);
        expect(secondsLeftNow(l)).toBe(0);
        nowIs(base + 10 * 3600_000);
        expect(secondsLeftNow(l)).toBe(0);
    });

    it('서버가 0이나 음수를 주면 처음부터 0', () => {
        nowIs(base);
        expect(secondsLeftNow(live(0, base))).toBe(0);
        expect(secondsLeftNow(live(-5, base))).toBe(0);
    });

    it('서버가 소수 초를 주면 올림한다', () => {
        nowIs(base);
        expect(secondsLeftNow(live(0.2, base))).toBe(1);
        expect(secondsLeftNow(live(59.4, base))).toBe(60);
    });

    it('정수만 돌려준다 (-0도 내지 않는다)', () => {
        const l = live(5, base);
        for (const dt of [0, 1, 499.5, 4999, 5000, 5000.5, 9999]) {
            nowIs(base + dt);
            const s = secondsLeftNow(l);
            expect(Number.isInteger(s)).toBe(true);
            expect(Object.is(s, -0)).toBe(false);
        }
    });

    it('응답을 늦게 받은 쪽(receivedAt이 큰 쪽)이 그만큼 더 늦게 끝난다', () => {
        nowIs(base + 5000);
        expect(secondsLeftNow(live(60, base))).toBe(55);
        expect(secondsLeftNow(live(60, base + 3000))).toBe(58);
    });
});
