import type {
    AttemptResult, Criterion, CriterionCode, DimensionCode, DimensionResult, PassRequirements, RequiredCheckResult,
} from '../../api';

// 통과 기준을 화면에 보여 주기 위한 판단. 화면 컴포넌트와 떼어 두어 단위 테스트로 지킨다.
// 통과 여부 자체는 서버가 저장한 판정(passed, dimensions[].passed)을 그대로 따르고, 여기서는 "왜"를 찾아 정리만 한다.

/**
 * 영역 이름. 결과 응답에는 dimensions[].name이 오지만, 과제 안내와 시험 시작 응답에는 영역 이름이 없어서
 * 명세 6절의 설명("TASK_SOLUTION은 실무 과제 해결, AI_USE는 AI 활용 역량")을 옮겨 둔다. 응답에 이름이 있으면 그것을 쓴다.
 */
export const DIMENSION_NAME: Record<DimensionCode, string> = {
    TASK_SOLUTION: '실무 과제 해결',
    AI_USE: 'AI 활용 역량',
};

const DIMENSION_ORDER: DimensionCode[] = ['TASK_SOLUTION', 'AI_USE'];

/** 이름 뒤의 조사. 받침이 있으면 a, 없으면 b (예: 은/는). 한글이 아니면 a */
export function josa(word: string, a: string, b: string): string {
    const code = word.trim().slice(-1).charCodeAt(0);
    if (!(code >= 0xac00 && code <= 0xd7a3)) return a;
    return (code - 0xac00) % 28 === 0 ? b : a;
}

// ───────────── 결과: 통과 여부와 이유 ─────────────

/** 통과하지 못한 이유 하나. 화면은 이 순서대로 보여 준다 */
export type FailReason =
    /** 필수 요건을 지키지 못했다 (실무 과제 해결 미충족) */
    | { code: 'REQUIRED_CHECK'; dimension: DimensionResult; check: RequiredCheckResult }
    /** 실무 과제 해결 점수가 최소 점수 미만 */
    | { code: 'TASK_SCORE'; dimension: DimensionResult; shortBy: number }
    /** 답변 검증이 검증 최소 점수 미만 (AI 활용 역량 미충족) */
    | { code: 'VERIFY_MIN'; dimension: DimensionResult; name: string; score: number; min: number; shortBy: number }
    /** AI 활용 역량 점수가 최소 점수 미만 */
    | { code: 'AI_SCORE'; dimension: DimensionResult; shortBy: number }
    /** 서버는 미충족이라고 했는데 위의 어느 것으로도 설명되지 않는다 (응답이 어긋난 경우의 안전망) */
    | { code: 'DIMENSION_UNMET'; dimension: DimensionResult };

export type Verdict =
    /** 채점이 끝나지 않았다 (점수와 판정이 null) */
    | { kind: 'pending' }
    /** 예전 기준: 총점이 min_total_score 이상이면 통과 */
    | { kind: 'legacy'; passed: boolean; total: number; minTotal: number; shortBy: number }
    /** 두 영역 기준 */
    | {
        kind: 'dual';
        passed: boolean;
        total: number;
        dimensions: DimensionResult[];
        checks: RequiredCheckResult[];
        verify: { name: string; score: number; min: number; met: boolean } | null;
        /** 두 영역의 점수가 모두 최소 점수 이상인지. 그런데도 미달이면 필수 요건이나 검증 최소 점수 때문이다 */
        scoresMet: boolean;
        reasons: FailReason[];
    };

/** 결과 응답에서 통과 여부와, 통과하지 못했다면 그 이유를 정리한다 */
export function verdictOf(r: AttemptResult): Verdict {
    if (r.status !== 'GRADED' || r.scores === null || r.total_score === null || r.passed === null) return { kind: 'pending' };
    const req = r.pass_requirements;
    if (req.version === 'LEGACY_TOTAL_V1') {
        return {
            kind: 'legacy',
            passed: r.passed,
            total: r.total_score,
            minTotal: req.min_total_score,
            shortBy: Math.max(req.min_total_score - r.total_score, 0),
        };
    }
    const dimensions = DIMENSION_ORDER
        .map((code) => r.dimensions?.find((d) => d.code === code))
        .filter((d): d is DimensionResult => !!d);
    const checks = r.required_checks ?? [];
    const v = r.scores.find((s) => s.criterion === 'VERIFY');
    const verify = v ? { name: v.name, score: v.score, min: req.verify_min_score, met: v.score >= req.verify_min_score } : null;
    return {
        kind: 'dual',
        passed: r.passed,
        total: r.total_score,
        dimensions,
        checks,
        verify,
        scoresMet: dimensions.every((d) => d.score >= d.min_score),
        reasons: r.passed ? [] : failReasons(dimensions, checks, verify),
    };
}

function failReasons(
    dimensions: DimensionResult[],
    checks: RequiredCheckResult[],
    verify: { name: string; score: number; min: number; met: boolean } | null,
): FailReason[] {
    const out: FailReason[] = [];
    for (const d of dimensions) {
        if (d.passed) continue;
        const before = out.length;
        if (d.code === 'TASK_SOLUTION') {
            for (const check of checks) if (!check.met) out.push({ code: 'REQUIRED_CHECK', dimension: d, check });
            if (d.score < d.min_score) out.push({ code: 'TASK_SCORE', dimension: d, shortBy: d.min_score - d.score });
        } else {
            if (verify && !verify.met) {
                out.push({ code: 'VERIFY_MIN', dimension: d, name: verify.name, score: verify.score, min: verify.min, shortBy: verify.min - verify.score });
            }
            if (d.score < d.min_score) out.push({ code: 'AI_SCORE', dimension: d, shortBy: d.min_score - d.score });
        }
        if (out.length === before) out.push({ code: 'DIMENSION_UNMET', dimension: d });
    }
    return out;
}

/** 이유 하나를 사용자에게 하는 말로. title은 무엇이 부족했는지, next는 다음에 할 일 */
export function describeReason(reason: FailReason): { title: string; detail: string; next: string } {
    const d = reason.dimension;
    switch (reason.code) {
        case 'REQUIRED_CHECK':
            return {
                title: '이 과제에서 꼭 지켜야 할 것을 지키지 못했어요',
                detail: `"${reason.check.label}"`,
                next: '이 요건은 다른 점수가 높아도 꼭 지켜야 해요. 제출하기 전에 답안에서 직접 확인해 보세요.',
            };
        case 'TASK_SCORE':
            return {
                title: `${d.name} 점수가 기준보다 ${reason.shortBy}점 모자라요`,
                detail: `${d.score}점을 받았어요. 최소 ${d.min_score}점이 필요해요.`,
                next: '항목별 점수의 결과물 피드백에서 빠진 내용을 확인해 보세요.',
            };
        case 'VERIFY_MIN':
            return {
                title: `${reason.name} 점수가 최소 점수보다 ${reason.shortBy}점 모자라요`,
                detail: d.score >= d.min_score
                    ? `${reason.score}점을 받았어요. ${d.name} 점수가 충분해도 ${reason.name}${josa(reason.name, '은', '는')} 따로 최소 ${reason.min}점이 필요해요.`
                    : `${reason.score}점을 받았어요. ${reason.name}${josa(reason.name, '은', '는')} ${d.name} 점수와 따로 최소 ${reason.min}점이 필요해요.`,
                next: 'AI가 말한 숫자와 날짜를 제공 자료와 맞춰 보고, 다르면 AI에게 짚어서 물어보세요.',
            };
        case 'AI_SCORE':
            return {
                title: `${d.name} 점수가 기준보다 ${reason.shortBy}점 모자라요`,
                detail: `${d.score}점을 받았어요. 최소 ${d.min_score}점이 필요해요.`,
                next: '항목별 점수에서 이 영역의 가장 낮은 항목을 먼저 보완해 보세요.',
            };
        case 'DIMENSION_UNMET':
            return {
                title: `${d.name}의 기준을 충족하지 못했어요`,
                detail: `${d.score}점을 받았어요. 최소 ${d.min_score}점이 필요해요.`,
                next: '항목별 점수와 피드백을 확인해 보세요.',
            };
    }
}

// ───────────── 안내: 두 영역으로 묶은 평가 기준 ─────────────

export interface CriteriaGroup {
    code: DimensionCode;
    name: string;
    /** 영역 배점 (항목 배점의 합) */
    max: number;
    /** 영역 최소 점수 */
    min: number;
    criteria: (Criterion & { min?: number })[];
}

export type CriteriaOverview =
    | {
        kind: 'dual';
        groups: CriteriaGroup[];
        verify: { code: CriterionCode; name: string; min: number } | null;
        checks: { check_id: string; label: string }[];
    }
    | { kind: 'legacy'; criteria: Criterion[]; max: number; minTotal: number };

/**
 * 과제 안내와 시험 화면에서 보여 줄 평가 기준. 항목을 영역별로 묶고, 숫자는 모두 응답에서 가져온다.
 * 답변 검증처럼 따로 최소 점수가 있는 항목에는 min을 붙인다.
 */
export function criteriaOverview(criteria: Criterion[], req: PassRequirements): CriteriaOverview {
    if (req.version === 'LEGACY_TOTAL_V1') {
        return { kind: 'legacy', criteria, max: criteria.reduce((s, c) => s + c.max_score, 0), minTotal: req.min_total_score };
    }
    const verifyItem = criteria.find((c) => c.code === 'VERIFY');
    const groups = DIMENSION_ORDER.map((code): CriteriaGroup => {
        const items = criteria
            .filter((c) => c.dimension === code)
            .map((c) => (c.code === 'VERIFY' ? { ...c, min: req.verify_min_score } : c));
        return {
            code,
            name: DIMENSION_NAME[code],
            max: items.reduce((s, c) => s + c.max_score, 0),
            min: code === 'TASK_SOLUTION' ? req.task_solution_min_score : req.ai_use_min_score,
            criteria: items,
        };
    }).filter((g) => g.criteria.length > 0);
    return {
        kind: 'dual',
        groups,
        verify: verifyItem ? { code: verifyItem.code, name: verifyItem.name, min: req.verify_min_score } : null,
        checks: req.required_checks.map(({ check_id, label }) => ({ check_id, label })),
    };
}

/**
 * 통과 조건을 영역마다 한 문장으로. 과제 안내와 시험 화면이 같은 문장을 쓴다.
 * 예: "결과물 40점 이상, 그리고 꼭 지켜야 할 것 1가지를 모두 지키기"
 */
export function groupRule(group: CriteriaGroup, overview: Extract<CriteriaOverview, { kind: 'dual' }>): string {
    const names = group.criteria.map((c) => c.name);
    const score = names.length === 1 ? `${names[0]} ${group.min}점 이상` : `${names.join(' + ')} 합계 ${group.min}점 이상`;
    if (group.code === 'TASK_SOLUTION') {
        return overview.checks.length ? `${score}, 그리고 꼭 지켜야 할 것 ${overview.checks.length}가지를 모두 지키기` : score;
    }
    const v = overview.verify;
    return v && group.criteria.some((c) => c.code === v.code) ? `${score}, 그리고 그중 ${v.name} ${v.min}점 이상` : score;
}
