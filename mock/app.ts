// 모의 서버 본체: REST 라우팅과 처리. 명세(설계/2_API명세서.md)의 경로·상태 코드·에러 형식을 따른다.
// 검수용 API는 명세에 없으며 /api/v1/__mock__/ 아래에만 둔다.

import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
    AttemptInProgress, AttemptList, AttemptListItem, AttemptPendingResult, AttemptResult, AttemptTask, ChatMessage,
    Criterion as PublicCriterion, LectureDashboard, LectureDetail, LectureSummary, Me, PassRequirements, ProgressResponse,
    RequiredCheckResult, ScoreItem, SendMessageResponse, SignupResponse, TaskDetail, TaskSummary, TokenResponse,
} from '../src/api/types';
import { chatReply } from './ai';
import {
    clearRefreshCookie, findRefresh, forceExpire, hashPassword, issueRefresh, parseCookies, refreshCookie, signAccess,
    verifyAccess, verifyPassword, REFRESH_COOKIE,
} from './auth';
import { CRITERIA, DIMENSIONS, JOBS, LECTURES, TASKS, findLecture, findTask, type LectureDef, type TaskDef } from './content';
import { decide, grade, type Forced } from './grader';
import { Check, HttpError, ValidationError, fail, iso, pathId, readJson, writeReply, type Reply } from './http';
import { SEED_ACCOUNTS, SEED_PASSWORD, buildSeed } from './seed';
import {
    FAIL_REASONS, Store, type AttemptRow, type FailReason, type ForcedGrade, type GradingRubric, type MessageRow, type UserRow,
} from './store';
import { MapHub } from './ws';

export const API_PREFIX = '/api/v1';
const GRACE_MS = 60_000; // 마감 + 1분까지 제출을 받는다
const EVENT_TYPES = ['PASTE', 'BLUR', 'FOCUS'] as const;

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface MockOptions {
    root: string;
    accessTtlSec: number;
    log: (msg: string) => void;
}

interface Ctx {
    req: IncomingMessage;
    url: URL;
    params: string[];
    body: unknown;
    userId: number;
    token: string | null;
}

interface Route {
    method: string;
    re: RegExp;
    auth: boolean;
    /** normal: 150~400ms 지연. none: 지연 없음 (AI 대화는 핸들러 안에서 따로 기다린다) */
    delay: 'normal' | 'none';
    handler: (c: Ctx) => Reply | Promise<Reply>;
}

export class MockApp {
    private _store: Store | null = null;
    private timers = new Set<ReturnType<typeof setTimeout>>();
    readonly hub: MapHub;
    private routes: Route[] = [];

    constructor(private opt: MockOptions) {
        this.hub = new MapHub(() => this.store);
        this.defineRoutes();
    }

    get dbFile() {
        return path.join(this.opt.root, 'node_modules', '.cache', 'youthgarten-mock', 'db.json');
    }

    /** 첫 요청 때 불러온다. 서버가 재시작될 때 이전 인스턴스가 파일을 다 쓴 뒤에 읽기 위해서다 */
    get store(): Store {
        if (!this._store) {
            const s = new Store(this.dbFile, () => buildSeed(), this.opt.log);
            // 명세 9절 7: 채점 중에 서버가 내려갔으면 그 응시는 채점 실패로 바꾼다
            let failed = 0;
            for (const a of s.data.attempts) {
                if (a.status === 'GRADING') {
                    a.status = 'GRADING_FAILED';
                    failed += 1;
                }
            }
            if (failed) {
                this.opt.log(`채점 중이던 응시 ${failed}건을 채점 실패로 바꿨어요 (재채점으로 다시 시도)`);
                s.touch();
            }
            this._store = s;
        }
        return this._store;
    }

    dispose() {
        for (const t of this.timers) clearTimeout(t);
        this.timers.clear();
        this.hub.dispose();
        this._store?.flush();
    }

    private later(ms: number, fn: () => void) {
        const t = setTimeout(() => {
            this.timers.delete(t);
            fn();
        }, ms);
        this.timers.add(t);
    }

    // ───────────── 미들웨어 ─────────────

    middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? '';
        if (url !== '/api' && !url.startsWith('/api/') && !url.startsWith('/api?')) return next();
        void this.handle(req, res);
    };

    private async handle(req: IncomingMessage, res: ServerResponse) {
        try {
            const url = new URL(req.url ?? '/', 'http://mock.local');
            if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
                writeReply(res, { status: 404, body: { detail: 'Not Found' } });
                return;
            }
            const rel = url.pathname.slice(API_PREFIX.length);
            const method = (req.method ?? 'GET').toUpperCase();
            const candidates = this.routes.map((r) => ({ r, m: r.re.exec(rel) })).filter((x) => x.m);
            const hit = candidates.find((x) => x.r.method === method);
            if (!hit) {
                writeReply(res, candidates.length
                    ? { status: 405, body: { detail: 'Method Not Allowed' } }
                    : { status: 404, body: { detail: 'Not Found' } });
                return;
            }
            const { r: route, m } = hit;
            if (route.delay === 'normal') await sleep(rand(150, 400));

            let body: unknown;
            let bodyError: unknown = null;
            if (method !== 'GET' && method !== 'HEAD') {
                try {
                    body = await readJson(req);
                } catch (e) {
                    bodyError = e;
                }
            }

            const header = req.headers.authorization ?? '';
            const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim() ?? null;
            let userId = 0;
            if (route.auth) {
                const check = verifyAccess(token, this.store);
                if (!check.ok) fail(401, check.code);
                userId = check.userId;
            }
            if (bodyError) throw bodyError;

            const reply = await route.handler({ req, url, params: m!.slice(1), body, userId, token });
            writeReply(res, reply);
        } catch (e) {
            if (e instanceof HttpError) {
                writeReply(res, { status: e.status, body: { error: { code: e.code, message: e.message } } });
            } else if (e instanceof ValidationError) {
                writeReply(res, { status: 422, body: { detail: e.detail } });
            } else {
                this.opt.log(`처리 중 오류: ${(e as Error).stack ?? String(e)}`);
                writeReply(res, { status: 500, body: { error: { code: 'INTERNAL', message: '모의 서버에서 오류가 났어요.' } } });
            }
        }
    }

    private add(method: string, pattern: string, auth: boolean, handler: Route['handler'], delay: Route['delay'] = 'normal') {
        // {id} 자리는 숫자가 아니어도 잡는다. 숫자가 아니면 핸들러가 422를 준다 (FastAPI처럼)
        const re = new RegExp(`^${pattern.replace(/\{\w+\}/g, '([^/]+)')}/?$`);
        this.routes.push({ method, re, auth, handler, delay });
    }

    // ───────────── 공통 계산 ─────────────

    private userOf(c: Ctx): UserRow {
        return this.store.user(c.userId)!;
    }

    private meBody(u: UserRow): Me {
        return {
            id: u.id,
            login_id: u.login_id,
            nickname: u.nickname,
            job: JOBS.find((j) => j.id === u.job_id)!,
            level: u.level,
            passed_task_count: this.store.passedTaskIds(u.id).size,
            tutorial_seen: u.tutorial_seen,
        };
    }

    private lectureOf(u: UserRow, id: number): LectureDef {
        const l = findLecture(id);
        if (!l || l.job_id !== u.job_id) fail(404, 'LECTURE_NOT_FOUND');
        return l;
    }

    private taskOf(u: UserRow, id: number): TaskDef {
        const t = findTask(id);
        if (!t || t.job_id !== u.job_id) fail(404, 'TASK_NOT_FOUND');
        return t;
    }

    private lectureSummary(u: UserRow, l: LectureDef): LectureSummary {
        const p = this.store.progress(u.id, l.id);
        return {
            id: l.id,
            title: l.title,
            duration_sec: l.duration_sec,
            progress_rate: p ? Math.min(1, Math.round((p.watched_sec / l.duration_sec) * 100) / 100) : 0,
            completed: p?.completed_at != null,
        };
    }

    /** 내 응시. 없거나 남의 것이면 404 */
    private attemptOf(u: UserRow, id: number): AttemptRow {
        const a = this.store.data.attempts.find((x) => x.id === id);
        if (!a || a.user_id !== u.id) fail(404, 'ATTEMPT_NOT_FOUND');
        return a;
    }

    private lastAnswer(a: AttemptRow) {
        return a.revisions.length ? a.revisions[a.revisions.length - 1].content : '';
    }

    private remainingSec(a: AttemptRow) {
        return Math.max(0, Math.ceil((a.deadline_at - Date.now()) / 1000));
    }

    /** 채점 기준의 항목별 소속 영역과 배점 (명세 6절 criteria) */
    private publicCriteria(rubric: GradingRubric): PublicCriterion[] {
        return CRITERIA.map((c) => ({ code: c.code, name: c.name, dimension: c.dimension, max_score: rubric.criterion_max_scores[c.code] }));
    }

    /** 채점 기준의 공개 부분. 필수 요건의 판정 규칙(rule)은 내보내지 않는다 */
    private publicRequirements(rubric: GradingRubric): PassRequirements {
        if (rubric.version === 'LEGACY_TOTAL_V1') return { version: rubric.version, min_total_score: rubric.min_total_score };
        return {
            version: rubric.version,
            task_solution_min_score: rubric.task_solution_min_score,
            ai_use_min_score: rubric.ai_use_min_score,
            verify_min_score: rubric.verify_min_score,
            required_checks: rubric.required_checks.map((c) => ({ check_id: c.check_id, label: c.label })),
        };
    }

    /** 응시 화면용 과제. 평가 기준은 응시의 스냅샷에서 가져온다 */
    private attemptTask(t: TaskDef, rubric: GradingRubric): AttemptTask {
        return {
            id: t.id,
            title: t.title,
            situation: t.situation,
            instruction: t.instruction,
            materials: t.materials.map((m) => ({ ...m })),
            criteria: this.publicCriteria(rubric),
            pass_requirements: this.publicRequirements(rubric),
        };
    }

    private inProgressBody(a: AttemptRow, withAnswer: boolean): AttemptInProgress {
        const body: AttemptInProgress = {
            id: a.id,
            status: 'IN_PROGRESS',
            started_at: iso(a.started_at),
            deadline_at: iso(a.deadline_at),
            remaining_sec: this.remainingSec(a),
            task: this.attemptTask(findTask(a.task_id)!, a.grading_rubric_snapshot),
        };
        if (withAnswer) body.answer = this.lastAnswer(a);
        return body;
    }

    private message(m: MessageRow): ChatMessage {
        return { id: m.id, role: m.role, content: m.content, created_at: iso(m.created_at) };
    }

    /** 시간 규칙: 마감 + 1분이 지난 시험 중 응시를 마지막 저장 답안으로 자동 제출한다 */
    private autoSubmitOverdue(userId: number) {
        const now = Date.now();
        for (const a of this.store.data.attempts) {
            if (a.user_id === userId && a.status === 'IN_PROGRESS' && now > a.deadline_at + GRACE_MS) {
                a.status = 'GRADING';
                a.answer = this.lastAnswer(a);
                // 서버가 제출한 시각은 "마감 + 1분"으로 둔다. 며칠 뒤 돌아와도 제출 시각이 마감 근처로 보이게
                a.submitted_at = a.deadline_at + GRACE_MS;
                a.auto_submitted = true;
                this.store.touch();
                this.scheduleGrading(a.id);
            }
        }
    }

    private scheduleGrading(attemptId: number) {
        this.later(rand(4000, 6000), () => this.finishGrading(attemptId));
    }

    private finishGrading(attemptId: number) {
        const s = this.store;
        const a = s.data.attempts.find((x) => x.id === attemptId);
        if (!a || a.status !== 'GRADING') return;
        const flags = s.flags(a.user_id);
        const forcedGrade = flags.next_grade;
        const reason = flags.next_grade_reason;
        delete flags.next_grade;
        delete flags.next_grade_reason;
        try {
            if (forcedGrade === 'error') throw new Error('검수용으로 채점 실패를 지정했어요');
            const forced: Forced | undefined = forcedGrade === 'pass'
                ? { result: 'pass' }
                : forcedGrade === 'fail' ? { result: 'fail', reason } : undefined;
            const task = findTask(a.task_id)!;
            // 명세 9절: 응시의 채점 기준 스냅샷으로 채점한다 (과제의 기준이 그사이 바뀌어도 응시할 때의 기준)
            const g = grade(
                { task, rubric: a.grading_rubric_snapshot, answer: a.answer ?? '', messages: s.messagesOf(a.id), attempt: a },
                { forced },
            );
            a.scores = g.scores;
            a.required_check_results = g.checks;
            a.total_score = g.total;
            a.passed = g.passed;
            a.summary_feedback = g.summary;
            a.status = 'GRADED';
            // 명세 9절 5: level = min(1 + 통과한 서로 다른 과제 수, 6)
            const user = s.user(a.user_id);
            if (user) {
                const before = user.level;
                user.level = Math.min(1 + s.passedTaskIds(user.id).size, 6);
                a.leveled_up = user.level > before;
                if (a.leveled_up) this.hub.updateLevel(user.id, user.level);
            } else {
                a.leveled_up = false;
            }
        } catch (e) {
            this.opt.log(`응시 ${a.id} 채점 실패: ${(e as Error).message}`);
            a.status = 'GRADING_FAILED';
        }
        s.touch();
    }

    private resultBody(a: AttemptRow, u: UserRow, firstView: boolean): AttemptResult {
        const task = findTask(a.task_id)!;
        const graded = a.status === 'GRADED';
        const lecture = findLecture(task.lecture_id);
        const rubric = a.grading_rubric_snapshot;
        // 명세 7절: GRADED가 되기 전에는 점수와 판정에 관한 필드가 모두 null
        const scores: ScoreItem[] | null = graded
            ? CRITERIA.map((c) => {
                const s = a.scores.find((x) => x.criterion === c.code);
                return {
                    criterion: c.code,
                    name: c.name,
                    dimension: c.dimension,
                    score: s?.score ?? 0,
                    max_score: rubric.criterion_max_scores[c.code],
                    feedback: s?.feedback ?? '',
                    evidence_message_id: s?.evidence_message_id ?? null,
                };
            })
            : null;
        let dimensions: AttemptResult['dimensions'] = null;
        let requiredChecks: RequiredCheckResult[] | null = null;
        if (graded && rubric.version === 'DUAL_V1') {
            const results = a.required_check_results ?? [];
            // 영역별 점수와 충족 여부는 저장한 항목별 점수, 스냅샷, 필수 요건 판정으로 계산한다 (ERD attempt_score)
            dimensions = decide(rubric, a.scores, results).dimensions!.map((d) => ({
                code: d.code,
                name: DIMENSIONS.find((x) => x.code === d.code)!.name,
                score: d.score,
                max_score: d.max_score,
                min_score: d.min_score,
                passed: d.passed,
            }));
            requiredChecks = rubric.required_checks.map((c) => {
                const r = results.find((x) => x.check_id === c.check_id);
                return { check_id: c.check_id, label: c.label, met: r?.met ?? false, feedback: r?.feedback ?? '' };
            });
        }
        return {
            id: a.id,
            status: a.status,
            task: { id: task.id, title: task.title },
            started_at: iso(a.started_at),
            submitted_at: iso(a.submitted_at),
            answer: a.answer,
            total_score: graded ? a.total_score : null,
            passed: graded ? a.passed : null,
            pass_requirements: this.publicRequirements(rubric),
            dimensions,
            required_checks: requiredChecks,
            summary_feedback: graded ? a.summary_feedback : null,
            scores,
            recommended_lecture: lecture ? { id: lecture.id, title: lecture.title } : null,
            level_up: graded ? { leveled_up: !!a.leveled_up, level: u.level } : null,
            first_view: firstView,
        };
    }

    // ───────────── 라우트 ─────────────

    private defineRoutes() {
        // ── 인증 ──
        this.add('POST', '/auth/signup', false, (c) => {
            const v = new Check(c.body, 'body');
            const loginId = v.str('login_id', { min: 4, max: 30, pattern: /^[a-z0-9_]+$/ });
            v.str('password', { min: 8, max: 64 });
            const nickname = v.str('nickname', { min: 2, max: 20 });
            const jobId = v.int('job_id');
            v.done();
            const password = v.raw('password') as string;
            const s = this.store;
            if (s.data.users.some((u) => u.login_id === loginId)) fail(409, 'LOGIN_ID_TAKEN');
            const job = JOBS.find((j) => j.id === jobId);
            if (!job) fail(400, 'INVALID_JOB');
            const user: UserRow = {
                id: s.nextId('user'),
                login_id: loginId,
                password_hash: hashPassword(password),
                nickname,
                job_id: job.id,
                level: 1,
                tutorial_seen: false,
                created_at: Date.now(),
            };
            s.data.users.push(user);
            s.touch();
            const body: SignupResponse = { id: user.id, login_id: user.login_id, nickname: user.nickname, job, level: 1 };
            return { status: 201, body };
        });

        const tokenReply = (userId: number): Reply => {
            const s = this.store;
            const body: TokenResponse = {
                access_token: signAccess(userId, s.data.epoch, this.opt.accessTtlSec),
                token_type: 'bearer',
                expires_in: this.opt.accessTtlSec,
            };
            return { status: 200, body, headers: { 'Set-Cookie': refreshCookie(issueRefresh(userId, s)) } };
        };

        this.add('POST', '/auth/login', false, (c) => {
            const v = new Check(c.body, 'body');
            const loginId = v.str('login_id');
            const password = v.str('password');
            v.done();
            const user = this.store.data.users.find((u) => u.login_id === loginId);
            // 아이디가 없는 경우와 비밀번호가 틀린 경우를 구분하지 않는다
            if (!user || !verifyPassword(password, user.password_hash)) fail(401, 'INVALID_CREDENTIALS');
            return tokenReply(user.id);
        });

        this.add('POST', '/auth/refresh', false, (c) => {
            const raw = parseCookies(c.req.headers.cookie)[REFRESH_COOKIE];
            const row = findRefresh(raw, this.store);
            if (!row || !this.store.user(row.user_id)) fail(401, 'INVALID_REFRESH_TOKEN');
            row.revoked_at = Date.now(); // rotation: 기존 토큰은 폐기
            return tokenReply(row.user_id);
        });

        this.add('POST', '/auth/logout', false, (c) => {
            const raw = parseCookies(c.req.headers.cookie)[REFRESH_COOKIE];
            const row = findRefresh(raw, this.store);
            if (row) {
                row.revoked_at = Date.now();
                this.store.touch();
            }
            return { status: 204, headers: { 'Set-Cookie': clearRefreshCookie() } };
        });

        // ── 직무, 회원 ──
        this.add('GET', '/jobs', false, () => ({ status: 200, body: JOBS }));

        this.add('GET', '/users/me', true, (c) => ({ status: 200, body: this.meBody(this.userOf(c)) }));

        this.add('PATCH', '/users/me', true, (c) => {
            const v = new Check(c.body, 'body');
            const seen = v.bool('tutorial_seen');
            v.done();
            const u = this.userOf(c);
            u.tutorial_seen = seen;
            this.store.touch();
            return { status: 200, body: this.meBody(u) };
        });

        // ── 강의 ──
        this.add('GET', '/lectures', true, (c) => {
            const u = this.userOf(c);
            const lectures = LECTURES.filter((l) => l.job_id === u.job_id).sort((a, b) => a.sort_order - b.sort_order).map((l) => this.lectureSummary(u, l));
            const body: LectureDashboard = { completed_count: lectures.filter((l) => l.completed).length, total_count: lectures.length, lectures };
            return { status: 200, body };
        });

        this.add('GET', '/lectures/{id}', true, (c) => {
            const id = pathId(c.params[0]);
            const u = this.userOf(c);
            const l = this.lectureOf(u, id);
            const body: LectureDetail = {
                ...this.lectureSummary(u, l),
                youtube_video_id: l.youtube_video_id,
                last_position_sec: this.store.progress(u.id, l.id)?.last_position_sec ?? 0,
            };
            return { status: 200, body };
        });

        this.add('POST', '/lectures/{id}/progress', true, (c) => {
            const id = pathId(c.params[0]);
            const v = new Check(c.body, 'body');
            const rawRanges = v.raw('watched_ranges');
            const position = v.num('position_sec');
            const ranges: [number, number][] = [];
            if (rawRanges === undefined || rawRanges === null) {
                v.add({ field: 'watched_ranges', type: 'missing', msg: 'Field required', input: c.body });
            } else if (!Array.isArray(rawRanges)) {
                v.add({ field: 'watched_ranges', type: 'list_type', msg: 'Input should be a valid list', input: rawRanges });
            } else if (rawRanges.length > 20) {
                v.add({ field: 'watched_ranges', type: 'too_long', msg: `List should have at most 20 items after validation, not ${rawRanges.length}`, input: rawRanges, ctx: { field_type: 'List', max_length: 20, actual_length: rawRanges.length } });
            } else {
                rawRanges.forEach((r, i) => {
                    if (!Array.isArray(r) || r.length !== 2 || !r.every((x) => typeof x === 'number' && Number.isFinite(x))) {
                        v.add({ field: ['watched_ranges', i], type: 'tuple_type', msg: 'Input should be a valid tuple of two numbers', input: r });
                    } else {
                        ranges.push([r[0], r[1]]);
                    }
                });
            }
            v.done();

            const s = this.store;
            const u = this.userOf(c);
            const l = this.lectureOf(u, id);
            const d = l.duration_sec;
            const now = Date.now();
            let row = s.progress(u.id, l.id);
            const first = !row;

            // 1. 0~duration으로 자르고, 끝 ≤ 시작인 구간은 버린다
            const clipped = ranges
                .map(([a, b]) => [Math.min(Math.max(a, 0), d), Math.min(Math.max(b, 0), d)] as [number, number])
                .filter(([a, b]) => b > a);
            // 2. 조작 방지: 구간 합이 (지금 − 마지막 보고) + 5초를 넘으면 초과분을 버린다. 첫 보고는 15초까지
            let budget = first ? 15 : (now - row!.updated_at) / 1000 + 5;
            const kept: [number, number][] = [];
            for (const [a, b] of clipped) {
                if (budget <= 0) break;
                const take = Math.min(b - a, budget);
                kept.push([a, a + take]);
                budget -= take;
            }
            // 3. 수강 기록 행을 확보한다 (모의 서버는 한 프로세스라 잠금이 필요 없다)
            if (!row) {
                row = { user_id: u.id, lecture_id: l.id, watched_ranges: [], watched_sec: 0, last_position_sec: 0, completed_at: null, updated_at: now };
                s.data.progress.push(row);
            }
            // 4. 기존 구간과 합쳐 겹치는 부분을 하나로
            const all = [...row.watched_ranges, ...kept].sort((a, b) => a[0] - b[0]);
            const merged: [number, number][] = [];
            for (const [a, b] of all) {
                const last = merged[merged.length - 1];
                if (last && a <= last[1]) last[1] = Math.max(last[1], b);
                else merged.push([a, b]);
            }
            row.watched_ranges = merged.map(([a, b]) => [Math.round(a * 100) / 100, Math.round(b * 100) / 100]);
            // 5. watched_sec를 다시 계산하고, 처음 80% 이상이 되면 완료
            row.watched_sec = Math.round(merged.reduce((sum, [a, b]) => sum + (b - a), 0));
            row.last_position_sec = Math.round(Math.min(Math.max(position, 0), d));
            row.updated_at = now;
            let just = false;
            if (row.completed_at === null && row.watched_sec / d >= 0.8) {
                row.completed_at = now;
                just = true;
            }
            s.touch();
            const sum = this.lectureSummary(u, l);
            const body: ProgressResponse = { progress_rate: sum.progress_rate, completed: sum.completed, just_completed: just };
            return { status: 200, body };
        });

        // ── 과제 ──
        this.add('GET', '/tasks', true, (c) => {
            const u = this.userOf(c);
            const s = this.store;
            const body: TaskSummary[] = TASKS.filter((t) => t.job_id === u.job_id).sort((a, b) => a.sort_order - b.sort_order).map((t) => {
                const l = findLecture(t.lecture_id)!;
                const done = s.isLectureCompleted(u.id, l.id);
                const graded = s.data.attempts.filter((a) => a.user_id === u.id && a.task_id === t.id && a.status === 'GRADED');
                return {
                    id: t.id,
                    title: t.title,
                    time_limit_min: t.time_limit_min,
                    required_lecture: { id: l.id, title: l.title, completed: done },
                    available: done,
                    passed: graded.some((a) => a.passed),
                    best_score: graded.length ? Math.max(...graded.map((a) => a.total_score ?? 0)) : null,
                };
            });
            return { status: 200, body };
        });

        this.add('GET', '/tasks/{id}', true, (c) => {
            const id = pathId(c.params[0]);
            const u = this.userOf(c);
            const t = this.taskOf(u, id);
            if (!this.store.isLectureCompleted(u.id, t.lecture_id)) fail(403, 'LECTURE_NOT_COMPLETED');
            const body: TaskDetail = {
                id: t.id,
                title: t.title,
                situation: t.situation,
                instruction: t.instruction,
                time_limit_min: t.time_limit_min,
                materials: t.materials.map((m) => ({ id: m.id, title: m.title })),
                // 응시 전 안내에는 과제의 현재 기준을 쓴다 (명세 6절)
                criteria: this.publicCriteria(t.rubric),
                pass_requirements: this.publicRequirements(t.rubric),
            };
            return { status: 200, body };
        });

        // ── 응시 ──
        this.add('POST', '/attempts', true, (c) => {
            const v = new Check(c.body, 'body');
            const taskId = v.int('task_id');
            v.done();
            const s = this.store;
            const u = this.userOf(c);
            const t = this.taskOf(u, taskId);
            if (!s.isLectureCompleted(u.id, t.lecture_id)) fail(403, 'LECTURE_NOT_COMPLETED');
            this.autoSubmitOverdue(u.id);
            if (s.data.attempts.some((a) => a.user_id === u.id && a.status === 'IN_PROGRESS')) fail(409, 'ATTEMPT_ALREADY_IN_PROGRESS');
            const now = Date.now();
            const a: AttemptRow = {
                id: s.nextId('attempt'),
                user_id: u.id,
                task_id: t.id,
                status: 'IN_PROGRESS',
                started_at: now,
                deadline_at: now + t.time_limit_min * 60_000,
                submitted_at: null,
                answer: null,
                // 명세 7절 POST /attempts 4: 과제의 채점 기준을 응시에 복사한다
                grading_rubric_snapshot: structuredClone(t.rubric),
                required_check_results: null,
                total_score: null,
                passed: null,
                leveled_up: null,
                summary_feedback: null,
                result_seen_at: null,
                auto_submitted: false,
                revisions: [],
                events: [],
                scores: [],
                trap: { state: 'none', injected_msg_id: null, challenge_msg_id: null },
            };
            s.data.attempts.push(a);
            s.touch();
            return { status: 201, body: this.inProgressBody(a, false) };
        });

        this.add('GET', '/attempts/current', true, (c) => {
            const u = this.userOf(c);
            this.autoSubmitOverdue(u.id);
            const mine = this.store.data.attempts.filter((a) => a.user_id === u.id);
            const running = mine.find((a) => a.status === 'IN_PROGRESS');
            if (running) return { status: 200, body: this.inProgressBody(running, true) };
            const unseen = mine
                .filter((a) => a.status !== 'IN_PROGRESS' && a.result_seen_at === null)
                .sort((a, b) => (b.submitted_at ?? 0) - (a.submitted_at ?? 0) || b.id - a.id)[0];
            if (unseen) {
                const body: AttemptPendingResult = { id: unseen.id, status: unseen.status as AttemptPendingResult['status'], auto_submitted: unseen.auto_submitted };
                return { status: 200, body };
            }
            return { status: 204 };
        });

        this.add('GET', '/attempts', true, (c) => {
            const q = Object.fromEntries(c.url.searchParams.entries());
            const v = new Check(q, 'query');
            const taskId = v.int('task_id', { optional: true });
            const page = v.int('page', { min: 1, def: 1 });
            const size = v.int('size', { min: 1, max: 100, def: 20 });
            v.done();
            const u = this.userOf(c);
            this.autoSubmitOverdue(u.id);
            const all = this.store.data.attempts
                .filter((a) => a.user_id === u.id && a.status !== 'IN_PROGRESS' && (Number.isNaN(taskId) || a.task_id === taskId))
                .sort((a, b) => (b.submitted_at ?? 0) - (a.submitted_at ?? 0) || b.id - a.id);
            const items: AttemptListItem[] = all.slice((page - 1) * size, page * size).map((a) => {
                const t = findTask(a.task_id)!;
                return {
                    id: a.id,
                    task: { id: t.id, title: t.title },
                    status: a.status as AttemptListItem['status'],
                    submitted_at: iso(a.submitted_at ?? a.started_at),
                    total_score: a.status === 'GRADED' ? a.total_score : null,
                    passed: a.status === 'GRADED' ? a.passed : null,
                };
            });
            const body: AttemptList = { items, page, size, total: all.length };
            return { status: 200, body };
        });

        this.add('GET', '/attempts/{id}', true, (c) => {
            const id = pathId(c.params[0]);
            const u = this.userOf(c);
            this.autoSubmitOverdue(u.id);
            const a = this.attemptOf(u, id);
            let first = false;
            if (a.status === 'GRADED' && a.result_seen_at === null) {
                a.result_seen_at = Date.now();
                first = true;
                this.store.touch();
            }
            return { status: 200, body: this.resultBody(a, u, first) };
        });

        this.add('DELETE', '/attempts/{id}', true, (c) => {
            const id = pathId(c.params[0]);
            const s = this.store;
            const a = this.attemptOf(this.userOf(c), id);
            if (a.status !== 'IN_PROGRESS') fail(409, 'ATTEMPT_NOT_IN_PROGRESS');
            s.data.attempts = s.data.attempts.filter((x) => x.id !== a.id);
            s.data.messages = s.data.messages.filter((m) => m.attempt_id !== a.id);
            s.touch();
            return { status: 204 };
        });

        /** 대화·답안·기록 공통: 내 응시인지, 시험 중인지, 마감 전인지 */
        const writable = (c: Ctx) => {
            const id = pathId(c.params[0]);
            const a = this.attemptOf(this.userOf(c), id);
            if (a.status !== 'IN_PROGRESS') fail(409, 'ATTEMPT_NOT_IN_PROGRESS');
            if (Date.now() > a.deadline_at) fail(400, 'ATTEMPT_TIME_OVER');
            return a;
        };

        this.add('POST', '/attempts/{id}/messages', true, async (c) => {
            pathId(c.params[0]);
            const v = new Check(c.body, 'body');
            const content = v.str('content', { min: 1, max: 4000 });
            v.done();
            const a = writable(c);
            const s = this.store;
            const askedAt = Date.now();
            const flags = s.flags(a.user_id);
            if (flags.next_ai_failure) {
                delete flags.next_ai_failure;
                s.touch();
                await sleep(rand(600, 1200));
                // 실패하면 질문도 저장하지 않는다
                fail(502, 'AI_UNAVAILABLE');
            }
            await sleep(rand(1000, 2500));
            // 기다리는 사이 포기했으면 대상이 없다
            const current = s.data.attempts.find((x) => x.id === a.id);
            if (!current) fail(404, 'ATTEMPT_NOT_FOUND');
            const task = findTask(current.task_id)!;
            const history = s.messagesOf(current.id).map((m) => ({ role: m.role, content: m.content }));
            const r = chatReply(task, history, content, current.trap, this.lastAnswer(current));
            const userMsg: MessageRow = { id: s.nextId('message'), attempt_id: current.id, role: 'USER', content, created_at: askedAt };
            const aiMsg: MessageRow = { id: s.nextId('message'), attempt_id: current.id, role: 'ASSISTANT', content: r.text, created_at: Date.now() };
            if (r.injects) current.trap = { ...current.trap, state: 'injected', injected_msg_id: aiMsg.id };
            if (r.corrects) current.trap = { ...current.trap, state: 'corrected', challenge_msg_id: userMsg.id };
            s.data.messages.push(userMsg, aiMsg);
            s.touch();
            const body: SendMessageResponse = { user_message: this.message(userMsg), assistant_message: this.message(aiMsg) };
            return { status: 201, body };
        }, 'none');

        this.add('GET', '/attempts/{id}/messages', true, (c) => {
            const id = pathId(c.params[0]);
            const a = this.attemptOf(this.userOf(c), id);
            return { status: 200, body: this.store.messagesOf(a.id).map((m) => this.message(m)) };
        });

        this.add('PUT', '/attempts/{id}/answer', true, (c) => {
            pathId(c.params[0]);
            const v = new Check(c.body, 'body');
            const content = v.str('content', { min: 0, max: 20000 });
            v.done();
            const a = writable(c);
            const now = Date.now();
            // 직전에 저장한 내용과 같으면 이력을 쌓지 않는다 (저장한 적이 없으면 빈 답안이 직전 내용이다)
            if (this.lastAnswer(a) !== content) {
                a.revisions.push({ content, created_at: now });
                this.store.touch();
            }
            return { status: 200, body: { saved_at: iso(now) } };
        });

        this.add('POST', '/attempts/{id}/events', true, (c) => {
            pathId(c.params[0]);
            const v = new Check(c.body, 'body');
            const type = v.oneOf('type', EVENT_TYPES);
            const payload = v.raw('payload');
            if (payload !== undefined && payload !== null) {
                if (typeof payload !== 'object' || Array.isArray(payload)) {
                    v.add({ field: 'payload', type: 'dict_type', msg: 'Input should be a valid dictionary', input: payload });
                } else if (Buffer.byteLength(JSON.stringify(payload)) > 1024) {
                    v.add({ field: 'payload', type: 'value_error', msg: 'Value error, payload must be at most 1KB', input: payload });
                }
            }
            v.done();
            const a = writable(c);
            a.events.push({ type, payload: payload ?? null, created_at: Date.now() });
            this.store.touch();
            return { status: 204 };
        });

        this.add('POST', '/attempts/{id}/submit', true, (c) => {
            const id = pathId(c.params[0]);
            const v = new Check(c.body, 'body');
            const answer = v.str('answer', { max: 20000 });
            v.done();
            const a = this.attemptOf(this.userOf(c), id);
            // 조건부 UPDATE 흉내: 시험 중이고 마감 + 1분 안일 때만
            if (a.status !== 'IN_PROGRESS' || Date.now() > a.deadline_at + GRACE_MS) fail(409, 'ATTEMPT_NOT_IN_PROGRESS');
            a.status = 'GRADING';
            a.answer = answer;
            a.submitted_at = Date.now();
            this.store.touch();
            this.scheduleGrading(a.id);
            return { status: 202, body: { id: a.id, status: 'GRADING' } };
        });

        this.add('POST', '/attempts/{id}/regrade', true, (c) => {
            const id = pathId(c.params[0]);
            const a = this.attemptOf(this.userOf(c), id);
            if (a.status !== 'GRADING_FAILED') fail(409, 'ATTEMPT_NOT_REGRADABLE');
            a.status = 'GRADING';
            this.store.touch();
            this.scheduleGrading(a.id);
            return { status: 202, body: { id: a.id, status: 'GRADING' } };
        });

        this.defineMockRoutes();
    }

    // ───────────── 검수용 API (명세에 없음) ─────────────

    private defineMockRoutes() {
        const M = '/__mock__';

        this.add('GET', `${M}/accounts`, false, () => {
            const s = this.store;
            const accounts = SEED_ACCOUNTS.map((a) => ({ ...a, level: s.data.users.find((u) => u.login_id === a.login_id)?.level ?? 1 }));
            return { status: 200, body: { password: SEED_PASSWORD, accounts } };
        }, 'none');

        this.add('POST', `${M}/reset`, false, () => {
            for (const t of this.timers) clearTimeout(t);
            this.timers.clear();
            this.store.reset();
            this.hub.closeAll();
            this.opt.log('데이터를 시드로 초기화했어요');
            return { status: 200, body: { ok: true, seeded_at: iso(this.store.data.seeded_at) } };
        }, 'none');

        this.add('GET', `${M}/state`, true, (c) => {
            const u = this.userOf(c);
            const flags = this.store.flags(u.id);
            const running = this.store.data.attempts.find((a) => a.user_id === u.id && a.status === 'IN_PROGRESS');
            return {
                status: 200,
                body: {
                    user: { id: u.id, login_id: u.login_id, nickname: u.nickname, level: u.level },
                    next_grade: flags.next_grade ?? null,
                    next_grade_reason: flags.next_grade_reason ?? null,
                    next_ai_failure: !!flags.next_ai_failure,
                    in_progress: running ? { id: running.id, task_id: running.task_id, remaining_sec: this.remainingSec(running) } : null,
                    access_ttl_sec: this.opt.accessTtlSec,
                },
            };
        }, 'none');

        this.add('POST', `${M}/lectures/{id}/complete`, true, (c) => {
            const id = pathId(c.params[0]);
            const s = this.store;
            const u = this.userOf(c);
            const l = this.lectureOf(u, id);
            const now = Date.now();
            let row = s.progress(u.id, l.id);
            if (!row) {
                row = { user_id: u.id, lecture_id: l.id, watched_ranges: [], watched_sec: 0, last_position_sec: 0, completed_at: null, updated_at: now };
                s.data.progress.push(row);
            }
            const just = row.completed_at === null;
            row.watched_ranges = [[0, l.duration_sec]];
            row.watched_sec = l.duration_sec;
            row.completed_at = row.completed_at ?? now;
            row.updated_at = now;
            s.touch();
            const body: ProgressResponse = { progress_rate: 1, completed: true, just_completed: just };
            return { status: 200, body };
        }, 'none');

        this.add('POST', `${M}/attempts/current/remaining`, true, (c) => {
            const v = new Check(c.body, 'body');
            const sec = v.int('remaining_sec', { min: -86_400, max: 86_400 });
            v.done();
            const running = this.store.data.attempts.find((a) => a.user_id === c.userId && a.status === 'IN_PROGRESS');
            if (!running) fail(404, 'ATTEMPT_NOT_FOUND');
            running.deadline_at = Date.now() + sec * 1000;
            this.store.touch();
            return { status: 200, body: { id: running.id, deadline_at: iso(running.deadline_at), remaining_sec: this.remainingSec(running) } };
        }, 'none');

        this.add('POST', `${M}/next-grade`, true, (c) => {
            const v = new Check(c.body, 'body');
            const raw = v.raw('result');
            const result = raw === null ? null : v.oneOf<ForcedGrade>('result', ['pass', 'fail', 'error']);
            // 선택: "미달"의 종류. result가 fail일 때만 받는다
            const rawReason = v.raw('reason');
            const reason = rawReason === undefined || rawReason === null ? null : v.oneOf<FailReason>('reason', FAIL_REASONS);
            if (reason && result !== 'fail') {
                v.add({ field: 'reason', type: 'value_error', msg: 'Value error, reason is only allowed when result is fail', input: rawReason });
            }
            v.done();
            const flags = this.store.flags(c.userId);
            if (result) flags.next_grade = result;
            else delete flags.next_grade;
            if (reason) flags.next_grade_reason = reason;
            else delete flags.next_grade_reason;
            this.store.touch();
            return { status: 200, body: { next_grade: result, reason } };
        }, 'none');

        this.add('POST', `${M}/next-ai-failure`, true, (c) => {
            const v = new Check(c.body ?? {}, 'body');
            const raw = v.raw('enabled');
            const enabled = raw === undefined ? true : v.bool('enabled');
            v.done();
            const flags = this.store.flags(c.userId);
            if (enabled) flags.next_ai_failure = true;
            else delete flags.next_ai_failure;
            this.store.touch();
            return { status: 200, body: { next_ai_failure: enabled } };
        }, 'none');

        this.add('POST', `${M}/expire-token`, true, (c) => {
            forceExpire(c.token!, this.store);
            return { status: 200, body: { expired: true } };
        }, 'none');
    }
}
