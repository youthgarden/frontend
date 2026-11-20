// 모의 채점. 실제 AI 시험관 대신 근거가 분명한 규칙으로 점수를 매긴다.
// 규칙 요약은 docs/mock-server.md "모의 채점" 절에 있다.

import { CRITERIA, findLecture, type TaskDef } from './content';
import type { AttemptRow, Criterion, MessageRow, ScoreRow } from './store';

export interface GradeInput {
    task: TaskDef;
    answer: string;
    messages: MessageRow[];
    attempt: Pick<AttemptRow, 'revisions' | 'events' | 'trap'>;
}

export interface GradeOutput {
    scores: ScoreRow[];
    total: number;
    summary: string;
}

interface Raw { criterion: Criterion; score: number; evidence: number | null; facts: Facts }
interface Facts { [k: string]: unknown }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(Math.round(v), lo), hi);

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

// ── 결과물 ──
function gradeResult(input: GradeInput): Raw {
    const text = input.answer.trim();
    const len = text.length;
    const lenPts = len === 0 ? 0 : len < 80 ? 2 : len < 200 ? 5 : len < 400 ? 8 : 10;
    const have = input.task.elements.filter((e) => e.pattern.test(text)).map((e) => e.label);
    const miss = input.task.elements.filter((e) => !e.pattern.test(text)).map((e) => e.label);
    const elemPts = (15 * have.length) / input.task.elements.length;
    const wrong = input.task.trap.wrongPattern.test(text) && !input.task.trap.correctPattern.test(text);
    return {
        criterion: 'RESULT',
        score: clamp(lenPts + elemPts - (wrong ? 6 : 0), 0, 25),
        evidence: null,
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

function gradePrompt(input: GradeInput): Raw {
    const users = input.messages.filter((m) => m.role === 'USER');
    if (users.length === 0) {
        return { criterion: 'PROMPT', score: 0, evidence: null, facts: { none: true } };
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
    const score = bestDims.length * 4.5 + (covered.size - bestDims.length) + lenPts + countPts;
    const missing = DIMS.map((d) => d.key).filter((k) => !covered.has(k));
    return {
        criterion: 'PROMPT',
        score: clamp(score, 0, 25),
        evidence: best.id,
        facts: { have: [...covered], missing, avgLen: Math.round(avgLen), count: users.length },
    };
}

// ── 답변 검증 ──
const VERIFY_ASK = /(대조|확인|근거|자료와|자료랑|맞는지|검증|사실인지|정확한지)/;

function gradeVerify(input: GradeInput): Raw {
    const { trap } = input.attempt;
    const t = input.task.trap;
    const answer = input.answer;
    const hasCorrect = t.correctPattern.test(answer);
    const hasWrong = t.wrongPattern.test(answer) && !hasCorrect;
    const users = input.messages.filter((m) => m.role === 'USER');

    if (trap.state === 'corrected') {
        const score = 16 + (hasCorrect ? 9 : hasWrong ? -6 : 3);
        return { criterion: 'VERIFY', score: clamp(score, 0, 25), evidence: trap.challenge_msg_id, facts: { mode: 'corrected', hasCorrect, hasWrong } };
    }
    if (trap.state === 'injected') {
        const score = hasWrong ? 3 : hasCorrect ? 13 : 7;
        return { criterion: 'VERIFY', score, evidence: trap.injected_msg_id, facts: { mode: 'missed', hasCorrect, hasWrong } };
    }
    if (users.length === 0) {
        return { criterion: 'VERIFY', score: hasCorrect ? 10 : 5, evidence: null, facts: { mode: 'no-chat', hasCorrect } };
    }
    const ask = users.find((m) => VERIFY_ASK.test(m.content));
    const score = (ask ? 12 : 6) + (hasCorrect ? 6 : 0) - (hasWrong ? 4 : 0);
    return { criterion: 'VERIFY', score: clamp(score, 0, 25), evidence: ask?.id ?? null, facts: { mode: 'no-trap', asked: !!ask, hasCorrect } };
}

// ── 개선 과정 ──
const REFINE = /(다시|수정|고쳐|더 |다듬|바꿔|보완|개선|줄여|늘려|추가해|덧붙|구체적으로)/;

function gradeImprove(input: GradeInput): Raw {
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
    const score = Math.min(followups, 4) * 3 + revPts + (refine ? 5 : 0) - pastePenalty;
    return {
        criterion: 'IMPROVE',
        score: clamp(score, 0, 25),
        evidence: refine?.id ?? null,
        facts: { followups, revs, refine: !!refine, pasted: pastePenalty > 0 },
    };
}

// ── 피드백 문장 ──
type Band = 'high' | 'mid' | 'low';
const band = (s: number): Band => (s >= 20 ? 'high' : s >= 13 ? 'mid' : 'low');

function feedback(raw: Raw, score: number, task: TaskDef): string {
    const b = band(score);
    const f = raw.facts;
    const t = task.trap;
    switch (raw.criterion) {
        case 'RESULT': {
            const have = f.have as string[];
            const miss = f.miss as string[];
            const wrongNote = f.wrong ? ` 자료와 다른 ${t.label}(${t.wrong})${josa(t.wrong, '이', '가')} 답안에 남아 있어요.` : '';
            if ((f.len as number) === 0) return '답안이 비어 있어 결과물을 평가할 수 없었어요.';
            if (b === 'high') return `과제가 요구한 내용을 고루 담았어요 (${joinKo(have.slice(0, 3))}).${miss.length ? ` ${miss[0]}까지 담으면 더 완벽해요.` : ''}${wrongNote}`;
            if (b === 'mid') return `담은 내용: ${joinKo(have) || '없음'}. 빠진 내용: ${joinKo(miss)}.${wrongNote}`;
            return `과제의 핵심 요소가 답안에 부족해요. 빠진 내용: ${joinKo(miss.slice(0, 4))}.${wrongNote}`;
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
        case 'VERIFY': {
            const mode = f.mode as string;
            if (mode === 'corrected') {
                return b === 'high'
                    ? `AI가 잘못 말한 ${t.label}${josa(t.label, '을', '를')} 자료와 대조해 바로잡았어요.`
                    : `AI가 잘못 말한 ${t.label}${josa(t.label, '은', '는')} 지적했지만, 답안에는 바로잡은 값(${t.correct})${josa(t.correct, '이', '가')} 제대로 반영되지 않았어요.`;
            }
            if (mode === 'missed') {
                if (f.hasWrong) return `AI가 ${t.label}${josa(t.label, '을', '를')} 자료와 다르게(${t.wrong}) 말했는데 그대로 받아들였어요. 자료의 값은 ${t.correct}${josa(t.correct, '이에요', '예요')}.`;
                if (f.hasCorrect) return `답안의 ${t.label}${josa(t.label, '은', '는')} 자료와 맞지만, AI가 틀리게 말한 부분을 짚어 묻지는 않았어요.`;
                return `AI가 ${t.label}${josa(t.label, '을', '를')} 자료와 다르게 말했지만 대조해 보지 않았어요. AI 답변의 숫자와 날짜는 자료와 맞춰 보세요.`;
            }
            if (mode === 'no-chat') return 'AI 답변을 쓰지 않아 검증할 대상이 없었어요.';
            return b === 'low'
                ? 'AI 답변을 자료와 대조한 흔적이 적어요. 중요한 숫자와 날짜는 자료로 확인해 보세요.'
                : 'AI 답변을 자료와 대조해 확인하려고 했어요.';
        }
        case 'IMPROVE': {
            const pasted = f.pasted ? ' 긴 글을 붙여넣은 뒤 거의 고치지 않았어요.' : '';
            if (b === 'high') return `${f.refine ? '다시 요청해 결과물을 다듬고, ' : ''}답안을 ${f.revs as number}번 고쳐 가며 결과물을 나아지게 했어요.${pasted}`;
            if (b === 'mid') return `재질문 ${f.followups as number}번, 답안 수정 ${f.revs as number}번으로 개선하려는 과정이 보여요. 어조나 빠진 부분을 다시 요청해 보면 더 좋아요.${pasted}`;
            return `첫 답변을 거의 그대로 썼어요. 재질문이나 직접 수정으로 결과물을 다듬어 보세요.${pasted}`;
        }
    }
}

function summaryOf(scores: ScoreRow[], total: number, task: TaskDef) {
    const name = (c: Criterion) => CRITERIA.find((x) => x.code === c)?.name ?? c;
    const weakest = [...scores].sort((a, b) => a.score - b.score)[0];
    const strongest = [...scores].sort((a, b) => b.score - a.score)[0];
    const lecture = findLecture(task.lecture_id);
    const best = name(strongest.criterion);
    const weak = name(weakest.criterion);
    if (total >= 90) return `${best}${josa(best, '이', '가')} 특히 돋보였어요. AI를 동료처럼 잘 활용해 과제를 해냈어요.`;
    if (total >= 80) return `통과예요. ${best}${josa(best, '이', '가')} 좋았고, ${weak}${josa(weak, '을', '를')} 조금 더 보완하면 더 좋아요.`;
    if (total >= 60) return `조금만 더 하면 통과예요. ${weak} 항목을 보완해 보세요.${lecture ? ` "${lecture.title}" 강의를 다시 보면 도움이 돼요.` : ''}`;
    return `아직 통과 기준에 못 미쳤어요. 자료를 꼼꼼히 읽고 AI에게 역할과 조건을 주며 물어보세요.${lecture ? ` "${lecture.title}" 강의를 다시 보길 권해요.` : ''}`;
}

/**
 * 네 점수의 합을 목표 점수에 맞춘다. 각 항목의 여유(올릴 때는 25 − 점수, 내릴 때는 점수)에 비례해 나눠
 * 원래 점수의 높낮이가 되도록 유지되게 한다.
 */
function adjustTo(scores: number[], target: number) {
    const out = [...scores];
    const sum = () => out.reduce((s, v) => s + v, 0);
    const diff = target - sum();
    if (diff === 0) return out;
    const room = out.map((v) => (diff > 0 ? 25 - v : v));
    const roomSum = room.reduce((s, v) => s + v, 0);
    if (roomSum === 0) return out;
    const share = Math.min(1, Math.abs(diff) / roomSum);
    out.forEach((_, i) => { out[i] += Math.sign(diff) * Math.floor(room[i] * share); });
    // 버림으로 남은 몇 점은 여유가 큰 항목부터 1점씩
    let rest = target - sum();
    let guard = 0;
    while (rest !== 0 && guard++ < 100) {
        const order = out.map((v, i) => [rest > 0 ? 25 - v : v, i] as const).sort((a, b) => b[0] - a[0]);
        const [space, i] = order[0];
        if (space <= 0) break;
        out[i] += Math.sign(rest);
        rest -= Math.sign(rest);
    }
    return out;
}

/**
 * 채점한다.
 * @param target 총점을 이 값으로 맞춘다 (검수용 강제 결과, 시드 데이터)
 */
export function grade(input: GradeInput, target?: number): GradeOutput {
    const raws = [gradeResult(input), gradePrompt(input), gradeVerify(input), gradeImprove(input)];
    const values = target === undefined ? raws.map((r) => r.score) : adjustTo(raws.map((r) => r.score), clamp(target, 0, 100));
    const ids = new Set(input.messages.map((m) => m.id));
    const scores: ScoreRow[] = raws.map((r, i) => ({
        criterion: r.criterion,
        score: values[i],
        feedback: feedback(r, values[i], input.task),
        // 명세 9절: 이 응시의 대화가 아니면 NULL
        evidence_message_id: r.evidence !== null && ids.has(r.evidence) ? r.evidence : null,
    }));
    const total = scores.reduce((s, x) => s + x.score, 0);
    return { scores, total, summary: summaryOf(scores, total, input.task) };
}
