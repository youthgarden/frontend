// 시드 데이터. 여러 상태의 사용자를 바로 검수할 수 있게 만든다.
// 시간에 의존하는 값(진행 중인 시험의 마감 등)은 시드를 만드는 시각(서버 시작 또는 초기화)을 기준으로 한다.
// 지난 응시의 대화와 점수도 모의 AI와 모의 채점 함수로 만들어, 실제로 풀었을 때와 같은 모양이 되게 한다.

import crypto from 'node:crypto';
import { chatReply } from './ai';
import { hashPassword } from './auth';
import { LECTURES, LEGACY_RUBRIC, TASKS, findTask, type TaskDef } from './content';
import { grade, type Forced } from './grader';
import { DB_VERSION, type AttemptRow, type DbData, type GradingRubric, type MessageRow, type TrapState, type UserRow } from './store';

export const SEED_PASSWORD = 'password1234';

export interface SeedAccount {
    login_id: string;
    nickname: string;
    description: string;
}

export const SEED_ACCOUNTS: SeedAccount[] = [
    { login_id: 'jiwon01', nickname: '지원', description: '방금 가입. Lv.1, 첫 입장 안내 전, 수강 기록 없음' },
    { login_id: 'minjae03', nickname: '민재', description: 'Lv.2. 과제 1 통과, 강의 1·2 완료, 과제 2를 푸는 중' },
    { login_id: 'seoyeon02', nickname: '서연', description: 'Lv.3. 강의 1~3 완료·4는 30%, 과제 1(예전 기준)·2 통과, 과제 3 미달(필수 요건 미충족, 답변 검증 0점)' },
    { login_id: 'yuna05', nickname: '유나', description: 'Lv.5. 강의 모두 완료, 과제 1~4 통과. 과제 5만 남음' },
    { login_id: 'jeonghun04', nickname: '정훈', description: 'Lv.MAX. 모든 과제 통과' },
];

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

class Builder {
    db: DbData;

    constructor(private now: number) {
        this.db = {
            version: DB_VERSION,
            epoch: crypto.randomBytes(8).toString('hex'),
            seeded_at: now,
            seq: { user: 0, attempt: 1000, message: 5000, refresh: 0 },
            users: [],
            refresh_tokens: [],
            progress: [],
            attempts: [],
            messages: [],
            expired_tokens: [],
            flags: {},
        };
    }

    user(login_id: string, nickname: string, tutorial_seen: boolean, createdDaysAgo: number): UserRow {
        const u: UserRow = {
            id: ++this.db.seq.user,
            login_id,
            password_hash: hashPassword(SEED_PASSWORD),
            nickname,
            job_id: 1,
            level: 1,
            tutorial_seen,
            created_at: this.now - createdDaysAgo * DAY,
        };
        this.db.users.push(u);
        return u;
    }

    /** 강의를 rate만큼 앞에서부터 본 것으로 기록한다 */
    watch(user: UserRow, lectureId: number, rate: number, daysAgo: number) {
        const lecture = LECTURES.find((l) => l.id === lectureId)!;
        const watched = Math.round(lecture.duration_sec * rate);
        const at = this.now - daysAgo * DAY;
        this.db.progress.push({
            user_id: user.id,
            lecture_id: lectureId,
            watched_ranges: watched > 0 ? [[0, watched]] : [],
            watched_sec: watched,
            last_position_sec: watched >= lecture.duration_sec ? 0 : watched,
            completed_at: rate >= 0.8 ? at : null,
            updated_at: at,
        });
    }

    /** 대화를 모의 AI로 만들어 붙인다 */
    converse(attempt: AttemptRow, task: TaskDef, prompts: string[], startAt: number, answerAt: (i: number) => string) {
        const history: MessageRow[] = [];
        prompts.forEach((q, i) => {
            const at = startAt + (i + 1) * 3 * MIN;
            const userMsg: MessageRow = { id: ++this.db.seq.message, attempt_id: attempt.id, role: 'USER', content: q, created_at: at };
            const r = chatReply(task, history, q, attempt.trap, answerAt(i));
            const aiMsg: MessageRow = { id: ++this.db.seq.message, attempt_id: attempt.id, role: 'ASSISTANT', content: r.text, created_at: at + 4000 };
            if (r.injects) attempt.trap = { ...attempt.trap, state: 'injected', injected_msg_id: aiMsg.id };
            if (r.corrects) attempt.trap = { ...attempt.trap, state: 'corrected', challenge_msg_id: userMsg.id };
            history.push(userMsg, aiMsg);
        });
        this.db.messages.push(...history);
    }

    /**
     * 채점이 끝난 지난 응시.
     * 두 영역 기준이면 outcome으로 통과·미달을 정한다 (규칙 점수가 이미 그 결과면 그대로 쓴다).
     * 예전 기준(legacy)이면 legacyTotal로 총점을 맞춘다.
     */
    graded(user: UserRow, taskId: number, opt: {
        daysAgo: number;
        outcome?: Forced;
        legacyTotal?: number;
        prompts?: string[];
        answer?: string;
        revisions?: number;
    }) {
        const task = findTask(taskId)!;
        const started = this.now - opt.daysAgo * DAY;
        const prompts = opt.prompts ?? task.seedPrompts;
        const answer = opt.answer ?? task.seedAnswer;
        const trap: TrapState = { state: 'none', injected_msg_id: null, challenge_msg_id: null };
        const rubric: GradingRubric = opt.legacyTotal !== undefined ? structuredClone(LEGACY_RUBRIC) : structuredClone(task.rubric);
        const a: AttemptRow = {
            id: ++this.db.seq.attempt,
            user_id: user.id,
            task_id: taskId,
            status: 'GRADED',
            started_at: started,
            deadline_at: started + task.time_limit_min * MIN,
            submitted_at: started + 22 * MIN,
            answer,
            grading_rubric_snapshot: rubric,
            required_check_results: null,
            total_score: null,
            passed: null,
            leveled_up: null,
            summary_feedback: null,
            result_seen_at: started + 23 * MIN,
            auto_submitted: false,
            revisions: [],
            events: [],
            scores: [],
            trap,
        };
        const revCount = opt.revisions ?? 4;
        for (let i = 1; i <= revCount; i++) {
            const cut = Math.round((answer.length * i) / revCount);
            a.revisions.push({ content: answer.slice(0, cut), created_at: started + (5 + i * 3) * MIN });
        }
        this.converse(a, task, prompts, started, () => '');
        const g = grade(
            { task, rubric, answer, messages: this.db.messages.filter((m) => m.attempt_id === a.id), attempt: a },
            // 시드는 실행할 때마다 같은 점수가 나오도록 난수를 고정한다
            { forced: opt.outcome, legacyTarget: opt.legacyTotal, rng: () => 0.5 },
        );
        a.scores = g.scores;
        a.required_check_results = g.checks;
        a.total_score = g.total;
        a.passed = g.passed;
        a.summary_feedback = g.summary;
        const before = user.level;
        if (a.passed) {
            const passed = new Set(this.db.attempts.filter((x) => x.user_id === user.id && x.passed).map((x) => x.task_id));
            passed.add(taskId);
            user.level = Math.min(1 + passed.size, 6);
        }
        a.leveled_up = user.level > before;
        this.db.attempts.push(a);
        return a;
    }
}

export function buildSeed(now = Date.now()): DbData {
    const b = new Builder(now);

    // 지원: 방금 가입
    b.user('jiwon01', '지원', false, 0);

    // 민재: 과제 1 통과, 강의 1·2 완료, 과제 2를 푸는 중 (남은 시간 약 18분)
    const minjae = b.user('minjae03', '민재', true, 6);
    b.watch(minjae, 1, 1, 5);
    b.watch(minjae, 2, 0.9, 1);
    b.graded(minjae, 1, { daysAgo: 3, outcome: { result: 'pass' } });
    {
        const task = findTask(2)!;
        const started = now - 12 * MIN;
        const draft = [
            'QUOTATION — Elbe Trading GmbH',
            '',
            '| Model | Q\'ty | Unit Price | Amount |',
            '|---|---|---|---|',
            '| DL-200 | 1,000 pcs | USD 10.80 | USD 10,800.00 |',
            '| DL-300 | 500 pcs | USD 18.00 | USD 9,000.00 |',
        ].join('\n');
        const a: AttemptRow = {
            id: ++b.db.seq.attempt,
            user_id: minjae.id,
            task_id: 2,
            status: 'IN_PROGRESS',
            started_at: started,
            deadline_at: started + task.time_limit_min * MIN,
            submitted_at: null,
            answer: null,
            grading_rubric_snapshot: structuredClone(task.rubric),
            required_check_results: null,
            total_score: null,
            passed: null,
            leveled_up: null,
            summary_feedback: null,
            result_seen_at: null,
            auto_submitted: false,
            revisions: [
                { content: draft.split('\n').slice(0, 4).join('\n'), created_at: started + 7 * MIN },
                { content: draft, created_at: started + 10 * MIN },
            ],
            events: [],
            scores: [],
            trap: { state: 'none', injected_msg_id: null, challenge_msg_id: null },
        };
        b.converse(a, task, [
            '독일 바이어가 견적을 요청했어. 단가표 기준으로 모델별 단가와 금액을 정리해 줘.',
            '그 숫자로 영문 견적서 초안을 표 형식으로 만들어 줘.',
        ], started - MIN, () => '');
        b.db.attempts.push(a);
    }

    // 서연: 강의 1~3 완료, 4는 30%. 과제 1(한 번 미달 뒤 통과)·2 통과, 과제 3 미달.
    // 과제 1의 두 응시는 채점 기준이 바뀌기 전에 본 것이라 예전 기준(항목별 25점, 총점 80점 통과)으로 남아 있다
    const seoyeon = b.user('seoyeon02', '서연', true, 14);
    b.watch(seoyeon, 1, 1, 12);
    b.watch(seoyeon, 2, 0.95, 9);
    b.watch(seoyeon, 3, 0.85, 5);
    b.watch(seoyeon, 4, 0.3, 1);
    b.graded(seoyeon, 1, {
        daysAgo: 11,
        legacyTotal: 72,
        prompts: [
            '바이어 메일 요약해 줘',
            '바이어에게 보낼 회신 메일을 영문으로 써 줘. 사과와 새 일정을 포함해 줘.',
            '보상 내용도 추가해서 다시 써 줘.',
        ],
        answer: [
            'Dear Mr. Carter,',
            '',
            'We are very sorry for the delay of PO NW-2611. Our raw material supplier delivered the stainless coils late.',
            'The goods will depart Busan on November 21 and arrive in Los Angeles on December 6.',
            'Under Article 9 of our contract, we will compensate you with 0.5% of the contract value.',
            '',
            'Best regards,',
            'Haneul Kim',
        ].join('\n'),
        revisions: 3,
    });
    b.graded(seoyeon, 1, { daysAgo: 10, legacyTotal: 88 });
    b.graded(seoyeon, 2, { daysAgo: 7, outcome: { result: 'pass' } });
    // 질문 두 번으로 AI가 틀리게 말한 최종 선적일을 그대로 받아 썼다: 필수 요건 미충족, 답변 검증 0점
    b.graded(seoyeon, 3, {
        daysAgo: 2,
        outcome: { result: 'fail' },
        prompts: [
            '너는 무역 결제 담당자야. L/C 조건을 계약과 비교해서 문제 조항을 목록으로 정리해 줘.',
            '그 내용으로 수정 요청할 검토 메모를 써 줘.',
        ],
        answer: TASKS[2].reply.draft(true).replace(/^검토 메모 초안이에요\.\n\n---\n/, '').replace(/\n---$/, ''),
        revisions: 2,
    });

    // 유나: 강의 모두 완료, 과제 1~4 통과
    const yuna = b.user('yuna05', '유나', true, 30);
    for (const l of LECTURES) b.watch(yuna, l.id, 1, 30 - l.id * 5);
    // 답안 수정 횟수를 달리해 점수가 조금씩 다르게 나오게 한다
    [5, 4, 3, 4].forEach((revisions, i) => b.graded(yuna, i + 1, { daysAgo: 24 - i * 5, outcome: { result: 'pass' }, revisions }));

    // 정훈: 모든 과제 통과
    const jeonghun = b.user('jeonghun04', '정훈', true, 60);
    for (const l of LECTURES) b.watch(jeonghun, l.id, 1, 60 - l.id * 8);
    [5, 4, 3, 5, 4].forEach((revisions, i) => b.graded(jeonghun, i + 1, { daysAgo: 50 - i * 8, outcome: { result: 'pass' }, revisions }));

    return b.db;
}
