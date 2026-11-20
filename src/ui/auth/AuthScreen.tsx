import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError, errorMessage } from '../../api';
import { api } from '../../api';
import type { Job } from '../../api';
import { characterSpec } from '../../character';
import { useSession } from '../../session/SessionProvider';
import { HatHeads } from '../hud/HatTrack';
import { KitArt } from '../hud/KitArt';
import { Button, Field, Loading, Notice, Panel, PixelCharacter } from '../kit';

// 로그인과 회원가입을 한 화면에서 오간다.
// 왼쪽은 처음 온 사람을 위한 소개(무엇을 하는 곳인지, 모자 색 6단계), 오른쪽은 입력 판이다.

type Mode = 'login' | 'signup';

export function AuthScreen() {
    const [mode, setMode] = useState<Mode>('login');
    // 가입을 마치고 로그인으로 넘어올 때 채워 줄 아이디와 안내
    const [joined, setJoined] = useState<string | null>(null);

    return (
        <main className="h-full overflow-y-auto bg-sky">
            <div className="mx-auto flex min-h-full max-w-[1120px] flex-col items-center justify-center gap-10 px-6 py-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
                <Intro />
                <Panel as="section" className="w-full max-w-[440px] shrink-0 px-6 pb-7 pt-5" aria-label={mode === 'login' ? '로그인' : '회원가입'}>
                    <ModeSwitch
                        mode={mode}
                        onChange={(m) => {
                            setMode(m);
                            if (m === 'signup') setJoined(null);
                        }}
                    />
                    {mode === 'login' ? (
                        <LoginForm joinedId={joined} onGoSignup={() => { setJoined(null); setMode('signup'); }} />
                    ) : (
                        <SignupForm
                            onDone={(loginId) => {
                                setJoined(loginId);
                                setMode('login');
                            }}
                            onGoLogin={() => setMode('login')}
                        />
                    )}
                </Panel>
            </div>
        </main>
    );
}

// ── 소개 ──

// 소개에 세워 둘 키트 캐릭터. 회원 번호 대신 고정된 번호로 외형을 고른다
const FRIENDS = [
    { id: 0, level: 1 },
    { id: 5, level: 2 },
    { id: 7, level: 1 },
    { id: 12, level: 3 },
];

function Intro() {
    return (
        <section className="flex w-full max-w-[560px] flex-col items-center text-center lg:items-start lg:text-left">
            <div className="flex items-end gap-3">
                <KitArt kind="object" name="sprout" scale={2} />
                <h1 className="font-pixel text-[44px] font-bold leading-none tracking-tight text-ink">청년 유치원</h1>
            </div>
            <p className="mt-4 inline-block bg-sun px-box-flat px-3 py-1.5 font-pixel text-[16px] font-bold leading-none">
                배우고, 함께 자라요!
            </p>
            <p className="mt-5 max-w-[480px] text-[16px] leading-relaxed text-ink">
                내 직무에 맞는 AI 활용 강의를 듣고, AI 시험관이 내는 실무 과제를 AI와 함께 풀어 보는 곳이에요.
                시험에 통과할 때마다 레벨이 오르고 모자 색이 바뀌어요.
            </p>

            {/* 맵에서 함께 걷게 될 친구들 */}
            <div className="mt-7 flex items-end gap-2 border-b-[6px] border-grass-deep px-2" aria-hidden>
                {FRIENDS.map((f) => (
                    <PixelCharacter key={f.id} spec={characterSpec(f.id, f.level, 'friendly')} scale={2} breathing />
                ))}
            </div>

            <div className="mt-8 w-full max-w-[520px] bg-paper/80 px-4 pb-4 pt-3">
                <h2 className="font-pixel text-[15px] font-bold">레벨업! 모자 색 변화</h2>
                <p className="mt-1 text-[14px] text-ink-soft">처음엔 노랑 모자로 시작해서, 시험을 하나 통과할 때마다 한 단계씩 올라가요.</p>
                <HatHeads className="mt-3" scale={2} />
            </div>
        </section>
    );
}

// ── 로그인 / 회원가입 전환 ──

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
    const item = (m: Mode, text: string) => (
        <button
            type="button"
            aria-pressed={mode === m}
            onClick={() => onChange(m)}
            className={[
                'flex-1 py-2.5 font-pixel text-[16px] font-bold leading-none',
                mode === m ? 'bg-sun text-ink' : 'bg-paper-sunk text-ink-soft hover:text-ink',
            ].join(' ')}
        >
            {text}
        </button>
    );
    return (
        <div className="mb-6 flex border-[3px] border-ink">
            {item('login', '로그인')}
            <span className="w-[3px] bg-ink" aria-hidden />
            {item('signup', '회원가입')}
        </div>
    );
}

/** 이름으로 폼 안의 입력란에 초점을 옮긴다 (Field가 ref를 받지 않아서 이름으로 찾는다) */
function focusField(form: HTMLFormElement | null, name: string) {
    const el = form?.elements.namedItem(name);
    if (el instanceof HTMLElement) el.focus();
}

// ── 로그인 ──

function LoginForm({ joinedId, onGoSignup }: { joinedId: string | null; onGoSignup: () => void }) {
    const { login } = useSession();
    const form = useRef<HTMLFormElement>(null);
    const [loginId, setLoginId] = useState(joinedId ?? '');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState<{ login_id?: string; password?: string }>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const sending = useRef(false);

    useEffect(() => {
        // 가입 직후면 아이디가 채워져 있으니 비밀번호 칸으로 바로 간다
        focusField(form.current, joinedId ? 'password' : 'login_id');
    }, [joinedId]);

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (sending.current) return;
        const next: typeof errors = {};
        if (!loginId.trim()) next.login_id = '아이디를 입력해 주세요.';
        if (!password) next.password = '비밀번호를 입력해 주세요.';
        setErrors(next);
        setServerError(null);
        if (next.login_id || next.password) {
            focusField(form.current, next.login_id ? 'login_id' : 'password');
            return;
        }
        sending.current = true;
        setBusy(true);
        try {
            await login(loginId.trim(), password);
            // 성공하면 세션이 맵 화면으로 바꾼다
        } catch (err) {
            setServerError(errorMessage(err));
            focusField(form.current, 'password');
        } finally {
            sending.current = false;
            setBusy(false);
        }
    };

    return (
        <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-5">
            {joinedId && (
                <Notice tone="ok">
                    가입했어요. 방금 만든 아이디 <b>{joinedId}</b>로 로그인해 주세요.
                </Notice>
            )}
            <Field
                label="아이디"
                name="login_id"
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                value={loginId}
                error={errors.login_id}
                onChange={(e) => {
                    setLoginId(e.target.value);
                    if (errors.login_id) setErrors((p) => ({ ...p, login_id: undefined }));
                }}
            />
            <Field
                label="비밀번호"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                error={errors.password}
                onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                }}
            />
            {serverError && <Notice tone="danger">{serverError}</Notice>}
            <Button type="submit" variant="primary" size="lg" busy={busy} className="w-full">
                {busy ? '들어가는 중이에요' : '로그인하고 입장하기'}
            </Button>
            <p className="text-center text-[14px] text-ink-soft">
                처음 왔나요?{' '}
                <button type="button" onClick={onGoSignup} className="font-bold text-uniform underline underline-offset-4">
                    회원가입하기
                </button>
            </p>
        </form>
    );
}

// ── 회원가입 ──

type SignupField = 'login_id' | 'password' | 'nickname' | 'job_id';
type SignupErrors = Partial<Record<SignupField, string>>;
type Values = { login_id: string; password: string; nickname: string; job_id: number | null };

const ORDER: SignupField[] = ['login_id', 'password', 'nickname', 'job_id'];

/** 글자 수. 한글과 이모지도 한 글자로 센다 */
const len = (s: string) => Array.from(s).length;

// 명세 2절 POST /auth/signup의 입력 규칙
function validate(v: Values): SignupErrors {
    const e: SignupErrors = {};
    const id = v.login_id;
    if (!id) e.login_id = '아이디를 입력해 주세요.';
    else if (/[A-Z]/.test(id)) e.login_id = '영문 대문자는 쓸 수 없어요. 소문자로 바꿔 주세요.';
    else if (!/^[a-z0-9_]+$/.test(id)) e.login_id = '영문 소문자, 숫자, 밑줄(_)만 쓸 수 있어요. 한글, 띄어쓰기, 다른 기호는 빼 주세요.';
    else if (id.length < 4 || id.length > 30) e.login_id = `아이디는 4~30자로 정해 주세요. 지금 ${id.length}자예요.`;

    const pw = len(v.password);
    if (!v.password) e.password = '비밀번호를 입력해 주세요.';
    else if (pw < 8 || pw > 64) e.password = `비밀번호는 8~64자로 정해 주세요. 지금 ${pw}자예요.`;

    const nick = len(v.nickname.trim());
    if (nick === 0) e.nickname = '닉네임을 입력해 주세요.';
    else if (nick < 2 || nick > 20) e.nickname = `닉네임은 2~20자로 정해 주세요. 지금 ${nick}자예요.`;

    if (v.job_id === null) e.job_id = '직무를 골라 주세요.';
    return e;
}

function SignupForm({ onDone, onGoLogin }: { onDone: (loginId: string) => void; onGoLogin: () => void }) {
    const form = useRef<HTMLFormElement>(null);
    const [values, setValues] = useState<Values>({ login_id: '', password: '', nickname: '', job_id: null });
    const [errors, setErrors] = useState<SignupErrors>({});
    // 한 번 제출해 본 뒤에는 고칠 때마다 다시 검사해서 오류가 바로 사라지게 한다
    const [tried, setTried] = useState(false);
    const [serverError, setServerError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const sending = useRef(false);

    const [jobs, setJobs] = useState<Job[] | null>(null);
    const [jobsError, setJobsError] = useState<string | null>(null);

    const loadJobs = useCallback(async () => {
        setJobsError(null);
        setJobs(null);
        try {
            const list = await api.jobs();
            setJobs(list);
            // 직무가 하나뿐이면 미리 골라 둔다. 여럿이면 직접 고르게 한다
            if (list.length === 1) setValues((v) => (v.job_id === null ? { ...v, job_id: list[0].id } : v));
        } catch (e) {
            setJobsError(errorMessage(e));
        }
    }, []);

    useEffect(() => {
        void loadJobs();
        focusField(form.current, 'login_id');
    }, [loadJobs]);

    const set = <K extends keyof Values>(key: K, value: Values[K]) => {
        const next = { ...values, [key]: value };
        setValues(next);
        if (tried) setErrors(validate(next));
        else if (errors[key as SignupField]) setErrors((p) => ({ ...p, [key]: undefined }));
    };

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (sending.current) return;
        setTried(true);
        setServerError(null);
        const found = validate(values);
        setErrors(found);
        const first = ORDER.find((k) => found[k]);
        if (first) {
            focusField(form.current, first);
            return;
        }
        sending.current = true;
        setBusy(true);
        try {
            await api.signup({
                login_id: values.login_id,
                password: values.password,
                nickname: values.nickname.trim(),
                job_id: values.job_id!,
            });
            onDone(values.login_id);
        } catch (err) {
            if (err instanceof ApiError && err.code === 'LOGIN_ID_TAKEN') {
                setErrors((p) => ({ ...p, login_id: errorMessage(err) }));
                focusField(form.current, 'login_id');
            } else if (err instanceof ApiError && err.code === 'INVALID_JOB') {
                setErrors((p) => ({ ...p, job_id: errorMessage(err) }));
                void loadJobs();
            } else {
                setServerError(errorMessage(err));
            }
        } finally {
            sending.current = false;
            setBusy(false);
        }
    };

    return (
        <form ref={form} onSubmit={submit} noValidate className="flex flex-col gap-5">
            <Field
                label="아이디"
                name="login_id"
                autoComplete="username"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={30}
                value={values.login_id}
                hint="4~30자. 영문 소문자, 숫자, 밑줄(_)만 쓸 수 있어요."
                error={errors.login_id}
                onChange={(e) => set('login_id', e.target.value)}
            />
            <Field
                label="비밀번호"
                name="password"
                type="password"
                autoComplete="new-password"
                maxLength={64}
                value={values.password}
                hint="8~64자로 정해 주세요."
                error={errors.password}
                onChange={(e) => set('password', e.target.value)}
            />
            <Field
                label="닉네임"
                name="nickname"
                autoComplete="nickname"
                value={values.nickname}
                hint="2~20자. 맵에서 다른 사람에게 보이는 이름이에요."
                error={errors.nickname}
                onChange={(e) => set('nickname', e.target.value)}
            />
            <JobSelect
                jobs={jobs}
                loadError={jobsError}
                onRetry={() => void loadJobs()}
                value={values.job_id}
                error={errors.job_id}
                onChange={(id) => set('job_id', id)}
            />
            {serverError && <Notice tone="danger">{serverError}</Notice>}
            <Button type="submit" variant="primary" size="lg" busy={busy} disabled={jobs === null} className="w-full">
                {busy ? '가입하는 중이에요' : '가입하기'}
            </Button>
            <p className="text-center text-[14px] text-ink-soft">
                이미 아이디가 있나요?{' '}
                <button type="button" onClick={onGoLogin} className="font-bold text-uniform underline underline-offset-4">
                    로그인하기
                </button>
            </p>
        </form>
    );
}

/** 직무 고르기. 공통 부품의 Field는 입력란만 있어서 같은 모양의 선택 칸을 여기서 만든다 */
function JobSelect({ jobs, loadError, onRetry, value, error, onChange }: {
    jobs: Job[] | null;
    loadError: string | null;
    onRetry: () => void;
    value: number | null;
    error?: string;
    onChange: (id: number | null) => void;
}) {
    const id = 'signup-job';
    const msgId = `${id}-msg`;

    if (loadError) {
        return (
            <div>
                <span className="mb-1.5 block font-pixel text-[14px] font-bold">직무</span>
                <Notice tone="danger" action={<Button size="sm" onClick={onRetry}>다시 불러오기</Button>}>
                    직무 목록을 불러오지 못했어요. {loadError}
                </Notice>
            </div>
        );
    }
    if (jobs === null) {
        return (
            <div>
                <span className="mb-1.5 block font-pixel text-[14px] font-bold">직무</span>
                <Loading className="py-3">직무 목록을 불러오는 중이에요</Loading>
            </div>
        );
    }
    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block font-pixel text-[14px] font-bold">직무</label>
            <select
                id={id}
                name="job_id"
                value={value ?? ''}
                aria-invalid={error ? true : undefined}
                aria-describedby={msgId}
                onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
                className="px-well block h-11 w-full cursor-pointer bg-white px-3 text-[15px] text-ink focus-visible:outline-offset-4"
            >
                {jobs.length !== 1 && <option value="">직무를 골라 주세요</option>}
                {jobs.map((j) => (
                    <option key={j.id} value={j.id}>{j.name}</option>
                ))}
            </select>
            <p id={msgId} className={`mt-2 text-[13px] leading-snug ${error ? 'font-bold text-danger' : 'text-ink-soft'}`}>
                {error ?? '직무에 따라 듣게 될 강의와 시험 과제가 정해져요.'}
            </p>
        </div>
    );
}
