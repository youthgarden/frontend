// 설계/2_API명세서.md의 응답 형식을 그대로 옮긴 타입.
// 필드 이름은 명세를 따라 snake_case로 둔다. 화면에서 다른 이름으로 바꿔 쓰지 않는다.

export type ErrorCode =
    | 'INVALID_CREDENTIALS' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'INVALID_REFRESH_TOKEN'
    | 'LOGIN_ID_TAKEN' | 'INVALID_JOB'
    | 'LECTURE_NOT_FOUND' | 'TASK_NOT_FOUND' | 'ATTEMPT_NOT_FOUND'
    | 'LECTURE_NOT_COMPLETED'
    | 'ATTEMPT_NOT_IN_PROGRESS' | 'ATTEMPT_ALREADY_IN_PROGRESS' | 'ATTEMPT_TIME_OVER' | 'ATTEMPT_NOT_REGRADABLE'
    | 'AI_UNAVAILABLE'
    // 아래 둘은 명세에 없고 프론트가 만든다: 서버에 닿지 못함 / 형식을 알 수 없는 응답
    | 'NETWORK_ERROR' | 'UNKNOWN';

export interface Job { id: number; name: string }

export interface SignupRequest { login_id: string; password: string; nickname: string; job_id: number }
export interface SignupResponse { id: number; login_id: string; nickname: string; job: Job; level: number }
export interface LoginRequest { login_id: string; password: string }
export interface TokenResponse { access_token: string; token_type: 'bearer'; expires_in: number }

export interface Me {
    id: number;
    login_id: string;
    nickname: string;
    job: Job;
    /** 1~6. 6이 Lv.MAX */
    level: number;
    passed_task_count: number;
    tutorial_seen: boolean;
}

export interface LectureSummary {
    id: number;
    title: string;
    duration_sec: number;
    /** 0~1 */
    progress_rate: number;
    completed: boolean;
}
export interface LectureDashboard { completed_count: number; total_count: number; lectures: LectureSummary[] }
export interface LectureDetail extends LectureSummary { youtube_video_id: string; last_position_sec: number }
export interface ProgressRequest { watched_ranges: [number, number][]; position_sec: number }
export interface ProgressResponse { progress_rate: number; completed: boolean; just_completed: boolean }

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

// ── 멀티플레이 (WebSocket /ws/map) ──
export type Dir = 'up' | 'down' | 'left' | 'right';
export interface MapPlayer { user_id: number; nickname: string; level: number; x: number; y: number; dir: Dir; moving: boolean }
export type MapClientMessage =
    | { type: 'auth'; access_token: string }
    | { type: 'move'; x: number; y: number; dir: Dir; moving: boolean };
export type MapServerMessage =
    | { type: 'snapshot'; me: { x: number; y: number; dir: Dir }; players: MapPlayer[] }
    | { type: 'player_joined'; player: MapPlayer }
    | { type: 'player_moved'; user_id: number; x: number; y: number; dir: Dir; moving: boolean }
    | { type: 'player_updated'; user_id: number; level: number }
    | { type: 'player_left'; user_id: number };
