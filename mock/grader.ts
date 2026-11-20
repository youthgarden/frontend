// 모의 채점. 실제 AI 시험관 대신 근거가 분명한 규칙으로 점수를 매긴다.
// 규칙 요약은 docs/mock-server.md "모의 채점" 절에 있다.
//
// 순서는 명세 9절을 따른다: 항목별 점수와 필수 요건 판정을 만들고(실제 서버에서는 AI가 하는 부분),
// 그 결과를 검사한 뒤(validateGrade), 응시의 채점 기준 스냅샷으로 영역별 충족 여부와 통과를 서버가 계산한다(decide).

import { CRITERIA, findLecture, type TaskDef } from './content';
import type {
    AttemptRow, CheckResultRow, Criterion, DualRubric, FailReason, GradingRubric, MessageRow, ScoreRow,
} from './store';

export interface GradeInput {
    task: TaskDef;
    /** 응시의 채점 기준 스냅샷 */
    rubric: GradingRubric;
    answer: string;
    messages: MessageRow[];
    attempt: Pick<AttemptRow, 'revisions' | 'events' | 'trap'>;
}

/** 검수용으로 지정한 결과 */
export type Forced = { result: 'pass' } | { result: 'fail'; reason?: FailReason };

export interface GradeOptions {
    forced?: Forced;
    /** 예전 기준(LEGACY_TOTAL_V1)에서만: 총점을 이 값으로 맞춘다 (시드 데이터) */
    legacyTarget?: number;
    /** 0 이상 1 미만의 난수. 검수용 결과의 점수를 고를 때 쓴다 (테스트에서 고정한다) */
    rng?: () => number;
}

export interface GradeOutput {
    scores: ScoreRow[];
    /** 필수 요건별 판정. 예전 기준이면 null */
    checks: CheckResultRow[] | null;
    total: number;
    passed: boolean;
    summary: string;
}

type DimensionCode = 'TASK_SOLUTION' | 'AI_USE';

export interface DimensionDecision {
    code: DimensionCode;
    score: number;
    max_score: number;
    min_score: number;
    passed: boolean;
}

export interface Decision {
    total: number;
    passed: boolean;
    /** 예전 기준이면 null */
    dimensions: DimensionDecision[] | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(Math.round(v), lo), hi);

/**
 * 통과 판정 (명세 9절 4의 식). 서버가 저장하는 passed와 결과 API의 dimensions가 모두 여기서 나온다.
 *   실무 과제 해결 충족 = RESULT ≥ 최소 점수 AND 모든 필수 요건 충족
 *   AI 활용 역량 충족 = (PROMPT + VERIFY + IMPROVE) ≥ 최소 점수 AND VERIFY ≥ 검증 최소 점수
 *   통과 = 두 영역 모두 충족
 * 예전 기준이면 총점 ≥ min_total_score로 판정하고 dimensions는 null이다.
 */
export function decide(
    rubric: GradingRubric,
    scores: Pick<ScoreRow, 'criterion' | 'score'>[],
    checks: Pick<CheckResultRow, 'met'>[] | null,
): Decision {
    const of = (c: Criterion) => scores.find((s) => s.criterion === c)?.score ?? 0;
    const total = CRITERIA.reduce((sum, c) => sum + of(c.code), 0);
    if (rubric.version === 'LEGACY_TOTAL_V1') {
        return { total, passed: total >= rubric.min_total_score, dimensions: null };
    }
    if (checks === null) throw new Error('두 영역 기준의 응시에 필수 요건 판정이 없어요');
    const mx = rubric.criterion_max_scores;
    const sumOf = (d: DimensionCode, pick: (c: Criterion) => number) =>
        CRITERIA.filter((c) => c.dimension === d).reduce((s, c) => s + pick(c.code), 0);
    const taskScore = sumOf('TASK_SOLUTION', of);
    const aiScore = sumOf('AI_USE', of);
    const taskPassed = taskScore >= rubric.task_solution_min_score && checks.every((c) => c.met);
    const aiPassed = aiScore >= rubric.ai_use_min_score && of('VERIFY') >= rubric.verify_min_score;
    return {
        total,
        passed: taskPassed && aiPassed,
        dimensions: [
            { code: 'TASK_SOLUTION', score: taskScore, max_score: sumOf('TASK_SOLUTION', (c) => mx[c]), min_score: rubric.task_solution_min_score, passed: taskPassed },
            { code: 'AI_USE', score: aiScore, max_score: sumOf('AI_USE', (c) => mx[c]), min_score: rubric.ai_use_min_score, passed: aiPassed },
        ],
    };
}

/**
 * 채점 결과 검사 (명세 9절 4). 어긋나면 예외를 던진다. 부르는 쪽은 예외를 채점 실패(GRADING_FAILED)로 처리한다.
 * 실제 서버는 AI에게 한 번 더 묻고 그래도 어긋나면 실패로 처리하지만, 모의 채점은 같은 입력에 같은 결과를 내므로 바로 실패다.
 */
export function validateGrade(
    rubric: GradingRubric,
    scores: ScoreRow[],
    checks: CheckResultRow[] | null,
    ctx: { messageIds: Set<number>; revisionCount: number; allowVerifyWithoutEvidence?: boolean },
) {
    const codes = scores.map((s) => s.criterion);
    if (codes.length !== CRITERIA.length || new Set(codes).size !== codes.length || !CRITERIA.every((c) => codes.includes(c.code))) {
        throw new Error(`채점 항목이 네 개가 아니거나 겹쳐요: ${codes.join(',')}`);
    }
    for (const s of scores) {
        const max = rubric.criterion_max_scores[s.criterion];
        if (!Number.isInteger(s.score) || s.score < 0 || s.score > max) throw new Error(`${s.criterion} 점수 ${s.score}가 0~${max} 범위의 정수가 아니에요`);
        if (s.evidence_message_id !== null && !ctx.messageIds.has(s.evidence_message_id)) {
            throw new Error(`${s.criterion}의 근거 대화 ${s.evidence_message_id}는 이 응시의 대화가 아니에요`);
        }
        const rev = s.evidence_revision ?? null;
        if (rev !== null && (!Number.isInteger(rev) || rev < 0 || rev >= ctx.revisionCount)) {
            throw new Error(`${s.criterion}의 근거 수정 이력 ${rev}는 이 응시의 이력이 아니에요`);
        }
    }
    if (rubric.version === 'LEGACY_TOTAL_V1') {
        if (checks !== null && checks.length > 0) throw new Error('예전 기준의 응시에 필수 요건 판정이 있어요');
        return;
    }
    const expected = rubric.required_checks.map((c) => c.check_id);
    const got = (checks ?? []).map((c) => c.check_id);
    if (checks === null || got.length !== expected.length || new Set(got).size !== got.length || !expected.every((id) => got.includes(id))) {
        throw new Error(`필수 요건 판정이 기준과 맞지 않아요: 기준 ${expected.join(',')}, 판정 ${got.join(',')}`);
    }
    if (checks.some((c) => typeof c.met !== 'boolean')) throw new Error('필수 요건 판정의 met이 참/거짓이 아니에요');
    const verify = scores.find((s) => s.criterion === 'VERIFY')!;
    if (verify.score > 0 && verify.evidence_message_id === null && (verify.evidence_revision ?? null) === null && !ctx.allowVerifyWithoutEvidence) {
        throw new Error('답변 검증 점수가 양수인데 근거(대화나 답안 수정 이력)가 없어요');
    }
}

// ───────────── 항목별 점수 ─────────────

type VerifyMode = 'corrected' | 'asked' | 'asked-missed' | 'revision' | 'none' | 'no-chat' | 'forced' | 'forced-no-chat';

interface Raw {
    criterion: Criterion;
    score: number;
    evidence: number | null;
    evidenceRevision: number | null;
    facts: Facts;
}
interface Facts { [k: string]: unknown }

/** 받침이 있으면 a, 없으면 b (예: 을/를) */
function josa(word: string, a: string, b: string) {
    const last = word.trim().slice(-1);
    const code = last.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return a;
    return (code - 0xac00) % 28 === 0 ? b : a;
}

function joinKo(list: string[]) {
    return list.join(', ');
}

/** 25점 기준으로 센 점수를 배점에 맞춘다 */
const fit = (raw25: number, max: number) => clamp((raw25 * max) / 25, 0, max);

// ── 결과물 ──
function gradeResult(input: GradeInput, max: number): Raw {
    const text = input.answer.trim();
    const len = text.length;
    const lenPts = len === 0 ? 0 : len < 80 ? 2 : len < 200 ? 5 : len < 400 ? 8 : 10;
    const have = input.task.elements.filter((e) => e.pattern.test(text)).map((e) => e.label);
    const miss = input.task.elements.filter((e) => !e.pattern.test(text)).map((e) => e.label);
    const elemPts = (15 * have.length) / input.task.elements.length;
    const wrong = input.task.trap.wrongPattern.test(text) && !input.task.trap.correctPattern.test(text);
    return {
        criterion: 'RESULT',
        score: fit(lenPts + elemPts - (wrong ? 6 : 0), max),
        evidence: null,
        evidenceRevision: null,
        facts: { len, have, miss, wrong },
    };
}

// ── 질문 설계 ──
const DIMS = [
    { key: '역할', re: /(너는|당신은|역할|로서|입장에서|담당자|전문가|act as|you are)/i },
    { key: '상황', re: /(상황|배경|바이어|고객|자료|계약|이번|요청|받았|우리 회사|팀장|수입상|선사|신입)/ },
    { key: '조건', re: /(조건|반드시|포함|이내|넘지|하지\s?마|말고|빼고|기준|정중|어조|분량|글자|단어|문장|우선순위)/ },
    { key: '원하는 형식', re: /(형식|표로|표 |목록|항목|번호|단락|문단|bullet|초안|메일|영문|한 장|메모)/i },
] as const;

function gradePrompt(input: GradeInput, max: number): Raw {
    const users = input.messages.filter((m) => m.role === 'USER');
    if (users.length === 0) {
        return { criterion: 'PROMPT', score: 0, evidence: null, evidenceRevision: null, facts: { none: true } };
    }
    let best = users[0];
    let bestDims: string[] = [];
    const covered = new Set<string>();
    for (const m of users) {
        const dims = DIMS.filter((d) => d.re.test(m.content)).map((d) => d.key);
        dims.forEach((d) => covered.add(d));
        if (dims.length > bestDims.length) {
            best = m;
            bestDims = dims;
        }
    }
    const avgLen = users.reduce((s, m) => s + m.content.length, 0) / users.length;
    const lenPts = avgLen >= 60 ? 5 : avgLen >= 25 ? 3 : 1;
    const countPts = users.length >= 3 ? 3 : users.length === 2 ? 1 : 0;
    const raw25 = bestDims.length * 4.5 + (covered.size - bestDims.length) + lenPts + countPts;
    const missing = DIMS.map((d) => d.key).filter((k) => !covered.has(k));
    return {
        criterion: 'PROMPT',
        score: fit(raw25, max),
        evidence: best.id,
        evidenceRevision: null,
        facts: { have: [...covered], missing, avgLen: Math.round(avgLen), count: users.length },
    };
}

// ── 답변 검증 ──
// 명세 9절: 학습자가 AI 답변을 원자료와 대조한 근거(같은 응시의 대화나 답안 수정 이력)가 있어야 점수를 준다.
// AI 답변 자체나 첫 질문은 검증의 근거로 쓰지 않는다. 근거가 없으면 0점이다.
const VERIFY_ASK = /(대조|확인|근거|자료와|자료랑|맞는지|검증|사실인지|정확한지)/;

function gradeVerify(input: GradeInput, max: number): Raw {
    const { trap } = input.attempt;
    const t = input.task.trap;
    const answer = input.answer;
    const hasCorrect = t.correctPattern.test(answer);
    const hasWrong = t.wrongPattern.test(answer) && !hasCorrect;
    const users = input.messages.filter((m) => m.role === 'USER');
    const base = { hasCorrect, hasWrong, injected: trap.state !== 'none' };
    const raw = (mode: VerifyMode, ratio: number, evidence: number | null, evidenceRevision: number | null = null): Raw => ({
        criterion: 'VERIFY',
        score: clamp(max * ratio, 0, max),
        evidence,
        evidenceRevision,
        facts: { ...base, mode },
    });

    // AI가 틀리게 말한 것을 짚어 물었다
    if (trap.state === 'corrected' && trap.challenge_msg_id !== null) {
        return raw('corrected', 0.7 + (hasCorrect ? 0.3 : hasWrong ? -0.25 : 0.1), trap.challenge_msg_id);
    }
    // AI의 답을 받은 뒤(첫 질문이 아닌 질문에서) 자료와 대조해 달라고 했다
    const ask = users.slice(1).find((m) => VERIFY_ASK.test(m.content));
    if (ask) {
        return trap.state === 'injected'
            ? raw('asked-missed', 0.3, ask.id)
            : raw('asked', 0.5 + (hasCorrect ? 0.2 : 0), ask.id);
    }
    // 대화에서는 짚지 않았지만, AI가 말한 틀린 값을 답안에 썼다가 자료의 값으로 고쳤다 (답안 수정 이력)
    const revs = input.attempt.revisions;
    const wrongAt = revs.findIndex((r) => t.wrongPattern.test(r.content));
    if (wrongAt >= 0 && hasCorrect && !t.wrongPattern.test(answer)) {
        const fixedAt = revs.findIndex((r, i) => i > wrongAt && t.correctPattern.test(r.content) && !t.wrongPattern.test(r.content));
        if (fixedAt >= 0) return raw('revision', 0.55, null, fixedAt);
    }
    return raw(users.length === 0 ? 'no-chat' : 'none', 0, null);
}

// ── 개선 과정 ──
const REFINE = /(다시|수정|고쳐|더 |다듬|바꿔|보완|개선|줄여|늘려|추가해|덧붙|구체적으로)/;

function gradeImprove(input: GradeInput, max: number): Raw {
    const users = input.messages.filter((m) => m.role === 'USER');
    const followups = Math.max(0, users.length - 1);
    const revs = input.attempt.revisions.length;
    const revPts = revs >= 5 ? 8 : revs >= 3 ? 6 : revs >= 2 ? 4 : revs === 1 ? 2 : 0;
    const refine = users.slice(1).find((m) => REFINE.test(m.content));
    const bigPaste = input.attempt.events.some((e) => {
        if (e.type !== 'PASTE') return false;
        const len = (e.payload as { length?: unknown } | null)?.length;
        return typeof len === 'number' && len >= 300;
    });
    const pastePenalty = bigPaste && revs <= 1 ? 3 : 0;
    const raw25 = Math.min(followups, 4) * 3 + revPts + (refine ? 5 : 0) - pastePenalty;
    return {
        criterion: 'IMPROVE',
        score: fit(raw25, max),
        evidence: refine?.id ?? null,
        evidenceRevision: null,
        facts: { followups, revs, refine: !!refine, pasted: pastePenalty > 0 },
    };
}

// ───────────── 피드백 문장 ─────────────

type Band = 'high' | 'mid' | 'low';
/** 배점 대비 비율로 구간을 나눈다 (80% 이상, 52% 이상, 그 밖) */
const band = (score: number, max: number): Band => (score >= max * 0.8 ? 'high' : score >= max * 0.52 ? 'mid' : 'low');

function verifyFeedback(raw: Raw, score: number, task: TaskDef): string {
    const f = raw.facts;
    const t = task.trap;
    const mode = f.mode as VerifyMode;
    const src = `${t.source}${josa(t.source, '과', '와')}`;
    const label = (j: [string, string]) => `${t.label}${josa(t.label, j[0], j[1])}`;
    if (score === 0) {
        if (mode === 'no-chat' || mode === 'forced-no-chat') {
            return 'AI에게 묻지 않아 검증할 AI 답변이 없었어요. 이 항목은 AI의 답을 자료와 대조한 기록이 있어야 점수를 받아요.';
        }
        const what = f.injected
            ? f.hasWrong
                ? ` AI가 ${label(['을', '를'])} 자료와 다르게(${t.wrong}) 말했는데 답안에 그대로 남았어요. ${t.source}의 값은 ${t.correct}${josa(t.correct, '이에요', '예요')}.`
                : ` AI는 ${label(['을', '를'])} 자료와 다르게(${t.wrong}) 말했는데, 이를 짚어 묻지 않았어요.`
            : '';
        return `AI의 답을 자료와 대조한 기록을 찾지 못해 0점이에요.${what} 다음에는 AI가 말한 숫자와 날짜를 ${src} 맞춰 보고, 다르면 AI에게 짚어 물어보세요.`;
    }
    switch (mode) {
        case 'corrected': {
            const tail = f.hasCorrect
                ? ` 답안에도 자료의 값(${t.correct})을 반영했어요.`
                : f.hasWrong
                    ? ' 그런데 답안에는 AI가 처음 말한 틀린 값이 남아 있어요.'
                    : ` 다만 답안에서 바로잡은 값(${t.correct})을 찾지 못했어요.`;
            return `AI가 말한 ${t.label}(${t.wrong})${josa(t.wrong, '을', '를')} ${src} 대조해 바로잡았어요.${tail}`;
        }
        case 'asked':
            return `AI의 답을 자료와 대조해 달라고 요청해 ${label(['을', '를'])} ${t.source} 기준으로 확인했어요.${f.hasCorrect ? ' 답안의 값도 자료와 일치해요.' : ` 확인한 값(${t.correct})이 답안에는 드러나지 않았어요.`}`;
        case 'asked-missed':
            return `AI의 답을 자료와 대조해 달라고 요청했지만, AI가 ${t.source}${josa(t.source, '과', '와')} 다르게 말한 ${t.label}(${t.wrong})${josa(t.wrong, '은', '는')} 짚지 못했어요.`;
        case 'revision':
            return `답안 수정 이력에서 ${label(['을', '를'])} AI가 말한 값(${t.wrong})에서 ${t.source}의 값(${t.correct})으로 고친 것을 확인했어요. 대화에서 AI에게 짚어 물었다면 더 분명한 검증이 돼요.`;
        case 'forced':
            return `(검수용 지정 결과) 대화 기록으로는 ${src} 대조한 근거가 분명하지 않지만, 지정한 결과에 맞춰 점수를 줬어요.`;
        case 'forced-no-chat':
            return '(검수용 지정 결과) AI와 나눈 대화가 없어 검증 근거가 없지만, 지정한 결과에 맞춰 점수를 줬어요.';
        default:
            // 예전 기준은 근거 없이도 점수가 있을 수 있다 (총점을 맞춘 시드 데이터)
            if (f.injected && f.hasWrong) return `AI가 ${label(['을', '를'])} 자료와 다르게(${t.wrong}) 말했는데 그대로 받아들였어요. ${t.source}의 값은 ${t.correct}${josa(t.correct, '이에요', '예요')}.`;
            return `AI 답변을 자료와 대조한 흔적이 적어요. 중요한 숫자와 날짜는 ${t.source}에서 확인해 보세요.`;
    }
}

function feedback(raw: Raw, score: number, max: number, task: TaskDef): string {
    const b = band(score, max);
    const f = raw.facts;
    const t = task.trap;
    switch (raw.criterion) {
        case 'RESULT': {
            const have = f.have as string[];
            const miss = f.miss as string[];
            const wrongNote = f.wrong ? ` 자료와 다른 ${t.label}(${t.wrong})${josa(t.wrong, '이', '가')} 답안에 남아 있어요.` : '';
            if ((f.len as number) === 0) return '답안이 비어 있어 결과물을 평가할 수 없었어요.';
            if (b === 'high') return `과제가 요구한 내용을 고루 담았어요 (${joinKo(have.slice(0, 3))}).${miss.length ? ` ${miss[0]}까지 담으면 더 완벽해요.` : ''}${wrongNote}`;
            if (b === 'mid') return `담은 내용: ${joinKo(have) || '없음'}. 빠진 내용: ${joinKo(miss) || '없음'}.${wrongNote}`;
            return `과제의 핵심 요소가 답안에 부족해요. 빠진 내용: ${joinKo(miss.slice(0, 4)) || '없음'}.${wrongNote}`;
        }
        case 'PROMPT': {
            if (f.none) return 'AI에게 한 번도 묻지 않았어요. 이 시험은 AI를 활용하는 과정도 평가해요.';
            const have = f.have as string[];
            const missing = f.missing as string[];
            if (b === 'high') return `질문에 ${joinKo(have)}${josa(have[have.length - 1] ?? '', '을', '를')} 담아 AI가 과제에 맞게 답하도록 이끌었어요.`;
            if (b === 'mid') {
                return missing.length
                    ? `질문에 ${joinKo(missing)}${josa(missing[missing.length - 1], '이', '가')} 빠진 경우가 있어 답변이 일반적이었어요. 처음부터 함께 알려 주세요.`
                    : '질문의 요소는 갖췄지만 짧아서 AI가 맥락을 놓친 경우가 있었어요.';
            }
            return `질문이 짧고 ${joinKo(missing.length ? missing : ['맥락'])}${josa((missing[missing.length - 1] ?? '맥락'), '이', '가')} 없어 AI가 상황을 알기 어려웠어요. 역할, 상황, 조건, 형식을 주고 물어보세요.`;
        }
        case 'VERIFY':
            return verifyFeedback(raw, score, task);
        case 'IMPROVE': {
            const pasted = f.pasted ? ' 긴 글을 붙여넣은 뒤 거의 고치지 않았어요.' : '';
            if (b === 'high') return `${f.refine ? '다시 요청해 결과물을 다듬고, ' : ''}답안을 ${f.revs as number}번 고쳐 가며 결과물을 나아지게 했어요.${pasted}`;
            if (b === 'mid') return `재질문 ${f.followups as number}번, 답안 수정 ${f.revs as number}번으로 개선하려는 과정이 보여요. 어조나 빠진 부분을 다시 요청해 보면 더 좋아요.${pasted}`;
            return `첫 답변을 거의 그대로 썼어요. 재질문이나 직접 수정으로 결과물을 다듬어 보세요.${pasted}`;
        }
    }
}

// ───────────── 검수용 결과 맞추기 ─────────────

/**
 * 값들의 합을 목표에 맞춘다. 각 값의 여유(올릴 때는 배점 − 점수, 내릴 때는 점수)에 비례해 나눠
 * 원래 점수의 높낮이가 되도록 유지되게 한다.
 */
function adjustTo(values: number[], maxes: number[], target: number) {
    const out = [...values];
    const sum = () => out.reduce((s, v) => s + v, 0);
    const diff = target - sum();
    if (diff === 0) return out;
    const room = out.map((v, i) => (diff > 0 ? maxes[i] - v : v));
    const roomSum = room.reduce((s, v) => s + v, 0);
    if (roomSum === 0) return out;
    const share = Math.min(1, Math.abs(diff) / roomSum);
    out.forEach((_, i) => { out[i] += Math.sign(diff) * Math.floor(room[i] * share); });
    // 버림으로 남은 몇 점은 여유가 큰 항목부터 1점씩
    let rest = target - sum();
    let guard = 0;
    while (rest !== 0 && guard++ < 200) {
        const order = out.map((v, i) => [rest > 0 ? maxes[i] - v : v, i] as const).sort((a, b) => b[0] - a[0]);
        const [space, i] = order[0];
        if (space <= 0) break;
        out[i] += Math.sign(rest);
        rest -= Math.sign(rest);
    }
    return out;
}

type Values = Record<Criterion, number>;
interface CheckState extends CheckResultRow { forced: boolean }

/** 두 영역을 모두 충족하게 올린다. 이미 충족한 값은 건드리지 않는다 */
function passify(v: Values, checks: CheckState[], r: DualRubric, pick: (lo: number, hi: number) => number) {
    const mx = r.criterion_max_scores;
    v.RESULT = Math.max(v.RESULT, Math.min(mx.RESULT, r.task_solution_min_score + pick(2, 6)));
    for (const c of checks) {
        if (!c.met) {
            c.met = true;
            c.forced = true;
            c.feedback = '(검수용 지정 결과) 실제 답안으로는 충족하지 않았지만, 지정한 결과에 맞춰 충족으로 처리했어요.';
        }
    }
    v.VERIFY = Math.max(v.VERIFY, Math.min(mx.VERIFY, r.verify_min_score + pick(2, 5)));
    const want = Math.min(mx.PROMPT + mx.VERIFY + mx.IMPROVE, r.ai_use_min_score + pick(2, 6));
    if (v.PROMPT + v.VERIFY + v.IMPROVE < want) {
        [v.PROMPT, v.IMPROVE] = adjustTo([v.PROMPT, v.IMPROVE], [mx.PROMPT, mx.IMPROVE], want - v.VERIFY);
        if (v.PROMPT + v.VERIFY + v.IMPROVE < want) v.VERIFY = Math.min(mx.VERIFY, want - v.PROMPT - v.IMPROVE);
    }
}

/** 통과하는 점수에서 조건 하나만 어긋나게 만든다 */
function breakOne(v: Values, checks: CheckState[], r: DualRubric, reason: FailReason, pick: (lo: number, hi: number) => number) {
    const mx = r.criterion_max_scores;
    const toTaskScore = () => { v.RESULT = Math.max(0, r.task_solution_min_score - pick(3, 8)); };
    switch (reason) {
        case 'task_score':
            toTaskScore();
            return;
        case 'required_check': {
            const c = checks[0];
            // 필수 요건이 없는 기준이면 실무 과제 해결 점수로 미달을 만든다
            if (!c) return toTaskScore();
            const actual = c.forced ? '' : ` 실제 답안의 판정: ${c.feedback}`;
            c.met = false;
            c.forced = true;
            c.feedback = `(검수용 지정 결과) 이 요건을 충족하지 못한 것으로 지정했어요.${actual}`;
            return;
        }
        case 'ai_score': {
            const target = Math.max(0, r.ai_use_min_score - pick(4, 9));
            const rest = target - v.VERIFY;
            if (rest >= 0) [v.PROMPT, v.IMPROVE] = adjustTo([v.PROMPT, v.IMPROVE], [mx.PROMPT, mx.IMPROVE], rest);
            else {
                v.PROMPT = 0;
                v.IMPROVE = 0;
                v.VERIFY = Math.max(r.verify_min_score, target);
            }
            return;
        }
        case 'verify_min': {
            if (r.verify_min_score <= 0) return toTaskScore();
            v.VERIFY = r.verify_min_score - 1;
            const need = r.ai_use_min_score - v.VERIFY;
            if (v.PROMPT + v.IMPROVE < need) {
                [v.PROMPT, v.IMPROVE] = adjustTo([v.PROMPT, v.IMPROVE], [mx.PROMPT, mx.IMPROVE], Math.min(need + pick(0, 2), mx.PROMPT + mx.IMPROVE));
            }
        }
    }
}

/** 이유를 정하지 않은 "미달": 두 영역의 점수를 모두 기준 아래로 낮춘다 */
function lowerBoth(v: Values, r: DualRubric, pick: (lo: number, hi: number) => number) {
    const mx = r.criterion_max_scores;
    v.RESULT = Math.min(v.RESULT, Math.max(0, r.task_solution_min_score - pick(4, 10)));
    const ai = adjustTo([v.PROMPT, v.VERIFY, v.IMPROVE], [mx.PROMPT, mx.VERIFY, mx.IMPROVE], Math.max(0, r.ai_use_min_score - pick(5, 12)));
    [v.PROMPT, v.VERIFY, v.IMPROVE] = ai;
}

// ───────────── 총평 ─────────────

/** 통과하지 못한 이유를 문장으로 (decide와 같은 기준) */
function failReasons(r: DualRubric, v: Values, checks: CheckResultRow[]) {
    const out: string[] = [];
    const unmet = checks.filter((c) => !c.met);
    if (unmet.length) {
        const label = r.required_checks.find((x) => x.check_id === unmet[0].check_id)?.label ?? unmet[0].check_id;
        out.push(`반드시 지켜야 할 요건 "${label}"${unmet.length > 1 ? ` 외 ${unmet.length - 1}개` : ''}를 충족하지 못했어요.`);
    }
    if (v.RESULT < r.task_solution_min_score) out.push(`결과물 점수가 실무 과제 해결의 최소 점수(${r.task_solution_min_score}점)에 못 미쳤어요.`);
    if (v.VERIFY < r.verify_min_score) out.push(`답변 검증이 최소 ${r.verify_min_score}점에 못 미쳤어요.`);
    if (v.PROMPT + v.VERIFY + v.IMPROVE < r.ai_use_min_score) out.push(`AI 활용 역량 점수가 최소 점수(${r.ai_use_min_score}점)에 못 미쳤어요.`);
    return out;
}

function summaryOf(input: GradeInput, scores: ScoreRow[], decision: Decision, checks: CheckResultRow[] | null) {
    const { task, rubric } = input;
    const name = (c: Criterion) => CRITERIA.find((x) => x.code === c)?.name ?? c;
    const ratio = (s: ScoreRow) => s.score / rubric.criterion_max_scores[s.criterion];
    const weakest = [...scores].sort((a, b) => ratio(a) - ratio(b))[0];
    const strongest = [...scores].sort((a, b) => ratio(b) - ratio(a))[0];
    const lecture = findLecture(task.lecture_id);
    const best = name(strongest.criterion);
    const weak = name(weakest.criterion);
    const lectureNote = lecture ? ` "${lecture.title}" 강의를 다시 보면 도움이 돼요.` : '';

    if (rubric.version === 'LEGACY_TOTAL_V1') {
        const total = decision.total;
        if (total >= 90) return `${best}${josa(best, '이', '가')} 특히 돋보였어요. AI를 동료처럼 잘 활용해 과제를 해냈어요.`;
        if (decision.passed) return `통과예요. ${best}${josa(best, '이', '가')} 좋았고, ${weak}${josa(weak, '을', '를')} 조금 더 보완하면 더 좋아요.`;
        if (total >= 60) return `조금만 더 하면 통과예요. ${weak} 항목을 보완해 보세요.${lectureNote}`;
        return `아직 통과 기준에 못 미쳤어요. 자료를 꼼꼼히 읽고 AI에게 역할과 조건을 주며 물어보세요.${lectureNote}`;
    }
    if (decision.passed) {
        return `${best}${josa(best, '이', '가')} 특히 돋보였어요. 실무 과제 해결과 AI 활용 역량 모두 기준을 넘었어요. 현업에서는 ${task.practice}`;
    }
    const v = Object.fromEntries(scores.map((s) => [s.criterion, s.score])) as Values;
    const reasons = failReasons(rubric, v, checks ?? []);
    return `아직 통과하지 못했어요. ${reasons.slice(0, 2).join(' ')} 현업에서는 ${task.practice}${lectureNote}`;
}

// ───────────── 채점 ─────────────

/**
 * 채점한다. 결과를 validateGrade로 검사한 뒤 돌려주므로, 어긋나면 예외가 난다 (부르는 쪽에서 채점 실패로 처리).
 * 검수용 결과(forced)가 있으면:
 *   pass: 규칙 점수가 이미 통과면 그대로, 아니면 두 영역을 모두 충족하게 올린다
 *   fail + reason: 통과하는 점수에서 그 조건 하나만 어긋나게 만든다
 *   fail (reason 없음): 규칙 점수가 이미 미달이면 그대로, 아니면 두 영역 점수를 모두 기준 아래로 낮춘다
 * 예전 기준(LEGACY_TOTAL_V1)이면 총점을 82~90점(통과) 또는 58~72점(미달)으로 맞춘다.
 */
export function grade(input: GradeInput, opt: GradeOptions = {}): GradeOutput {
    const { rubric, task } = input;
    const mx = rubric.criterion_max_scores;
    const rng = opt.rng ?? Math.random;
    const pick = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
    const raws = [
        gradeResult(input, mx.RESULT),
        gradePrompt(input, mx.PROMPT),
        gradeVerify(input, mx.VERIFY),
        gradeImprove(input, mx.IMPROVE),
    ];
    const v = Object.fromEntries(raws.map((r) => [r.criterion, r.score])) as Values;
    const users = input.messages.filter((m) => m.role === 'USER');

    let checks: CheckState[] | null = null;
    if (rubric.version === 'DUAL_V1') {
        checks = rubric.required_checks.map((c) => {
            const judge = task.judges[c.check_id];
            // 판정 규칙을 모르는 요건이 스냅샷에 있으면 건너뛰지 않고 채점 실패로 처리한다
            if (!judge) throw new Error(`필수 요건 ${c.check_id}의 판정 규칙이 없어요`);
            const j = judge(input.answer);
            return { check_id: c.check_id, met: j.met, feedback: j.feedback, forced: false };
        });
        const forced = opt.forced;
        if (forced) {
            const rawPassed = decide(rubric, raws, checks).passed;
            if (forced.result === 'pass' && !rawPassed) passify(v, checks, rubric, pick);
            if (forced.result === 'fail' && forced.reason) {
                passify(v, checks, rubric, pick);
                breakOne(v, checks, rubric, forced.reason, pick);
            } else if (forced.result === 'fail' && rawPassed) {
                lowerBoth(v, rubric, pick);
            }
        }
    } else {
        const raw = raws.reduce((s, r) => s + r.score, 0);
        let target = opt.legacyTarget;
        if (target === undefined && opt.forced?.result === 'pass' && raw < rubric.min_total_score) target = pick(82, 90);
        if (target === undefined && opt.forced?.result === 'fail' && raw >= rubric.min_total_score) target = pick(58, 72);
        if (target !== undefined) {
            const order: Criterion[] = ['RESULT', 'PROMPT', 'VERIFY', 'IMPROVE'];
            const out = adjustTo(order.map((c) => v[c]), order.map((c) => mx[c]), clamp(target, 0, order.reduce((s, c) => s + mx[c], 0)));
            order.forEach((c, i) => { v[c] = out[i]; });
        }
    }

    // 검수용 결과로 답변 검증 점수가 0에서 양수가 됐으면 근거와 피드백의 경우도 맞춘다 (근거 규칙은 DUAL_V1에만 있다)
    const verifyRaw = raws.find((r) => r.criterion === 'VERIFY')!;
    let allowVerifyWithoutEvidence = false;
    if (rubric.version === 'DUAL_V1' && v.VERIFY > 0 && verifyRaw.evidence === null && verifyRaw.evidenceRevision === null) {
        if (users.length) {
            verifyRaw.evidence = (users.length > 1 ? users[users.length - 1] : users[0]).id;
            verifyRaw.facts = { ...verifyRaw.facts, mode: 'forced' };
        } else {
            verifyRaw.facts = { ...verifyRaw.facts, mode: 'forced-no-chat' };
            allowVerifyWithoutEvidence = true;
        }
    }
    // 예전 기준은 답변 검증의 근거 규칙이 없다 (명세 9절은 DUAL_V1에만 적용)
    if (rubric.version === 'LEGACY_TOTAL_V1') allowVerifyWithoutEvidence = true;

    const scores: ScoreRow[] = raws.map((r) => {
        const score = v[r.criterion];
        const zeroVerify = r.criterion === 'VERIFY' && score === 0;
        return {
            criterion: r.criterion,
            score,
            feedback: feedback(r, score, mx[r.criterion], task),
            evidence_message_id: zeroVerify ? null : r.evidence,
            evidence_revision: zeroVerify ? null : r.evidenceRevision,
        };
    });
    const checkRows: CheckResultRow[] | null = checks && checks.map(({ check_id, met, feedback: fb }) => ({ check_id, met, feedback: fb }));

    validateGrade(rubric, scores, checkRows, {
        messageIds: new Set(input.messages.map((m) => m.id)),
        revisionCount: input.attempt.revisions.length,
        allowVerifyWithoutEvidence,
    });
    const decision = decide(rubric, scores, checkRows);
    return { scores, checks: checkRows, total: decision.total, passed: decision.passed, summary: summaryOf(input, scores, decision, checkRows) };
}
