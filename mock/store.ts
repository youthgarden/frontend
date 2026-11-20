// 모의 서버의 데이터. 메모리에 두고, 바뀌면 짧은 지연 뒤 JSON 파일로 기록한다.
// 시각은 모두 밀리초 숫자(UTC)로 두고, 응답할 때 ISO 문자열로 바꾼다.

import fs from 'node:fs';
import path from 'node:path';

export type AttemptStatus = 'IN_PROGRESS' | 'GRADING' | 'GRADED' | 'GRADING_FAILED';
export type Criterion = 'RESULT' | 'PROMPT' | 'VERIFY' | 'IMPROVE';

export interface UserRow {
    id: number;
    login_id: string;
    password_hash: string;
    nickname: string;
    job_id: number;
    level: number;
    tutorial_seen: boolean;
    created_at: number;
}

export interface RefreshRow {
    id: number;
    user_id: number;
    token_hash: string;
    expires_at: number;
    revoked_at: number | null;
    created_at: number;
}

export interface ProgressRow {
    user_id: number;
    lecture_id: number;
    watched_ranges: [number, number][];
    watched_sec: number;
    last_position_sec: number;
    completed_at: number | null;
    updated_at: number;
}

export interface MessageRow {
    id: number;
    attempt_id: number;
    role: 'USER' | 'ASSISTANT';
    content: string;
    created_at: number;
}

export interface ScoreRow {
    criterion: Criterion;
    score: number;
    feedback: string;
    evidence_message_id: number | null;
    /**
     * 답변 검증의 근거가 답안 수정 이력이면 그 이력의 순번(revisions의 index). 명세 9절의 evidence_revision_id에 해당한다.
     * 결과 API에는 내보내지 않고, 그 내용을 feedback에 적는다
     */
    evidence_revision?: number | null;
}

/** 필수 요건 하나. label은 응시자에게 공개하고 rule은 채점에만 쓴다 (ERD task.grading_rubric) */
export interface RequiredCheckDef {
    check_id: string;
    label: string;
    rule: string;
}

/** 두 영역 기준 (ERD 3절) */
export interface DualRubric {
    version: 'DUAL_V1';
    task_solution_min_score: number;
    ai_use_min_score: number;
    verify_min_score: number;
    required_checks: RequiredCheckDef[];
    criterion_max_scores: Record<Criterion, number>;
}

/** 예전 기준: 항목별 25점, 총점 80점 이상 통과 (ERD attempt 표의 이행 규칙) */
export interface LegacyRubric {
    version: 'LEGACY_TOTAL_V1';
    criterion_max_scores: Record<Criterion, number>;
    min_total_score: number;
}

/** task.grading_rubric, attempt.grading_rubric_snapshot */
export type GradingRubric = DualRubric | LegacyRubric;

/** attempt.required_check_results의 한 줄 */
export interface CheckResultRow {
    check_id: string;
    met: boolean;
    feedback: string;
}

/** 모의 AI가 섞은 틀린 사실이 어떻게 됐는지 */
export interface TrapState {
    state: 'none' | 'injected' | 'corrected';
    /** 틀린 사실을 처음 말한 AI 메시지 */
    injected_msg_id: number | null;
    /** 사용자가 지적한 메시지 */
    challenge_msg_id: number | null;
}

export interface AttemptRow {
    id: number;
    user_id: number;
    task_id: number;
    status: AttemptStatus;
    started_at: number;
    deadline_at: number;
    submitted_at: number | null;
    answer: string | null;
    /** 응시를 만들 때 복사한 채점 기준. 이어 풀기, 채점, 재채점, 결과 조회에 쓴다 */
    grading_rubric_snapshot: GradingRubric;
    /** 두 영역 기준으로 채점이 끝나면 저장. 예전 기준이면 null */
    required_check_results: CheckResultRow[] | null;
    total_score: number | null;
    passed: boolean | null;
    leveled_up: boolean | null;
    summary_feedback: string | null;
    result_seen_at: number | null;
    /** 명세의 auto_submitted. ERD에는 컬럼이 없어 모의 서버만 따로 둔다 */
    auto_submitted: boolean;
    revisions: { content: string; created_at: number }[];
    events: { type: string; payload: unknown; created_at: number }[];
    scores: ScoreRow[];
    trap: TrapState;
}

export type ForcedGrade = 'pass' | 'fail' | 'error';

/**
 * 검수용 "미달"의 종류. 하나의 조건만 어긋나게 만든다.
 * task_score: 실무 과제 해결 점수 미달, required_check: 필수 요건 하나 미충족,
 * ai_score: AI 활용 역량 점수 미달(검증 최소 점수는 충족), verify_min: 검증 최소 점수만 미달(영역 점수는 충족)
 */
export const FAIL_REASONS = ['task_score', 'required_check', 'ai_score', 'verify_min'] as const;
export type FailReason = (typeof FAIL_REASONS)[number];

export interface UserFlags {
    next_grade?: ForcedGrade;
    /** next_grade가 fail일 때만 쓴다. 없으면 규칙 점수가 이미 미달이면 그대로, 아니면 두 영역 점수를 모두 낮춘다 */
    next_grade_reason?: FailReason;
    next_ai_failure?: boolean;
}

export interface DbData {
    version: number;
    /** 초기화할 때마다 바뀐다. 이전 데이터로 발급한 액세스 토큰을 무효로 만든다 */
    epoch: string;
    seeded_at: number;
    seq: { user: number; attempt: number; message: number; refresh: number };
    users: UserRow[];
    refresh_tokens: RefreshRow[];
    progress: ProgressRow[];
    attempts: AttemptRow[];
    messages: MessageRow[];
    /** 검수용 API로 즉시 만료시킨 액세스 토큰 (SHA-256 해시) */
    expired_tokens: { token_hash: string; exp: number }[];
    flags: Record<string, UserFlags>;
}

/** 2: 응시에 채점 기준 스냅샷과 필수 요건 판정을 더했다 (두 영역 채점). 1로 저장된 파일은 시드로 다시 시작한다 */
export const DB_VERSION = 2;

function isDb(v: unknown): v is DbData {
    if (!v || typeof v !== 'object') return false;
    const d = v as Record<string, unknown>;
    return d.version === DB_VERSION
        && typeof d.epoch === 'string'
        && typeof d.seq === 'object' && d.seq !== null
        && ['users', 'refresh_tokens', 'progress', 'attempts', 'messages', 'expired_tokens'].every((k) => Array.isArray(d[k]))
        && typeof d.flags === 'object' && d.flags !== null;
}

export class Store {
    data: DbData;
    private timer: ReturnType<typeof setTimeout> | null = null;

    constructor(
        private file: string,
        private seed: () => DbData,
        private log: (msg: string) => void,
    ) {
        this.data = this.load();
    }

    private load(): DbData {
        try {
            const raw = fs.readFileSync(this.file, 'utf8');
            const parsed: unknown = JSON.parse(raw);
            if (isDb(parsed)) {
                this.log(`저장된 데이터를 불러왔어요 (${path.relative(process.cwd(), this.file)})`);
                return parsed;
            }
            this.log('저장된 데이터의 형식이 맞지 않아 시드 데이터로 시작해요');
        } catch (e) {
            const code = (e as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') this.log('저장된 데이터를 읽지 못해 시드 데이터로 시작해요');
        }
        const fresh = this.seed();
        this.data = fresh;
        this.flush();
        return fresh;
    }

    reset() {
        this.data = this.seed();
        this.flush();
    }

    /** 변경을 알린다. 잠시 뒤 파일에 기록한다 */
    touch() {
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flush();
        }, 250);
    }

    flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            const tmp = `${this.file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.data));
            fs.renameSync(tmp, this.file);
        } catch (e) {
            this.log(`데이터를 파일에 쓰지 못했어요: ${(e as Error).message}`);
        }
    }

    nextId(kind: keyof DbData['seq']) {
        this.data.seq[kind] += 1;
        return this.data.seq[kind];
    }

    user(id: number) {
        return this.data.users.find((u) => u.id === id);
    }

    flags(userId: number): UserFlags {
        const key = String(userId);
        if (!this.data.flags[key]) this.data.flags[key] = {};
        return this.data.flags[key];
    }

    passedTaskIds(userId: number) {
        const ids = new Set<number>();
        for (const a of this.data.attempts) {
            if (a.user_id === userId && a.status === 'GRADED' && a.passed) ids.add(a.task_id);
        }
        return ids;
    }

    progress(userId: number, lectureId: number) {
        return this.data.progress.find((p) => p.user_id === userId && p.lecture_id === lectureId);
    }

    isLectureCompleted(userId: number, lectureId: number) {
        return this.progress(userId, lectureId)?.completed_at != null;
    }

    messagesOf(attemptId: number) {
        return this.data.messages.filter((m) => m.attempt_id === attemptId).sort((a, b) => a.id - b.id);
    }
}
