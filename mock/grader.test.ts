import { describe, expect, it } from 'vitest';
import { chatReply } from './ai';
import { LEGACY_RUBRIC, TASKS, findTask } from './content';
import { decide, grade, validateGrade, type GradeInput } from './grader';
import { buildSeed } from './seed';
import { FAIL_REASONS, type CheckResultRow, type DualRubric, type MessageRow, type ScoreRow, type TrapState } from './store';

// 모의 채점의 판정 (명세 9절 4의 식)과 결과 검사. 화면의 "왜 통과하지 못했나"는 이 판정을 그대로 보여 주므로,
// 여기가 틀리면 검수에서 화면이 옳은지 판단할 수 없다.

const rubric: DualRubric = structuredClone(findTask(1)!.rubric);
const sc = (RESULT: number, PROMPT: number, VERIFY: number, IMPROVE: number) =>
    [['RESULT', RESULT], ['PROMPT', PROMPT], ['VERIFY', VERIFY], ['IMPROVE', IMPROVE]].map(([criterion, score]) => ({ criterion, score })) as Pick<ScoreRow, 'criterion' | 'score'>[];
const met = (m = true) => [{ met: m }];

describe('decide: 두 영역 판정 (DUAL_V1)', () => {
    it('과제 1의 기준은 명세 예시와 같다 (40 / 40 / 검증 12, 배점 50·15·20·15)', () => {
        expect(rubric).toMatchObject({
            version: 'DUAL_V1', task_solution_min_score: 40, ai_use_min_score: 40, verify_min_score: 12,
            criterion_max_scores: { RESULT: 50, PROMPT: 15, VERIFY: 20, IMPROVE: 15 },
        });
        expect(rubric.required_checks.map((c) => c.check_id)).toEqual(['SHIPPING_DATE']);
    });

    it('두 영역을 모두 충족하면 통과', () => {
        const d = decide(rubric, sc(45, 13, 15, 12), met());
        expect(d).toMatchObject({ total: 85, passed: true });
        expect(d.dimensions).toEqual([
            { code: 'TASK_SOLUTION', score: 45, max_score: 50, min_score: 40, passed: true },
            { code: 'AI_USE', score: 40, max_score: 50, min_score: 40, passed: true },
        ]);
    });

    it('명세 예시: 총점 85점이어도 답변 검증이 11점(최소 12점)이면 AI 활용 역량 미충족으로 미통과', () => {
        const d = decide(rubric, sc(45, 15, 11, 14), met());
        expect(d.total).toBe(85);
        expect(d.passed).toBe(false);
        expect(d.dimensions!.map((x) => [x.code, x.score, x.passed])).toEqual([['TASK_SOLUTION', 45, true], ['AI_USE', 40, false]]);
    });

    it('결과물이 최소 점수 미만이면 실무 과제 해결 미충족', () => {
        const d = decide(rubric, sc(39, 15, 20, 15), met());
        expect(d.passed).toBe(false);
        expect(d.dimensions![0].passed).toBe(false);
        expect(d.dimensions![1].passed).toBe(true);
    });

    it('필수 요건 하나라도 미충족이면 결과물 점수가 높아도 실무 과제 해결 미충족', () => {
        const d = decide(rubric, sc(50, 15, 20, 15), met(false));
        expect(d).toMatchObject({ total: 100, passed: false });
        expect(d.dimensions![0].passed).toBe(false);
    });

    it('AI 활용 역량 점수가 최소 미만이면 (검증은 충족해도) 미충족', () => {
        const d = decide(rubric, sc(48, 10, 14, 15), met());
        expect(d.dimensions![1]).toMatchObject({ score: 39, passed: false });
        expect(d.passed).toBe(false);
    });

    it('경계값: 최소 점수와 같으면 충족', () => {
        expect(decide(rubric, sc(40, 13, 12, 15), met()).passed).toBe(true);
    });

    it('필수 요건이 없는 기준이면 점수만으로 판정한다. 판정 자체가 없으면(null) 예외', () => {
        const none: DualRubric = { ...rubric, required_checks: [] };
        expect(decide(none, sc(40, 13, 12, 15), []).passed).toBe(true);
        expect(() => decide(rubric, sc(40, 13, 12, 15), null)).toThrow();
    });
});

describe('decide: 예전 기준 (LEGACY_TOTAL_V1)', () => {
    it('총점 80점 이상이면 통과, 영역은 없다', () => {
        expect(decide(LEGACY_RUBRIC, sc(20, 20, 20, 20), null)).toEqual({ total: 80, passed: true, dimensions: null });
        expect(decide(LEGACY_RUBRIC, sc(25, 25, 4, 25), null)).toEqual({ total: 79, passed: false, dimensions: null });
    });
});

describe('validateGrade: 채점 결과 검사', () => {
    const row = (criterion: ScoreRow['criterion'], score: number, evidence: number | null = null): ScoreRow =>
        ({ criterion, score, feedback: '피드백', evidence_message_id: evidence });
    const ok = () => [row('RESULT', 45), row('PROMPT', 13, 5001), row('VERIFY', 15, 5003), row('IMPROVE', 12)];
    const checks: CheckResultRow[] = [{ check_id: 'SHIPPING_DATE', met: true, feedback: '근거' }];
    const ctx = { messageIds: new Set([5001, 5002, 5003]), revisionCount: 2 };

    it('올바른 결과는 통과', () => {
        expect(() => validateGrade(rubric, ok(), checks, ctx)).not.toThrow();
    });

    it('항목 누락·중복, 배점 범위 밖, 정수가 아닌 점수는 거절', () => {
        expect(() => validateGrade(rubric, ok().slice(0, 3), checks, ctx)).toThrow();
        expect(() => validateGrade(rubric, [...ok().slice(0, 3), row('RESULT', 1)], checks, ctx)).toThrow();
        expect(() => validateGrade(rubric, [row('RESULT', 51), ...ok().slice(1)], checks, ctx)).toThrow();
        expect(() => validateGrade(rubric, [row('RESULT', 44.5), ...ok().slice(1)], checks, ctx)).toThrow();
    });

    it('이 응시의 대화가 아닌 근거, 범위 밖의 수정 이력은 거절', () => {
        expect(() => validateGrade(rubric, [ok()[0], row('PROMPT', 13, 9999), ...ok().slice(2)], checks, ctx)).toThrow();
        const rev = { ...row('VERIFY', 11), evidence_revision: 5 };
        expect(() => validateGrade(rubric, [ok()[0], ok()[1], rev, ok()[3]], checks, ctx)).toThrow();
    });

    it('답변 검증이 양수인데 근거(대화, 수정 이력)가 없으면 거절. 수정 이력이 근거면 받는다', () => {
        expect(() => validateGrade(rubric, [ok()[0], ok()[1], row('VERIFY', 11), ok()[3]], checks, ctx)).toThrow();
        expect(() => validateGrade(rubric, [ok()[0], ok()[1], { ...row('VERIFY', 11), evidence_revision: 1 }, ok()[3]], checks, ctx)).not.toThrow();
        expect(() => validateGrade(rubric, [ok()[0], ok()[1], row('VERIFY', 0), ok()[3]], checks, ctx)).not.toThrow();
    });

    it('필수 요건 ID가 기준과 정확히 맞아야 한다', () => {
        expect(() => validateGrade(rubric, ok(), [], ctx)).toThrow();
        expect(() => validateGrade(rubric, ok(), null, ctx)).toThrow();
        expect(() => validateGrade(rubric, ok(), [{ check_id: 'OTHER', met: true, feedback: '' }], ctx)).toThrow();
        expect(() => validateGrade(rubric, ok(), [...checks, ...checks], ctx)).toThrow();
    });

    it('예전 기준은 필수 요건 판정이 없고(null), 배점은 25점까지다', () => {
        const legacy = [row('RESULT', 25), row('PROMPT', 20), row('VERIFY', 20), row('IMPROVE', 20)];
        expect(() => validateGrade(LEGACY_RUBRIC, legacy, null, { ...ctx, allowVerifyWithoutEvidence: true })).not.toThrow();
        expect(() => validateGrade(LEGACY_RUBRIC, [row('RESULT', 26), ...legacy.slice(1)], null, ctx)).toThrow();
        expect(() => validateGrade(LEGACY_RUBRIC, legacy, checks, { ...ctx, allowVerifyWithoutEvidence: true })).toThrow();
    });
});

/** 모의 AI로 대화를 만들어 채점 입력을 꾸민다 (시드와 같은 방식) */
function attemptOf(taskId: number, prompts: string[], answer: string, revisions = 4): GradeInput {
    const task = findTask(taskId)!;
    let trap: TrapState = { state: 'none', injected_msg_id: null, challenge_msg_id: null };
    const messages: MessageRow[] = [];
    let id = 5000;
    for (const q of prompts) {
        const user: MessageRow = { id: ++id, attempt_id: 1, role: 'USER', content: q, created_at: 0 };
        const r = chatReply(task, messages, q, trap, '');
        const ai: MessageRow = { id: ++id, attempt_id: 1, role: 'ASSISTANT', content: r.text, created_at: 0 };
        if (r.injects) trap = { ...trap, state: 'injected', injected_msg_id: ai.id };
        if (r.corrects) trap = { ...trap, state: 'corrected', challenge_msg_id: user.id };
        messages.push(user, ai);
    }
    const revs = Array.from({ length: revisions }, (_, i) => ({ content: answer.slice(0, Math.round((answer.length * (i + 1)) / revisions)), created_at: 0 }));
    return { task, rubric: structuredClone(task.rubric), answer, messages, attempt: { revisions: revs, events: [], trap } };
}
const fixed = () => 0.5;

describe('grade: 규칙 채점', () => {
    it.each(TASKS.map((t) => [t.id]))('과제 %i: 잘 푼 응시(자료와 대조해 바로잡음)는 통과하고 필수 요건을 모두 충족한다', (taskId) => {
        const t = findTask(taskId)!;
        const g = grade(attemptOf(taskId, t.seedPrompts, t.seedAnswer));
        expect(g.passed).toBe(true);
        expect(g.checks!.length).toBeGreaterThan(0);
        expect(g.checks!.every((c) => c.met)).toBe(true);
        const verify = g.scores.find((s) => s.criterion === 'VERIFY')!;
        expect(verify.score).toBeGreaterThanOrEqual(t.rubric.verify_min_score);
        // 근거는 학습자의 질문이어야 한다 (AI 답변이 아니라)
        const input = attemptOf(taskId, t.seedPrompts, t.seedAnswer);
        expect(input.messages.find((m) => m.id === verify.evidence_message_id)?.role).toBe('USER');
        // 무엇을 어떤 자료와 대조했는지가 피드백에 드러난다
        expect(verify.feedback).toContain(t.trap.source);
    });

    it('AI가 틀리게 말한 값을 그대로 쓰면: 답변 검증 0점(근거 없음), 필수 요건 미충족, 미통과', () => {
        const t = findTask(1)!;
        const g = grade(attemptOf(1, ['너는 해외영업 담당자야. 바이어에게 보낼 영문 회신 메일 초안을 써 줘.'], t.reply.draft(true).split('---')[1]));
        const verify = g.scores.find((s) => s.criterion === 'VERIFY')!;
        expect(verify).toMatchObject({ score: 0, evidence_message_id: null });
        expect(verify.feedback).toContain('0점');
        expect(g.checks).toEqual([expect.objectContaining({ check_id: 'SHIPPING_DATE', met: false })]);
        expect(g.passed).toBe(false);
    });

    it('예전 기준의 응시는 항목별 25점 범위와 총점 80점으로 판정하고 필수 요건 판정이 없다', () => {
        const t = findTask(1)!;
        const input = { ...attemptOf(1, t.seedPrompts, t.seedAnswer), rubric: structuredClone(LEGACY_RUBRIC) };
        const g = grade(input, { legacyTarget: 72 });
        expect(g).toMatchObject({ total: 72, passed: false, checks: null });
        expect(g.scores.every((s) => s.score <= 25)).toBe(true);
        expect(grade(input, { legacyTarget: 88 }).passed).toBe(true);
    });

    it('판정 규칙이 없는 필수 요건이 스냅샷에 있으면 건너뛰지 않고 실패한다', () => {
        const t = findTask(1)!;
        const input = attemptOf(1, t.seedPrompts, t.seedAnswer);
        const r = input.rubric as DualRubric;
        r.required_checks = [...r.required_checks, { check_id: 'UNKNOWN', label: '모르는 요건', rule: '' }];
        expect(() => grade(input)).toThrow(/UNKNOWN/);
    });
});

describe('grade: 검수용 결과', () => {
    const t = findTask(1)!;
    const weak = () => attemptOf(1, ['메일 써 줘'], 'Dear Mr. Carter, sorry for the delay.', 1);
    const strong = () => attemptOf(1, t.seedPrompts, t.seedAnswer);
    const dims = (g: ReturnType<typeof grade>, input: GradeInput) => decide(input.rubric, g.scores, g.checks).dimensions!;

    it('통과 지정: 약한 응시도 두 영역을 모두 충족하고, 답변 검증의 근거 대화가 붙는다', () => {
        const input = weak();
        const g = grade(input, { forced: { result: 'pass' }, rng: fixed });
        expect(g.passed).toBe(true);
        expect(dims(g, input).every((d) => d.passed)).toBe(true);
        expect(g.scores.find((s) => s.criterion === 'VERIFY')!.evidence_message_id).toBe(input.messages[0].id);
    });

    it('통과 지정: 대화가 하나도 없어도 통과한다 (근거 없음을 피드백에 밝힌다)', () => {
        const input = attemptOf(1, [], t.seedAnswer, 1);
        const g = grade(input, { forced: { result: 'pass' }, rng: fixed });
        expect(g.passed).toBe(true);
        expect(g.scores.find((s) => s.criterion === 'VERIFY')!.feedback).toContain('검수용');
    });

    it('통과 지정: 이미 통과하는 응시는 점수를 바꾸지 않는다', () => {
        expect(grade(strong(), { forced: { result: 'pass' }, rng: fixed })).toEqual(grade(strong()));
    });

    it.each(FAIL_REASONS.map((r) => [r]))('미달 지정(%s): 그 조건 하나만 어긋난다', (reason) => {
        const input = strong();
        const g = grade(input, { forced: { result: 'fail', reason }, rng: fixed });
        const [task, ai] = dims(g, input);
        const v = Object.fromEntries(g.scores.map((s) => [s.criterion, s.score]));
        expect(g.passed).toBe(false);
        expect(g.checks!.every((c) => c.met)).toBe(reason !== 'required_check');
        expect(v.RESULT >= rubric.task_solution_min_score).toBe(reason !== 'task_score');
        expect(v.VERIFY >= rubric.verify_min_score).toBe(reason !== 'verify_min');
        expect(ai.score >= rubric.ai_use_min_score).toBe(reason !== 'ai_score');
        expect(task.passed).toBe(reason === 'ai_score' || reason === 'verify_min');
        expect(ai.passed).toBe(reason === 'task_score' || reason === 'required_check');
    });

    it('미달 지정(verify_min): 총점이 80점을 넘어도 미통과가 된다', () => {
        const g = grade(strong(), { forced: { result: 'fail', reason: 'verify_min' }, rng: fixed });
        expect(g.total).toBeGreaterThan(80);
        expect(g.passed).toBe(false);
    });

    it('미달 지정(이유 없음): 이미 미달인 응시는 그대로, 통과하는 응시는 두 영역 점수를 모두 낮춘다', () => {
        expect(grade(weak(), { forced: { result: 'fail' }, rng: fixed })).toEqual(grade(weak()));
        const input = strong();
        const g = grade(input, { forced: { result: 'fail' }, rng: fixed });
        expect(g.passed).toBe(false);
        expect(dims(g, input).map((d) => d.score < d.min_score)).toEqual([true, true]);
    });
});

describe('시드', () => {
    const db = buildSeed(Date.UTC(2026, 10, 20));
    const user = (login: string) => db.users.find((u) => u.login_id === login)!;
    const passedTasks = (login: string) => new Set(db.attempts.filter((a) => a.user_id === user(login).id && a.status === 'GRADED' && a.passed).map((a) => a.task_id));

    it('계정의 레벨과 통과한 과제 수가 정해진 대로다', () => {
        expect(['jiwon01', 'minjae03', 'seoyeon02', 'yuna05', 'jeonghun04'].map((l) => [l, user(l).level, passedTasks(l).size])).toEqual([
            ['jiwon01', 1, 0], ['minjae03', 2, 1], ['seoyeon02', 3, 2], ['yuna05', 5, 4], ['jeonghun04', 6, 5],
        ]);
        expect([...passedTasks('yuna05')].sort()).toEqual([1, 2, 3, 4]);
    });

    it('민재는 과제 2를 두 영역 기준으로 푸는 중이다', () => {
        const a = db.attempts.find((x) => x.user_id === user('minjae03').id && x.status === 'IN_PROGRESS')!;
        expect(a.task_id).toBe(2);
        expect(a.grading_rubric_snapshot.version).toBe('DUAL_V1');
    });

    it('서연: 과제 1은 예전 기준(미달 1, 통과 1), 과제 3은 두 영역 기준의 미달', () => {
        const mine = db.attempts.filter((a) => a.user_id === user('seoyeon02').id);
        const legacy = mine.filter((a) => a.grading_rubric_snapshot.version === 'LEGACY_TOTAL_V1');
        expect(legacy.map((a) => [a.task_id, a.passed, a.required_check_results])).toEqual([[1, false, null], [1, true, null]]);
        const t3 = mine.find((a) => a.task_id === 3)!;
        expect(t3.grading_rubric_snapshot.version).toBe('DUAL_V1');
        expect(t3.passed).toBe(false);
        expect(t3.required_check_results!.some((c) => !c.met)).toBe(true);
    });

    it('두 영역 기준의 채점 완료 응시는 저장된 passed가 판정 식과 같다', () => {
        for (const a of db.attempts.filter((x) => x.status === 'GRADED')) {
            expect(decide(a.grading_rubric_snapshot, a.scores, a.required_check_results).passed).toBe(a.passed);
            expect(a.scores.reduce((s, x) => s + x.score, 0)).toBe(a.total_score);
        }
    });
});
