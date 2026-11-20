// 설계/2_API명세서.md의 응답 형식을 그대로 옮긴 타입.
// 필드 이름은 명세를 따라 snake_case로 둔다. 화면에서 다른 이름으로 바꿔 쓰지 않는다.
// 검증받는 쪽: 과제, 응시 (명세 6~7절). 담당: 김균호

export interface TaskSummary {
    id: number;
    title: string;
    time_limit_min: number;
    required_lecture: { id: number; title: string; completed: boolean };
    available: boolean;
    passed: boolean;
    best_score: number | null;
}
export type CriterionCode = 'RESULT' | 'PROMPT' | 'VERIFY' | 'IMPROVE';
export interface TaskDetail {
    id: number;
    title: string;
    situation: string;
    instruction: string;
    time_limit_min: number;
    materials: { id: number; title: string }[];
    criteria: { code: CriterionCode; name: string; max_score: number }[];
    pass_score: number;
}

export type AttemptStatus = 'IN_PROGRESS' | 'GRADING' | 'GRADED' | 'GRADING_FAILED';
export interface Material { id: number; title: string; content: string }
export interface AttemptTask { id: number; title: string; situation: string; instruction: string; materials: Material[] }

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
    score: number;
    max_score: number;
    feedback: string;
    evidence_message_id: number | null;
}
export interface AttemptResult {
    id: number;
    status: AttemptStatus;
    task: { id: number; title: string };
    started_at: string;
    submitted_at: string | null;
    answer: string | null;
    total_score: number | null;
    passed: boolean | null;
    pass_score: number;
    summary_feedback: string | null;
    scores: ScoreItem[];
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
    passed: boolean | null;
}
export interface AttemptList { items: AttemptListItem[]; page: number; size: number; total: number }
