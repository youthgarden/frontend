import { describe, expect, it } from 'vitest';
import type { AttemptResult, Criterion, DimensionResult, DualPassRequirements, RequiredCheckResult, ScoreItem } from '../../api';
import { criteriaOverview, describeReason, DIMENSION_NAME, groupRule, josa, verdictOf, type FailReason } from './passing';

// 결과 화면이 "통과했는가, 못 했다면 왜인가"를 보여 주는 근거. 여기가 틀리면 총점 85점인데 미통과인 응시자에게
// 엉뚱한 이유를 보여 주거나 이유를 빠뜨린다.

const req: DualPassRequirements = {
    version: 'DUAL_V1',
    task_solution_min_score: 40,
    ai_use_min_score: 40,
    verify_min_score: 12,
    required_checks: [{ check_id: 'SHIPPING_DATE', label: '확정 선적일을 정확히 안내하고 미확정 일정을 확정처럼 약속하지 않기' }],
};

const item = (criterion: ScoreItem['criterion'], name: string, dimension: ScoreItem['dimension'], score: number, max_score: number): ScoreItem =>
    ({ criterion, name, dimension, score, max_score, feedback: '', evidence_message_id: null });

/** 명세 9절의 식으로 dimensions를 만들어, 서버가 준 것과 같은 모양의 결과를 꾸민다 */
function dual(RESULT: number, PROMPT: number, VERIFY: number, IMPROVE: number, met: boolean[] = [true]): AttemptResult {
    const checks: RequiredCheckResult[] = met.map((m, i) => ({
        check_id: i === 0 ? 'SHIPPING_DATE' : `CHECK_${i}`,
        label: i === 0 ? req.required_checks[0].label : `요건 ${i}`,
        met: m,
        feedback: m ? '일정표와 일치해요.' : '회신에 일정표와 다른 날짜가 있어요.',
    }));
    const ai = PROMPT + VERIFY + IMPROVE;
    const taskPassed = RESULT >= 40 && met.every(Boolean);
    const aiPassed = ai >= 40 && VERIFY >= 12;
    const dimensions: DimensionResult[] = [
        { code: 'TASK_SOLUTION', name: '실무 과제 해결', score: RESULT, max_score: 50, min_score: 40, passed: taskPassed },
        { code: 'AI_USE', name: 'AI 활용 역량', score: ai, max_score: 50, min_score: 40, passed: aiPassed },
    ];
    return {
        id: 1, status: 'GRADED', task: { id: 1, title: '과제' }, started_at: '', submitted_at: '', answer: '',
        total_score: RESULT + ai, passed: taskPassed && aiPassed,
        pass_requirements: { ...req, required_checks: checks.map(({ check_id, label }) => ({ check_id, label })) },
        dimensions, required_checks: checks, summary_feedback: '총평',
        scores: [
            item('RESULT', '결과물', 'TASK_SOLUTION', RESULT, 50),
            item('PROMPT', '질문 설계', 'AI_USE', PROMPT, 15),
            item('VERIFY', '답변 검증', 'AI_USE', VERIFY, 20),
            item('IMPROVE', '개선 과정', 'AI_USE', IMPROVE, 15),
        ],
        recommended_lecture: null, level_up: { leveled_up: false, level: 1 }, first_view: false,
    };
}

function legacy(total: number): AttemptResult {
    const each = Math.floor(total / 4);
    return {
        ...dual(0, 0, 0, 0),
        total_score: total,
        passed: total >= 80,
        pass_requirements: { version: 'LEGACY_TOTAL_V1', min_total_score: 80 },
        dimensions: null,
        required_checks: null,
        scores: [
            item('RESULT', '결과물', 'TASK_SOLUTION', total - each * 3, 25),
            item('PROMPT', '질문 설계', 'AI_USE', each, 25),
            item('VERIFY', '답변 검증', 'AI_USE', each, 25),
            item('IMPROVE', '개선 과정', 'AI_USE', each, 25),
        ],
    };
}

const codes = (r: AttemptResult) => {
    const v = verdictOf(r);
    if (v.kind !== 'dual') throw new Error(`두 영역 기준이 아니에요: ${v.kind}`);
    return v.reasons.map((x) => x.code);
};

describe('verdictOf: 두 영역 기준', () => {
    it('두 영역 모두 충족: 통과, 이유 없음, 검증도 충족', () => {
        const v = verdictOf(dual(45, 13, 15, 12));
        expect(v).toMatchObject({ kind: 'dual', passed: true, total: 85, reasons: [] });
        if (v.kind !== 'dual') return;
        expect(v.dimensions.map((d) => d.code)).toEqual(['TASK_SOLUTION', 'AI_USE']);
        expect(v.verify).toEqual({ name: '답변 검증', score: 15, min: 12, met: true });
    });

    it('실무 과제 해결의 점수 미달: 몇 점 모자란지', () => {
        const r = dual(36, 15, 18, 14);
        expect(codes(r)).toEqual(['TASK_SCORE']);
        const v = verdictOf(r);
        expect(v.kind === 'dual' && v.reasons[0]).toMatchObject({ code: 'TASK_SCORE', shortBy: 4 });
    });

    it('필수 요건 미충족: 결과물 점수가 최소 점수 이상이어도 그 요건이 이유가 된다', () => {
        const r = dual(48, 15, 18, 14, [false]);
        expect(r.total_score).toBe(95);
        expect(codes(r)).toEqual(['REQUIRED_CHECK']);
        const v = verdictOf(r);
        const reason = v.kind === 'dual' ? v.reasons[0] : null;
        expect(reason?.code === 'REQUIRED_CHECK' && reason.check.check_id).toBe('SHIPPING_DATE');
    });

    it('필수 요건이 여럿이면 지키지 못한 것만 하나씩', () => {
        const r = dual(48, 15, 18, 14, [true, false, false]);
        const v = verdictOf(r);
        expect(v.kind === 'dual' && v.reasons.map((x) => x.code === 'REQUIRED_CHECK' && x.check.check_id)).toEqual(['CHECK_1', 'CHECK_2']);
    });

    it('AI 활용 역량의 점수 미달 (검증은 충족)', () => {
        const r = dual(46, 8, 14, 10);
        expect(codes(r)).toEqual(['AI_SCORE']);
        const v = verdictOf(r);
        expect(v.kind === 'dual' && v.reasons[0]).toMatchObject({ shortBy: 8 });
    });

    it('명세 예시: 총점 85점, 영역 점수는 충족인데 답변 검증 11점(최소 12점)만 미달', () => {
        const r = dual(45, 15, 11, 14);
        expect(r.total_score).toBe(85);
        expect(r.dimensions![1].score).toBe(40);
        expect(codes(r)).toEqual(['VERIFY_MIN']);
        const v = verdictOf(r);
        expect(v.kind === 'dual' && v.reasons[0]).toMatchObject({ code: 'VERIFY_MIN', name: '답변 검증', score: 11, min: 12, shortBy: 1 });
        expect(v.kind === 'dual' && v.verify?.met).toBe(false);
    });

    it('여러 이유가 겹치면 실무 과제 해결(요건, 점수) → AI 활용 역량(검증, 점수) 순서로 모두', () => {
        const r = dual(35, 5, 0, 7, [false]);
        expect(codes(r)).toEqual(['REQUIRED_CHECK', 'TASK_SCORE', 'VERIFY_MIN', 'AI_SCORE']);
    });

    it('scoresMet: 영역 점수는 모두 넘었는데 미달인지 (요건이나 검증 최소 점수 때문인지)', () => {
        expect(verdictOf(dual(45, 15, 11, 14))).toMatchObject({ scoresMet: true, passed: false });
        expect(verdictOf(dual(48, 15, 18, 14, [false]))).toMatchObject({ scoresMet: true, passed: false });
        expect(verdictOf(dual(36, 15, 18, 14))).toMatchObject({ scoresMet: false });
        expect(verdictOf(dual(35, 5, 0, 7, [false]))).toMatchObject({ scoresMet: false });
    });

    it('서버가 미충족이라 했는데 이유를 찾지 못하면 그 영역을 이유로 둔다 (이유 없는 미달을 보이지 않는다)', () => {
        const r = dual(45, 13, 15, 12);
        r.passed = false;
        r.dimensions![1] = { ...r.dimensions![1], passed: false };
        expect(codes(r)).toEqual(['DIMENSION_UNMET']);
    });

    it('통과 여부는 서버의 판정을 따른다 (화면이 다시 계산해 뒤집지 않는다)', () => {
        const r = dual(45, 13, 15, 12);
        r.passed = false;
        expect(verdictOf(r).kind === 'dual' && (verdictOf(r) as { passed: boolean }).passed).toBe(false);
    });
});

describe('verdictOf: 예전 기준 (LEGACY_TOTAL_V1)', () => {
    it('통과: 총점과 기준 점수', () => {
        expect(verdictOf(legacy(88))).toEqual({ kind: 'legacy', passed: true, total: 88, minTotal: 80, shortBy: 0 });
    });

    it('미달: 몇 점 남았는지. 영역과 필수 요건은 다루지 않는다', () => {
        expect(verdictOf(legacy(72))).toEqual({ kind: 'legacy', passed: false, total: 72, minTotal: 80, shortBy: 8 });
    });
});

describe('verdictOf: 채점 전', () => {
    it('채점 중이거나 실패해 점수와 판정이 null이면 pending', () => {
        const nulls = { scores: null, total_score: null, passed: null, dimensions: null, required_checks: null, summary_feedback: null };
        expect(verdictOf({ ...dual(45, 13, 15, 12), status: 'GRADING', ...nulls })).toEqual({ kind: 'pending' });
        expect(verdictOf({ ...dual(45, 13, 15, 12), status: 'GRADING_FAILED', ...nulls })).toEqual({ kind: 'pending' });
        expect(verdictOf({ ...legacy(72), status: 'GRADING', ...nulls })).toEqual({ kind: 'pending' });
    });
});

describe('describeReason: 이유를 사용자에게 하는 말로', () => {
    const reasonsOf = (r: AttemptResult) => (verdictOf(r) as { reasons: FailReason[] }).reasons;

    it('필수 요건: 요건의 문구를 그대로 보여 준다', () => {
        const [r] = reasonsOf(dual(48, 15, 18, 14, [false]));
        expect(describeReason(r).detail).toContain(req.required_checks[0].label);
    });

    it('검증 최소 점수: 항목 이름, 받은 점수, 최소 점수, 영역 점수가 충분해도 따로 필요하다는 것', () => {
        const t = describeReason(reasonsOf(dual(45, 15, 11, 14))[0]);
        expect(t.title).toContain('답변 검증');
        expect(t.title).toContain('1점');
        expect(t.detail).toContain('11점');
        expect(t.detail).toContain('최소 12점');
        expect(t.detail).toContain('AI 활용 역량');
        expect(t.detail).toContain('충분해도');
    });

    it('검증 최소 점수와 영역 점수가 함께 모자라면 "영역 점수가 충분해도"라고 말하지 않는다', () => {
        const verify = reasonsOf(dual(45, 5, 0, 7)).find((x) => x.code === 'VERIFY_MIN')!;
        const t = describeReason(verify);
        expect(t.detail).not.toContain('충분해도');
        expect(t.detail).toContain('최소 12점');
    });

    it('영역 점수: 영역 이름은 응답의 name을 쓰고, 다음에 할 일이 있다', () => {
        const r = dual(36, 15, 18, 14);
        r.dimensions![0] = { ...r.dimensions![0], name: '실무 문제 해결' };
        const t = describeReason(reasonsOf(r)[0]);
        expect(t.title).toContain('실무 문제 해결');
        expect(t.next.length).toBeGreaterThan(0);
    });

    it('시스템 용어(TASK_SOLUTION 등)가 문장에 나오지 않는다', () => {
        for (const r of reasonsOf(dual(35, 5, 0, 7, [false]))) {
            const t = describeReason(r);
            expect(`${t.title} ${t.detail} ${t.next}`).not.toMatch(/TASK_SOLUTION|AI_USE|VERIFY|RESULT|required_checks|dimension/);
        }
    });
});

describe('criteriaOverview / groupRule: 안내와 시험 화면의 평가 기준', () => {
    const criteria: Criterion[] = [
        { code: 'RESULT', name: '결과물', dimension: 'TASK_SOLUTION', max_score: 50 },
        { code: 'PROMPT', name: '질문 설계', dimension: 'AI_USE', max_score: 15 },
        { code: 'VERIFY', name: '답변 검증', dimension: 'AI_USE', max_score: 20 },
        { code: 'IMPROVE', name: '개선 과정', dimension: 'AI_USE', max_score: 15 },
    ];

    it('항목을 두 영역으로 묶고 배점과 최소 점수를 응답에서 가져온다', () => {
        const ov = criteriaOverview(criteria, req);
        expect(ov.kind).toBe('dual');
        if (ov.kind !== 'dual') return;
        expect(ov.groups.map((g) => [g.code, g.name, g.max, g.min, g.criteria.map((c) => c.code)])).toEqual([
            ['TASK_SOLUTION', DIMENSION_NAME.TASK_SOLUTION, 50, 40, ['RESULT']],
            ['AI_USE', DIMENSION_NAME.AI_USE, 50, 40, ['PROMPT', 'VERIFY', 'IMPROVE']],
        ]);
        expect(ov.groups[1].criteria.find((c) => c.code === 'VERIFY')?.min).toBe(12);
        expect(ov.verify).toEqual({ code: 'VERIFY', name: '답변 검증', min: 12 });
        expect(ov.checks).toEqual([{ check_id: 'SHIPPING_DATE', label: req.required_checks[0].label }]);
    });

    it('기준 숫자가 바뀌면 그대로 따라간다 (화면에 고정값이 없다)', () => {
        const other: DualPassRequirements = { ...req, task_solution_min_score: 35, ai_use_min_score: 30, verify_min_score: 8, required_checks: [] };
        const ov = criteriaOverview(criteria.map((c) => (c.code === 'RESULT' ? { ...c, max_score: 40 } : c)), other);
        if (ov.kind !== 'dual') throw new Error('dual이 아니에요');
        expect(ov.groups.map((g) => [g.max, g.min])).toEqual([[40, 35], [50, 30]]);
        expect(groupRule(ov.groups[0], ov)).toBe('결과물 35점 이상');
        expect(groupRule(ov.groups[1], ov)).toBe('질문 설계 + 답변 검증 + 개선 과정 합계 30점 이상, 그리고 그중 답변 검증 8점 이상');
    });

    it('통과 조건 문장: 필수 요건 수와 검증 최소 점수를 함께 말한다', () => {
        const ov = criteriaOverview(criteria, req);
        if (ov.kind !== 'dual') throw new Error('dual이 아니에요');
        expect(groupRule(ov.groups[0], ov)).toBe('결과물 40점 이상, 그리고 꼭 지켜야 할 것 1가지를 모두 지키기');
        expect(groupRule(ov.groups[1], ov)).toBe('질문 설계 + 답변 검증 + 개선 과정 합계 40점 이상, 그리고 그중 답변 검증 12점 이상');
    });

    it('예전 기준이면 총점 기준만', () => {
        const legacyCriteria = criteria.map((c) => ({ ...c, max_score: 25 }));
        expect(criteriaOverview(legacyCriteria, { version: 'LEGACY_TOTAL_V1', min_total_score: 80 }))
            .toEqual({ kind: 'legacy', criteria: legacyCriteria, max: 100, minTotal: 80 });
    });
});

describe('josa', () => {
    it('받침 유무로 고른다', () => {
        expect(josa('답변 검증', '은', '는')).toBe('은');
        expect(josa('질문 설계', '은', '는')).toBe('는');
        expect(josa('실무 과제 해결', '과', '와')).toBe('과');
        expect(josa('AI', '과', '와')).toBe('과');
    });
});
