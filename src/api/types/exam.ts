// 설계/2_API명세서.md의 응답 형식을 그대로 옮긴 타입.
// 필드 이름은 명세를 따라 snake_case로 둔다. 화면에서 다른 이름으로 바꿔 쓰지 않는다.
// 검증받는 쪽: 과제, 응시 (명세 6~7절). 담당: 김균호

export interface TaskSummary {
    id: number;
    title: string;
    time_limit_min: number;
    required_lecture: { id: number; title: string; completed: boolean };
    available: boolean;
    /** 이 과제에 통과한 응시가 한 건 이상 있는지 */
    passed: boolean;
    /** 채점된 응시 중 최고 총점. 총점이 높아도 통과가 아닐 수 있다 (명세 6절) */
    best_score: number | null;
}

export type CriterionCode = 'RESULT' | 'PROMPT' | 'VERIFY' | 'IMPROVE';
/** 채점 영역. TASK_SOLUTION = 실무 과제 해결, AI_USE = AI 활용 역량 */
export type DimensionCode = 'TASK_SOLUTION' | 'AI_USE';

/** 채점 항목 하나의 소속 영역과 배점 */
export interface Criterion {
    code: CriterionCode;
    name: string;
    dimension: DimensionCode;
    max_score: number;
}

/** 과제별 필수 요건의 공개 부분. 판정 규칙(rule)은 응답에 오지 않는다 */
export interface RequiredCheck {
    check_id: string;
    label: string;
}

/** 두 영역 기준 (명세 6절, ERD 3절) */
export interface DualPassRequirements {
    version: 'DUAL_V1';
    task_solution_min_score: number;
    ai_use_min_score: number;
    verify_min_score: number;
    required_checks: RequiredCheck[];
}

/** 예전 기준: 총점이 min_total_score 이상이면 통과 (명세 7절 GET /attempts/{id}) */
export interface LegacyPassRequirements {
    version: 'LEGACY_TOTAL_V1';
    min_total_score: number;
}

/** 통과 기준. version으로 두 형태를 구분한다 */
export type PassRequirements = DualPassRequirements | LegacyPassRequirements;

export interface TaskDetail {
    id: number;
    title: string;
    situation: string;
    instruction: string;
    time_limit_min: number;
    materials: { id: number; title: string }[];
    criteria: Criterion[];
    /** 지금 과제의 공개 기준 */
    pass_requirements: PassRequirements;
}

export type AttemptStatus = 'IN_PROGRESS' | 'GRADING' | 'GRADED' | 'GRADING_FAILED';
export interface Material { id: number; title: string; content: string }
export interface AttemptTask {
    id: number;
    title: string;
    situation: string;
    instruction: string;
    materials: Material[];
    /** 응시를 만들 때 복사해 둔 채점 기준의 항목과 배점 */
    criteria: Criterion[];
    /** 응시를 만들 때 복사해 둔 공개 통과 기준 */
    pass_requirements: PassRequirements;
}

/** POST /attempts 응답, 그리고 GET /attempts/current의 "풀던 시험이 있음" 응답 */
export interface AttemptInProgress {
    id: number;
    status: 'IN_PROGRESS';
    started_at: string;
    deadline_at: string;
    remaining_sec: number;
    /** 이어 풀 때만 온다 */
    answer?: string;
    task: AttemptTask;
}
/** GET /attempts/current의 "나가 있는 동안 자동 제출됨" 응답 */
export interface AttemptPendingResult {
    id: number;
    status: Exclude<AttemptStatus, 'IN_PROGRESS'>;
    auto_submitted: boolean;
}
/** 204면 null */
export type CurrentAttempt = AttemptInProgress | AttemptPendingResult | null;

export interface ChatMessage { id: number; role: 'USER' | 'ASSISTANT'; content: string; created_at: string }
export interface SendMessageResponse { user_message: ChatMessage; assistant_message: ChatMessage }

export type AttemptEventType = 'PASTE' | 'BLUR' | 'FOCUS';

export interface ScoreItem {
    criterion: CriterionCode;
    name: string;
    dimension: DimensionCode;
    score: number;
    max_score: number;
    feedback: string;
    evidence_message_id: number | null;
}

/** 영역 하나의 점수와 최종 충족 여부. passed에는 필수 요건과 검증 최소 점수도 반영돼 있다 */
export interface DimensionResult {
    code: DimensionCode;
    name: string;
    score: number;
    max_score: number;
    min_score: number;
    passed: boolean;
}

/** 필수 요건 하나의 판정과 근거 */
export interface RequiredCheckResult extends RequiredCheck {
    met: boolean;
    feedback: string;
}

/**
 * GET /attempts/{id}. 채점이 끝나기(GRADED) 전에는 점수와 판정에 관한 필드가 모두 null이다.
 * 예전 기준(LEGACY_TOTAL_V1)의 응시는 채점이 끝나도 dimensions와 required_checks가 null이다.
 */
export interface AttemptResult {
    id: number;
    status: AttemptStatus;
    task: { id: number; title: string };
    started_at: string;
    submitted_at: string | null;
    answer: string | null;
    total_score: number | null;
    passed: boolean | null;
    /** 이 응시의 채점 기준 스냅샷에서 가져온 공개 기준 */
    pass_requirements: PassRequirements;
    dimensions: DimensionResult[] | null;
    required_checks: RequiredCheckResult[] | null;
    summary_feedback: string | null;
    scores: ScoreItem[] | null;
    recommended_lecture: { id: number; title: string } | null;
    level_up: { leveled_up: boolean; level: number } | null;
    first_view: boolean;
}
export interface AttemptListItem {
    id: number;
    task: { id: number; title: string };
    status: Exclude<AttemptStatus, 'IN_PROGRESS'>;
    submitted_at: string;
    total_score: number | null;
    /** 응시에 저장된 판정. 채점이 끝나기 전에는 null */
    passed: boolean | null;
}
export interface AttemptList { items: AttemptListItem[]; page: number; size: number; total: number }
