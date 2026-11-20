import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api';
import type { CriterionCode } from '../../api';
import { CRITERION_LOOKS_AT, formatClock, formatDateTime, formatDuration, formatTime, isCode } from './util';

// 시험 화면의 시간 표시와 오류 구분. 남은 시간을 실제보다 적게 보이거나 오류를 잘못 구분하면
// 응시자가 서두르다 손해를 보거나, 제출된 시험을 다시 풀려고 한다.

describe('formatClock: 위쪽 막대의 "12:03"', () => {
    it('경계값', () => {
        expect(formatClock(0)).toBe('00:00');
        expect(formatClock(59)).toBe('00:59');
        expect(formatClock(60)).toBe('01:00');
        expect(formatClock(61)).toBe('01:01');
        expect(formatClock(30 * 60)).toBe('30:00');
    });

    it('1시간 이상은 분을 60 넘게 센다 (시 단위로 넘기지 않는다)', () => {
        expect(formatClock(3600)).toBe('60:00');
        expect(formatClock(3661)).toBe('61:01');
        expect(formatClock(100 * 60)).toBe('100:00');
    });

    it('소수는 올림한다: 남은 0.2초도 1초로 보인다', () => {
        expect(formatClock(0.2)).toBe('00:01');
        expect(formatClock(59.01)).toBe('01:00');
    });

    it('음수는 00:00으로 멈춘다', () => {
        expect(formatClock(-1)).toBe('00:00');
        expect(formatClock(-0.4)).toBe('00:00');
        expect(formatClock(-3600)).toBe('00:00');
    });
});

describe('formatDuration: 낭독기와 문장 안의 "12분 3초"', () => {
    it('경계값', () => {
        expect(formatDuration(0)).toBe('0초');
        expect(formatDuration(59)).toBe('59초');
        expect(formatDuration(60)).toBe('1분');
        expect(formatDuration(61)).toBe('1분 1초');
        expect(formatDuration(3600)).toBe('60분');
        expect(formatDuration(3661)).toBe('61분 1초');
    });

    it('소수는 올림하고, 음수는 0초', () => {
        expect(formatDuration(0.1)).toBe('1초');
        expect(formatDuration(59.5)).toBe('1분');
        expect(formatDuration(-5)).toBe('0초');
    });

    it('formatClock과 같은 초를 가리킨다', () => {
        for (const s of [0, 0.3, 1, 59, 59.9, 60, 61, 299, 300, 1799.5, 3600]) {
            const [m, r] = formatClock(s).split(':').map(Number);
            const fromDuration = formatDuration(s);
            const total = m * 60 + r;
            const expected = total < 60 ? `${total}초` : r === 0 ? `${m}분` : `${m}분 ${r}초`;
            expect(fromDuration).toBe(expected);
        }
    });
});

// 아래 두 함수는 사용자 PC의 시간대로 보인다. 기대값을 "이 PC의 지역 시각으로 만든 Date"에서 출발해
// 만들면 어느 시간대에서 돌려도 같은 결과가 나온다.
describe('formatTime / formatDateTime: 서버 UTC 시각을 지역 시각으로', () => {
    const localIso = (h: number, m: number) => new Date(2026, 10, 20, h, m, 30).toISOString();

    it('지역 시각의 시와 분을 24시간제 두 자리로 보인다', () => {
        expect(formatTime(localIso(0, 5))).toBe('00:05');
        expect(formatTime(localIso(9, 5))).toBe('09:05');
        expect(formatTime(localIso(12, 0))).toBe('12:00');
        expect(formatTime(localIso(23, 59))).toBe('23:59');
    });

    it('UTC 표기(Z)와 시차 표기(+09:00)가 같은 순간이면 같게 보인다', () => {
        expect(formatTime('2026-11-20T03:27:00Z')).toBe(formatTime('2026-11-20T12:27:00+09:00'));
        expect(formatDateTime('2026-11-20T03:27:00Z')).toBe(formatDateTime('2026-11-20T12:27:00+09:00'));
    });

    it('날짜와 시각을 함께 보인다 (자정은 24시가 아니라 00시)', () => {
        expect(formatDateTime(localIso(0, 5))).toMatch(/^2026\D+11\D+20\D+00:05$/);
        expect(formatDateTime(localIso(23, 59))).toMatch(/^2026\D+11\D+20\D+23:59$/);
    });

    it('해석할 수 없는 값이면 빈 문자열', () => {
        expect(formatTime('')).toBe('');
        expect(formatTime('어제')).toBe('');
        expect(formatDateTime('not-a-date')).toBe('');
    });
});

describe('isCode', () => {
    const e = new ApiError('ATTEMPT_TIME_OVER', '시간이 끝났어요', 409);

    it('주어진 코드 중 하나와 같으면 true', () => {
        expect(isCode(e, 'ATTEMPT_TIME_OVER')).toBe(true);
        expect(isCode(e, 'ATTEMPT_NOT_FOUND', 'ATTEMPT_TIME_OVER')).toBe(true);
    });

    it('코드가 다르거나 주지 않으면 false', () => {
        expect(isCode(e, 'ATTEMPT_NOT_IN_PROGRESS')).toBe(false);
        expect(isCode(e)).toBe(false);
    });

    it('ApiError가 아니면 code가 같아 보여도 false', () => {
        expect(isCode(new Error('ATTEMPT_TIME_OVER'), 'ATTEMPT_TIME_OVER')).toBe(false);
        expect(isCode({ code: 'ATTEMPT_TIME_OVER' }, 'ATTEMPT_TIME_OVER')).toBe(false);
        expect(isCode(null, 'ATTEMPT_TIME_OVER')).toBe(false);
        expect(isCode(undefined, 'ATTEMPT_TIME_OVER')).toBe(false);
    });
});

describe('평가 항목 설명', () => {
    it('네 항목 모두 설명이 있다', () => {
        const codes: CriterionCode[] = ['RESULT', 'PROMPT', 'VERIFY', 'IMPROVE'];
        for (const c of codes) expect(CRITERION_LOOKS_AT[c].length).toBeGreaterThan(0);
        expect(Object.keys(CRITERION_LOOKS_AT).sort()).toEqual([...codes].sort());
    });

    it('설명에 점수나 통과 기준을 적지 않는다 (숫자는 응답에서 가져온다)', () => {
        for (const text of Object.values(CRITERION_LOOKS_AT)) expect(text).not.toMatch(/\d+\s*점/);
    });
});
