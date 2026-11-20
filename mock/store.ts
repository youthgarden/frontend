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

export interface UserFlags {
    next_grade?: ForcedGrade;
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

export const DB_VERSION = 1;

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
