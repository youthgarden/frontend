// 모의 서버 smoke 검사. 실행 중인 서버에 실제 HTTP와 WebSocket으로 주요 흐름을 확인한다.
// 사용: node mock/smoke.mjs http://localhost:5180
// 시작할 때 검수용 API로 데이터를 초기화하고, 새로 가입한 계정으로 검사한다.
// 하나라도 실패하면 종료 코드 1. 마지막 줄에 "passed N, failed M"을 출력한다.

import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

// 맵의 크기와 시작 위치는 src/game/mapSpec.ts가 정한다. 값을 여기에 따로 적어 두면 맵이 바뀔 때 검사가 틀린다.
// 파일을 못 읽거나 값을 못 찾으면 검사를 건너뛰지 않고 여기서 멈춘다.
const mapSpecSource = readFileSync(new URL('../src/game/mapSpec.ts', import.meta.url), 'utf8');
function mapNumber(pattern, name) {
    const m = mapSpecSource.match(pattern);
    if (!m) throw new Error(`src/game/mapSpec.ts에서 ${name}을(를) 찾지 못했다`);
    return Number(m[1]);
}
const MAP_HEIGHT = mapNumber(/MAP_HEIGHT\s*=\s*(\d+)/, 'MAP_HEIGHT');
const SPAWN = { x: mapNumber(/SPAWN\s*=\s*\{\s*x:\s*(\d+)/, 'SPAWN.x'), y: mapNumber(/SPAWN\s*=\s*\{[^}]*y:\s*(\d+)/, 'SPAWN.y') };

const BASE = (process.argv[2] ?? 'http://localhost:5180').replace(/\/$/, '');
const API = `${BASE}/api/v1`;
const WS_URL = `${BASE.replace(/^http/, 'ws')}/api/v1/ws/map`;

let passed = 0;
let failed = 0;

function check(name, ok, detail) {
    if (ok) {
        passed += 1;
        console.log(`  ok   ${name}`);
    } else {
        failed += 1;
        console.log(`  FAIL ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 300)}`}`);
    }
    return ok;
}

function section(title) {
    console.log(`\n# ${title}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 요청 하나. cookie는 { value } 객체로 넘기면 Set-Cookie를 받아 갱신한다 */
async function call(method, path, { body, token, cookie, raw } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cookie?.value) headers.Cookie = `refresh_token=${cookie.value}`;
    const res = await fetch(API + path, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = text;
    }
    return { status: res.status, body: json, setCookies };
}

function refreshFrom(setCookies) {
    const c = setCookies.find((x) => x.startsWith('refresh_token='));
    if (!c) return null;
    return { header: c, value: c.slice('refresh_token='.length).split(';')[0] };
}

const code = (r) => r.body?.error?.code;

/** WebSocket을 열고 받은 메시지와 닫힘을 모은다 */
function openWs() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(WS_URL);
        const conn = { ws, messages: [], closed: null, waiters: [] };
        const notify = () => conn.waiters.splice(0).forEach((w) => w());
        ws.on('message', (d) => {
            try {
                conn.messages.push(JSON.parse(d.toString()));
            } catch {
                /* 무시 */
            }
            notify();
        });
        ws.on('close', (c, reason) => {
            conn.closed = { code: c, reason: reason.toString() };
            notify();
        });
        ws.on('open', () => resolve(conn));
        ws.on('error', reject);
    });
}

async function waitFor(conn, pred, ms = 3000) {
    const end = Date.now() + ms;
    for (;;) {
        const v = pred(conn);
        if (v) return v;
        const left = end - Date.now();
        if (left <= 0) return null;
        await new Promise((r) => {
            conn.waiters.push(r);
            setTimeout(r, Math.min(left, 200));
        });
    }
}

async function pollResult(id, token, until = (b) => b.status !== 'GRADING', ms = 15000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const r = await call('GET', `/attempts/${id}`, { token });
        if (r.status !== 200) return r;
        if (until(r.body)) return r;
        await sleep(1000);
    }
    return null;
}

async function main() {
    console.log(`모의 서버 smoke 검사: ${API}`);

    section('초기화');
    const reset = await call('POST', '/__mock__/reset');
    check('검수용 API로 데이터 초기화 200', reset.status === 200, reset);
    const accounts = await call('GET', '/__mock__/accounts');
    check('시드 계정 5개', accounts.status === 200 && accounts.body?.accounts?.length === 5, accounts.body);

    section('회원가입·로그인');
    const jobs = await call('GET', '/jobs');
    check('GET /jobs 200, 무역 사무', jobs.status === 200 && jobs.body?.[0]?.name === '무역 사무', jobs.body);
    const loginId = `smoke_${Date.now().toString(36)}`;
    const signup = await call('POST', '/auth/signup', { body: { login_id: loginId, password: 'password1234', nickname: '검사봇', job_id: 1 } });
    check('회원가입 201, level 1', signup.status === 201 && signup.body?.level === 1 && signup.body?.job?.id === 1, signup);
    const dup = await call('POST', '/auth/signup', { body: { login_id: loginId, password: 'password1234', nickname: '검사봇', job_id: 1 } });
    check('중복 아이디 409 LOGIN_ID_TAKEN', dup.status === 409 && code(dup) === 'LOGIN_ID_TAKEN', dup);
    const bad = await call('POST', '/auth/signup', { body: { login_id: 'AB', password: 'short', nickname: '검', job_id: 1 } });
    check('입력 규칙 위반 422 {detail:[...]}', bad.status === 422 && Array.isArray(bad.body?.detail) && bad.body.detail.length === 3, bad.body);
    const badJob = await call('POST', '/auth/signup', { body: { login_id: `${loginId}x`, password: 'password1234', nickname: '검사봇', job_id: 99 } });
    check('없는 직무 400 INVALID_JOB', badJob.status === 400 && code(badJob) === 'INVALID_JOB', badJob);

    const wrong = await call('POST', '/auth/login', { body: { login_id: loginId, password: 'wrong-password' } });
    check('잘못된 비밀번호 401 INVALID_CREDENTIALS', wrong.status === 401 && code(wrong) === 'INVALID_CREDENTIALS', wrong);
    const login = await call('POST', '/auth/login', { body: { login_id: loginId, password: 'password1234' } });
    const cookie1 = refreshFrom(login.setCookies);
    check('로그인 200, access_token과 expires_in', login.status === 200 && typeof login.body?.access_token === 'string' && login.body?.token_type === 'bearer' && login.body?.expires_in > 0, login.body);
    check('리프레시 토큰 쿠키 (HttpOnly, SameSite=Lax, Path=/api/v1/auth, Max-Age=1209600)',
        !!cookie1 && /HttpOnly/i.test(cookie1.header) && /SameSite=Lax/i.test(cookie1.header) && /Path=\/api\/v1\/auth/.test(cookie1.header) && /Max-Age=1209600/.test(cookie1.header),
        login.setCookies);
    let token = login.body?.access_token;

    const me = await call('GET', '/users/me', { token });
    check('GET /users/me 200, Lv.1, 안내 전', me.status === 200 && me.body?.level === 1 && me.body?.tutorial_seen === false && me.body?.passed_task_count === 0, me.body);
    const noToken = await call('GET', '/users/me');
    check('토큰 없음 401 INVALID_TOKEN', noToken.status === 401 && code(noToken) === 'INVALID_TOKEN', noToken);
    const junk = await call('GET', '/users/me', { token: 'not-a-token' });
    check('잘못된 토큰 401 INVALID_TOKEN', junk.status === 401 && code(junk) === 'INVALID_TOKEN', junk);
    const patch = await call('PATCH', '/users/me', { token, body: { tutorial_seen: true } });
    check('PATCH /users/me 200, tutorial_seen true', patch.status === 200 && patch.body?.tutorial_seen === true, patch.body);

    section('재발급과 토큰 만료');
    const ref = await call('POST', '/auth/refresh', { cookie: cookie1 });
    const cookie2 = refreshFrom(ref.setCookies);
    check('재발급 200, 새 리프레시 토큰', ref.status === 200 && typeof ref.body?.access_token === 'string' && !!cookie2 && cookie2.value !== cookie1?.value, ref);
    const reuse = await call('POST', '/auth/refresh', { cookie: cookie1 });
    check('이전 리프레시 토큰 폐기 401 INVALID_REFRESH_TOKEN', reuse.status === 401 && code(reuse) === 'INVALID_REFRESH_TOKEN', reuse);
    const noCookie = await call('POST', '/auth/refresh');
    check('쿠키 없이 재발급 401 INVALID_REFRESH_TOKEN', noCookie.status === 401 && code(noCookie) === 'INVALID_REFRESH_TOKEN', noCookie);
    token = ref.body?.access_token;
    const exp = await call('POST', '/__mock__/expire-token', { token });
    check('검수용 토큰 만료 200', exp.status === 200, exp);
    const expired = await call('GET', '/users/me', { token });
    check('만료된 액세스 토큰 401 TOKEN_EXPIRED', expired.status === 401 && code(expired) === 'TOKEN_EXPIRED', expired);
    const ref2 = await call('POST', '/auth/refresh', { cookie: cookie2 });
    let cookie = refreshFrom(ref2.setCookies);
    token = ref2.body?.access_token;
    const me2 = await call('GET', '/users/me', { token });
    check('재발급한 토큰으로 다시 요청 200', ref2.status === 200 && me2.status === 200, me2);

    section('강의');
    const dash = await call('GET', '/lectures', { token });
    check('강의 대시보드 5개, 완료 0', dash.status === 200 && dash.body?.total_count === 5 && dash.body?.completed_count === 0 && dash.body?.lectures?.length === 5, dash.body);
    const l1 = await call('GET', '/lectures/1', { token });
    check('강의 1 상세 (youtube_video_id, last_position_sec)', l1.status === 200 && l1.body?.youtube_video_id === 'aqz-KE-bpKQ' && l1.body?.last_position_sec === 0, l1.body);
    const l2 = await call('GET', '/lectures/2', { token });
    check('강의 2는 mock: 영상', l2.status === 200 && /^mock:/.test(l2.body?.youtube_video_id ?? ''), l2.body);
    const l99 = await call('GET', '/lectures/99', { token });
    check('없는 강의 404 LECTURE_NOT_FOUND', l99.status === 404 && code(l99) === 'LECTURE_NOT_FOUND', l99);
    const p1 = await call('POST', '/lectures/1/progress', { token, body: { watched_ranges: [[0, 600]], position_sec: 600 } });
    check('첫 보고는 15초까지만 인정 (600초 보고 → 0.02)', p1.status === 200 && p1.body?.progress_rate === 0.02 && p1.body?.completed === false && p1.body?.just_completed === false, p1.body);
    const p2 = await call('POST', '/lectures/1/progress', { token, body: { watched_ranges: [[15, 400]], position_sec: 400 } });
    check('다음 보고는 흐른 시간 + 5초까지만 인정', p2.status === 200 && p2.body?.progress_rate <= 0.04 && p2.body?.progress_rate > 0.02, p2.body);
    const l1b = await call('GET', '/lectures/1', { token });
    check('이어 보기 위치 저장 (position_sec)', l1b.body?.last_position_sec === 400, l1b.body);
    const tooMany = await call('POST', '/lectures/1/progress', { token, body: { watched_ranges: Array.from({ length: 21 }, (_, i) => [i, i + 1]), position_sec: 0 } });
    check('구간 21개 422', tooMany.status === 422, tooMany.body);

    section('과제와 시험 시작');
    const t1locked = await call('GET', '/tasks/1', { token });
    check('필수 강의 미수강 403 LECTURE_NOT_COMPLETED', t1locked.status === 403 && code(t1locked) === 'LECTURE_NOT_COMPLETED', t1locked);
    const startLocked = await call('POST', '/attempts', { token, body: { task_id: 1 } });
    check('미수강 상태로 시험 시작 403', startLocked.status === 403 && code(startLocked) === 'LECTURE_NOT_COMPLETED', startLocked);
    const comp = await call('POST', '/__mock__/lectures/1/complete', { token });
    check('검수용 강의 완료 처리 200', comp.status === 200 && comp.body?.completed === true, comp);
    const tasks = await call('GET', '/tasks', { token });
    check('과제 목록 5개, 과제 1 available', tasks.status === 200 && tasks.body?.length === 5 && tasks.body[0].available === true && tasks.body[1].available === false && tasks.body[0].best_score === null, tasks.body);
    const t1 = await call('GET', '/tasks/1', { token });
    check('과제 1 안내 (자료 3개, 평가 항목 4개, 통과 80)', t1.status === 200 && t1.body?.materials?.length === 3 && t1.body?.criteria?.length === 4 && t1.body?.pass_score === 80 && !('content' in (t1.body?.materials?.[0] ?? {})), t1.body);
    const none = await call('GET', '/attempts/current', { token });
    check('풀던 시험 없음 204', none.status === 204, none);
    const start = await call('POST', '/attempts', { token, body: { task_id: 1 } });
    check('시험 시작 201 (remaining_sec ≈ 1800, 자료 본문 포함)', start.status === 201 && start.body?.status === 'IN_PROGRESS' && start.body?.remaining_sec >= 1795 && start.body?.remaining_sec <= 1800 && typeof start.body?.task?.materials?.[0]?.content === 'string' && /Z$/.test(start.body?.deadline_at ?? ''), start.body);
    const attemptId = start.body?.id;
    const again = await call('POST', '/attempts', { token, body: { task_id: 1 } });
    check('중복 시작 409 ATTEMPT_ALREADY_IN_PROGRESS', again.status === 409 && code(again) === 'ATTEMPT_ALREADY_IN_PROGRESS', again);
    const cur = await call('GET', '/attempts/current', { token });
    check('GET /attempts/current 200 IN_PROGRESS (answer 포함)', cur.status === 200 && cur.body?.id === attemptId && cur.body?.status === 'IN_PROGRESS' && cur.body?.answer === '', cur.body);

    section('AI 대화와 답안');
    const m1 = await call('POST', `/attempts/${attemptId}/messages`, { token, body: { content: '너는 해외영업 담당자야. 바이어 메일과 선적 일정을 항목별로 요약해 줘.' } });
    check('AI 대화 201 (user_message, assistant_message)', m1.status === 201 && m1.body?.user_message?.role === 'USER' && m1.body?.assistant_message?.role === 'ASSISTANT', m1.body);
    check('모의 AI가 자료와 다른 선적일(11월 21일)을 섞음', /11월 21일/.test(m1.body?.assistant_message?.content ?? ''), m1.body?.assistant_message?.content);
    const m2 = await call('POST', `/attempts/${attemptId}/messages`, { token, body: { content: '선적 일정표와 대조해 보니 날짜가 다른 것 같아. 맞는지 확인해 줘.' } });
    check('지적하면 바로잡음 (11월 17일)', m2.status === 201 && /11월 17일/.test(m2.body?.assistant_message?.content ?? ''), m2.body?.assistant_message?.content);
    const empty = await call('POST', `/attempts/${attemptId}/messages`, { token, body: { content: '' } });
    check('빈 질문 422', empty.status === 422, empty.body);
    const answer = 'Dear Mr. Carter,\n\nPlease accept our sincere apologies. Due to a raw material supplier delay, the goods will depart Busan on November 17 and arrive in Los Angeles on December 1. We will compensate 0.5% (USD 240) under Article 9 and keep you informed.\n\nSincerely,\nHaneul Kim';
    const s1 = await call('PUT', `/attempts/${attemptId}/answer`, { token, body: { content: answer } });
    check('답안 저장 200 saved_at', s1.status === 200 && /Z$/.test(s1.body?.saved_at ?? ''), s1.body);
    const s2 = await call('PUT', `/attempts/${attemptId}/answer`, { token, body: { content: answer } });
    check('같은 답안 다시 저장 200', s2.status === 200, s2.body);
    const ev = await call('POST', `/attempts/${attemptId}/events`, { token, body: { type: 'PASTE', payload: { length: 120 } } });
    check('행동 기록 204', ev.status === 204, ev);
    const evBad = await call('POST', `/attempts/${attemptId}/events`, { token, body: { type: 'COPY' } });
    check('없는 행동 유형 422', evBad.status === 422, evBad.body);
    const msgs = await call('GET', `/attempts/${attemptId}/messages`, { token });
    check('대화 기록 4개, id 오름차순', msgs.status === 200 && msgs.body?.length === 4 && msgs.body.every((m, i, a) => i === 0 || a[i - 1].id < m.id), msgs.body);
    const cur2 = await call('GET', '/attempts/current', { token });
    check('이어 풀기 answer는 마지막 저장 답안', cur2.body?.answer === answer, cur2.body?.answer);

    section('제출과 채점');
    const force = await call('POST', '/__mock__/next-grade', { token, body: { result: 'pass' } });
    check('검수용 다음 채점 통과 지정', force.status === 200, force);
    const sub = await call('POST', `/attempts/${attemptId}/submit`, { token, body: { answer } });
    check('제출 202 GRADING', sub.status === 202 && sub.body?.status === 'GRADING' && sub.body?.id === attemptId, sub);
    const sub2 = await call('POST', `/attempts/${attemptId}/submit`, { token, body: { answer } });
    check('다시 제출 409 ATTEMPT_NOT_IN_PROGRESS', sub2.status === 409 && code(sub2) === 'ATTEMPT_NOT_IN_PROGRESS', sub2);
    const msgAfter = await call('POST', `/attempts/${attemptId}/messages`, { token, body: { content: '추가 질문' } });
    check('제출 뒤 대화 409', msgAfter.status === 409, msgAfter);
    const grading = await call('GET', `/attempts/${attemptId}`, { token });
    check('채점 중에는 점수 null', grading.status === 200 && grading.body?.status === 'GRADING' && grading.body?.total_score === null && grading.body?.first_view === false, grading.body);
    const result = await pollResult(attemptId, token);
    const rb = result?.body;
    check('채점 완료까지 폴링 → GRADED', rb?.status === 'GRADED', rb);
    check('통과 (80점 이상), 항목 4개', rb?.passed === true && rb?.total_score >= 80 && rb?.scores?.length === 4 && rb.scores.reduce((s, x) => s + x.score, 0) === rb.total_score, rb);
    check('항목별 피드백과 근거 메시지', rb?.scores?.every((s) => typeof s.feedback === 'string' && s.feedback.length > 0) && rb.scores.some((s) => typeof s.evidence_message_id === 'number'), rb?.scores);
    check('레벨 상승 (level_up Lv.2)과 first_view true', rb?.level_up?.leveled_up === true && rb?.level_up?.level === 2 && rb?.first_view === true, { level_up: rb?.level_up, first_view: rb?.first_view });
    const again2 = await call('GET', `/attempts/${attemptId}`, { token });
    check('두 번째 조회는 first_view false', again2.body?.first_view === false, again2.body?.first_view);
    const me3 = await call('GET', '/users/me', { token });
    check('내 정보 Lv.2, 통과 1', me3.body?.level === 2 && me3.body?.passed_task_count === 1, me3.body);
    const regradeBad = await call('POST', `/attempts/${attemptId}/regrade`, { token });
    check('채점 완료 응시 재채점 409 ATTEMPT_NOT_REGRADABLE', regradeBad.status === 409 && code(regradeBad) === 'ATTEMPT_NOT_REGRADABLE', regradeBad);

    section('지난 결과');
    const list = await call('GET', '/attempts', { token });
    check('지난 결과 목록 1건', list.status === 200 && list.body?.total === 1 && list.body?.items?.[0]?.id === attemptId && list.body?.page === 1 && list.body?.size === 20, list.body);
    const list2 = await call('GET', '/attempts?task_id=2', { token });
    check('task_id 필터 (과제 2) 0건', list2.status === 200 && list2.body?.total === 0, list2.body);
    const listBad = await call('GET', '/attempts?size=101', { token });
    check('size 101 422', listBad.status === 422, listBad.body);
    const t1b = await call('GET', '/tasks', { token });
    check('과제 목록에 통과와 최고 점수 반영', t1b.body?.[0]?.passed === true && t1b.body?.[0]?.best_score === rb?.total_score, t1b.body?.[0]);

    section('남의 응시');
    const other = await call('POST', '/auth/login', { body: { login_id: 'minjae03', password: 'password1234' } });
    const otherToken = other.body?.access_token;
    check('시드 계정 로그인 (minjae03)', other.status === 200, other);
    const peek = await call('GET', `/attempts/${attemptId}`, { token: otherToken });
    check('남의 응시 404 ATTEMPT_NOT_FOUND', peek.status === 404 && code(peek) === 'ATTEMPT_NOT_FOUND', peek);
    const peekMsgs = await call('GET', `/attempts/${attemptId}/messages`, { token: otherToken });
    check('남의 대화 기록 404', peekMsgs.status === 404, peekMsgs);
    const minjaeCur = await call('GET', '/attempts/current', { token: otherToken });
    check('minjae03은 과제 2를 푸는 중 (남은 시간 약 18분, 답안 있음)', minjaeCur.status === 200 && minjaeCur.body?.task?.id === 2 && minjaeCur.body?.remaining_sec > 900 && (minjaeCur.body?.answer ?? '').length > 0, minjaeCur.body && { id: minjaeCur.body.id, remaining_sec: minjaeCur.body.remaining_sec });

    section('포기하기, AI 실패, 자동 제출, 재채점');
    await call('POST', '/__mock__/lectures/2/complete', { token });
    const st2 = await call('POST', '/attempts', { token, body: { task_id: 2 } });
    check('과제 2 시작 201', st2.status === 201, st2);
    const give = await call('DELETE', `/attempts/${st2.body?.id}`, { token });
    check('포기하기 204', give.status === 204, give);
    const give2 = await call('DELETE', `/attempts/${st2.body?.id}`, { token });
    check('포기한 응시는 404', give2.status === 404 && code(give2) === 'ATTEMPT_NOT_FOUND', give2);
    const curAfterGive = await call('GET', '/attempts/current', { token });
    check('포기 뒤 current 204', curAfterGive.status === 204, curAfterGive);

    const st3 = await call('POST', '/attempts', { token, body: { task_id: 2 } });
    const a3 = st3.body?.id;
    await call('POST', '/__mock__/next-ai-failure', { token });
    const aiFail = await call('POST', `/attempts/${a3}/messages`, { token, body: { content: '견적 조건을 정리해 줘' } });
    check('AI 실패 502 AI_UNAVAILABLE', aiFail.status === 502 && code(aiFail) === 'AI_UNAVAILABLE', aiFail);
    const afterFail = await call('GET', `/attempts/${a3}/messages`, { token });
    check('AI 실패 때 질문도 저장하지 않음', afterFail.body?.length === 0, afterFail.body);
    const aiOk = await call('POST', `/attempts/${a3}/messages`, { token, body: { content: '견적 조건을 정리해 줘' } });
    check('다시 시도하면 201', aiOk.status === 201, aiOk);
    await call('PUT', `/attempts/${a3}/answer`, { token, body: { content: 'DL-200 USD 11.40' } });
    const timeOver = await call('POST', '/__mock__/attempts/current/remaining', { token, body: { remaining_sec: -10 } });
    check('검수용 남은 시간 변경 200', timeOver.status === 200 && timeOver.body?.remaining_sec === 0, timeOver.body);
    const late = await call('PUT', `/attempts/${a3}/answer`, { token, body: { content: 'late' } });
    check('마감 뒤 답안 저장 400 ATTEMPT_TIME_OVER', late.status === 400 && code(late) === 'ATTEMPT_TIME_OVER', late);
    await call('POST', '/__mock__/attempts/current/remaining', { token, body: { remaining_sec: -61 } });
    await call('POST', '/__mock__/next-grade', { token, body: { result: 'error' } });
    const auto = await call('GET', '/attempts/current', { token });
    check('마감 + 1분 뒤 자동 제출 (GRADING, auto_submitted)', auto.status === 200 && auto.body?.id === a3 && auto.body?.status === 'GRADING' && auto.body?.auto_submitted === true, auto.body);
    const failedRes = await pollResult(a3, token);
    check('채점 실패 지정 → GRADING_FAILED', failedRes?.body?.status === 'GRADING_FAILED' && failedRes?.body?.answer === 'DL-200 USD 11.40', failedRes?.body);
    const curFailed = await call('GET', '/attempts/current', { token });
    check('결과 안내 대상에 채점 실패 응시', curFailed.status === 200 && curFailed.body?.status === 'GRADING_FAILED', curFailed.body);
    const regrade = await call('POST', `/attempts/${a3}/regrade`, { token });
    check('재채점 202 GRADING', regrade.status === 202 && regrade.body?.status === 'GRADING', regrade);
    const regraded = await pollResult(a3, token);
    check('재채점 완료 GRADED', regraded?.body?.status === 'GRADED' && typeof regraded?.body?.total_score === 'number', regraded?.body?.status);

    section('WebSocket');
    const silent = await openWs();
    const t0 = Date.now();
    await waitFor(silent, (c) => c.closed, 7000);
    check('5초 안에 인증하지 않으면 4401', silent.closed?.code === 4401 && Date.now() - t0 >= 4500, silent.closed);
    const badAuth = await openWs();
    badAuth.ws.send(JSON.stringify({ type: 'auth', access_token: 'junk' }));
    await waitFor(badAuth, (c) => c.closed);
    check('잘못된 토큰 4401', badAuth.closed?.code === 4401, badAuth.closed);

    const a = await openWs();
    a.ws.send(JSON.stringify({ type: 'auth', access_token: token }));
    const snap = await waitFor(a, (c) => c.messages.find((m) => m.type === 'snapshot'));
    check(`snapshot (me = SPAWN ${SPAWN.x},${SPAWN.y})`, snap?.me?.x === SPAWN.x && snap?.me?.y === SPAWN.y && snap?.me?.dir === 'down', snap?.me);
    const bots = (snap?.players ?? []).filter((p) => p.user_id >= 9001);
    check('snapshot에 봇 4명 이상 (서로 다른 레벨)', bots.length >= 4 && new Set(bots.map((b) => b.level)).size >= 4, snap?.players);

    const b = await openWs();
    b.ws.send(JSON.stringify({ type: 'auth', access_token: otherToken }));
    await waitFor(b, (c) => c.messages.find((m) => m.type === 'snapshot'));
    const joined = await waitFor(a, (c) => c.messages.find((m) => m.type === 'player_joined' && m.player?.nickname === '민재'));
    check('player_joined', !!joined && joined.player.level === 2, joined);
    b.ws.send(JSON.stringify({ type: 'move', x: -100, y: 99999, dir: 'left', moving: true }));
    const otherId = joined?.player?.user_id;
    const moved = await waitFor(a, (c) => c.messages.find((m) => m.type === 'player_moved' && m.user_id === otherId));
    check('player_moved (좌표를 맵 범위로 자름)', moved?.x === 0 && moved?.y === MAP_HEIGHT && moved?.dir === 'left', moved);
    for (let i = 0; i < 20; i++) b.ws.send(JSON.stringify({ type: 'move', x: 100 + i, y: 300, dir: 'right', moving: true }));
    await sleep(600);
    const burst = a.messages.filter((m) => m.type === 'player_moved' && m.user_id === otherId).length;
    check('초당 10번을 넘는 move는 버림', burst <= 10, `받은 수 ${burst}`);

    const a2 = await openWs();
    a2.ws.send(JSON.stringify({ type: 'auth', access_token: token }));
    await waitFor(a, (c) => c.closed);
    check('같은 계정이 새로 접속하면 기존 연결 4409', a.closed?.code === 4409, a.closed);
    const snap2 = await waitFor(a2, (c) => c.messages.find((m) => m.type === 'snapshot'));
    check('새 연결은 snapshot을 받음 (민재 포함)', !!snap2 && snap2.players.some((p) => p.user_id === otherId), snap2?.players?.length);
    b.ws.close();
    const left = await waitFor(a2, (c) => c.messages.find((m) => m.type === 'player_left' && m.user_id === otherId));
    check('player_left', !!left, left);
    a2.ws.close();

    section('로그아웃');
    const out = await call('POST', '/auth/logout', { cookie });
    check('로그아웃 204, 쿠키 삭제', out.status === 204 && out.setCookies.some((c) => /refresh_token=;/.test(c) && /Max-Age=0/.test(c)), out);
    const afterOut = await call('POST', '/auth/refresh', { cookie });
    check('로그아웃한 리프레시 토큰 401', afterOut.status === 401, afterOut);
    cookie = null;

    await call('POST', '/__mock__/reset');
}

try {
    await main();
} catch (e) {
    failed += 1;
    console.log(`  FAIL 예외: ${e?.stack ?? e}`);
}
console.log(`\npassed ${passed}, failed ${failed}`);
process.exit(failed ? 1 : 0);
