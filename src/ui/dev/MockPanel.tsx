import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { errorMessage, request } from '../../api/client';
import { useSession } from '../../session/SessionProvider';
import { Button, Chip, LevelBadge, Notice, Panel } from '../kit';

// 모의 서버(mock/)로 띄웠을 때만 보이는 검수용 조작판. 실제 서비스 화면이 아니다.
// App.tsx가 __MOCK_API__가 true일 때만 그린다. 검수용 API는 /api/v1/__mock__/ 아래에 있다 (docs/mock-server.md).

const MOCK_API = '/api/v1/__mock__';

interface SeedAccount { login_id: string; nickname: string; description: string; level: number }
interface AccountsResponse { password: string; accounts: SeedAccount[] }
type ForcedGrade = 'pass' | 'fail' | 'error';
interface MockState {
    user: { id: number; login_id: string; nickname: string; level: number };
    next_grade: ForcedGrade | null;
    next_ai_failure: boolean;
    in_progress: { id: number; task_id: number; remaining_sec: number } | null;
    access_ttl_sec: number;
}
type Note = { tone: 'ok' | 'danger'; text: string } | null;

const GRADE_LABEL: Record<ForcedGrade, string> = { pass: '통과', fail: '미달', error: '채점 실패' };

export function MockPanel() {
    const { status, me, lectures, login, logout, reloadProgress } = useSession();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState<Note>(null);
    const [accounts, setAccounts] = useState<AccountsResponse | null>(null);
    const [state, setState] = useState<MockState | null>(null);
    const [seconds, setSeconds] = useState('60');

    const loadAccounts = useCallback(async () => {
        try {
            const res = await fetch(`${MOCK_API}/accounts`);
            setAccounts((await res.json()) as AccountsResponse);
        } catch {
            setNote({ tone: 'danger', text: '시드 계정 목록을 불러오지 못했어요.' });
        }
    }, []);

    const loadState = useCallback(async () => {
        try {
            setState(await request<MockState>('GET', '/__mock__/state'));
        } catch (e) {
            setState(null);
            setNote({ tone: 'danger', text: errorMessage(e) });
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        if (status === 'guest') void loadAccounts();
        if (status === 'authed') void loadState();
    }, [open, status, loadAccounts, loadState]);

    /** 버튼 하나의 동작. 끝나면 결과 문장을 보여 주고 상태를 다시 읽는다 */
    const run = async (key: string, action: () => Promise<string>) => {
        setBusy(key);
        setNote(null);
        try {
            const text = await action();
            setNote({ tone: 'ok', text });
        } catch (e) {
            setNote({ tone: 'danger', text: errorMessage(e) });
        } finally {
            setBusy(null);
            if (status === 'authed') void loadState();
        }
    };

    const resetData = () => run('reset', async () => {
        const res = await fetch(`${MOCK_API}/reset`, { method: 'POST' });
        if (!res.ok) throw new Error('reset');
        if (status === 'authed') await logout();
        else await loadAccounts();
        return '데이터를 시드로 초기화했어요. 다시 로그인해 주세요.';
    });

    if (!open) {
        return (
            <div className="fixed bottom-3 right-3 z-50">
                <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-expanded={false} title="검수용 모의 서버 조작판 열기">
                    모의 서버 ▴
                </Button>
            </div>
        );
    }

    return (
        <div className="fixed bottom-3 right-3 z-50 w-[300px] text-[12px] text-ink">
            {/* 이름표가 판 위로 걸쳐 있어서, 스크롤은 판 안쪽 상자에만 준다 */}
            <Panel as="aside" tone="sunk" label="모의 서버 · 검수용" labelTone="paper" aria-label="모의 서버 조작판" className="p-3">
              <div className="max-h-[70vh] overflow-y-auto pr-1">
                <div className="mb-2 flex items-start justify-between gap-2">
                    <p className="leading-snug text-ink-soft">실제 서비스 화면이 아니에요. 모의 서버의 데이터를 바꾸는 검수 도구예요.</p>
                    <Button size="sm" variant="quiet" className="shrink-0 whitespace-nowrap" onClick={() => setOpen(false)} aria-expanded title="조작판 접기">접기 ▾</Button>
                </div>

                {note && <Notice tone={note.tone === 'ok' ? 'ok' : 'danger'} className="mb-2 text-[12px]">{note.text}</Notice>}

                {status === 'booting' && <p className="text-ink-soft">로그인 상태를 확인하는 중이에요.</p>}

                {status === 'guest' && (
                    <Section title="시드 계정으로 로그인">
                        {accounts ? (
                            <>
                                <p className="mb-1.5 text-ink-soft">비밀번호는 모두 <code className="font-bold">{accounts.password}</code></p>
                                <ul className="space-y-1.5">
                                    {accounts.accounts.map((a) => (
                                        <li key={a.login_id} className="border-2 border-line bg-paper p-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-bold">{a.nickname} <span className="font-normal text-ink-soft">{a.login_id}</span></span>
                                                <LevelBadge level={a.level} />
                                            </div>
                                            <p className="mt-1 leading-snug text-ink-soft">{a.description}</p>
                                            <Button
                                                size="sm"
                                                variant="quiet"
                                                className="mt-1 w-full border-2 border-line"
                                                busy={busy === `login:${a.login_id}`}
                                                disabled={busy !== null}
                                                onClick={() => run(`login:${a.login_id}`, async () => {
                                                    await login(a.login_id, accounts.password);
                                                    return `${a.nickname}(으)로 로그인했어요.`;
                                                })}
                                            >
                                                이 계정으로 로그인
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : (
                            <p className="text-ink-soft">계정 목록을 불러오는 중이에요.</p>
                        )}
                    </Section>
                )}

                {status === 'authed' && me && (
                    <>
                        <Section title="현재 계정">
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-bold">{me.nickname} <span className="font-normal text-ink-soft">{me.login_id}</span></span>
                                <LevelBadge level={state?.user.level ?? me.level} />
                            </div>
                            {state && (
                                <p className="mt-1 text-ink-soft">
                                    {state.in_progress ? `시험 중: 과제 ${state.in_progress.task_id}, 남은 ${state.in_progress.remaining_sec}초` : '진행 중인 시험 없음'}
                                    {' · '}토큰 유효 {state.access_ttl_sec}초
                                </p>
                            )}
                        </Section>

                        <Section title="강의 수강 완료 처리">
                            <div className="flex flex-wrap gap-1">
                                {(lectures?.lectures ?? []).map((l) => (
                                    <Button
                                        key={l.id}
                                        size="sm"
                                        title={l.title}
                                        disabled={l.completed || busy !== null}
                                        busy={busy === `lecture:${l.id}`}
                                        onClick={() => run(`lecture:${l.id}`, async () => {
                                            await request('POST', `/__mock__/lectures/${l.id}/complete`);
                                            await reloadProgress();
                                            return `강의 ${l.id}번을 수강 완료로 바꿨어요.`;
                                        })}
                                    >
                                        {l.completed ? `${l.id} ✓` : l.id}
                                    </Button>
                                ))}
                            </div>
                        </Section>

                        <Section title="진행 중인 시험의 남은 시간">
                            <div className="flex items-center gap-1">
                                <input
                                    type="number"
                                    aria-label="남은 시간(초)"
                                    value={seconds}
                                    onChange={(e) => setSeconds(e.target.value)}
                                    className="px-well h-8 w-20 bg-white px-2 text-[12px]"
                                />
                                <span className="text-ink-soft">초</span>
                                <Button size="sm" disabled={busy !== null || !state?.in_progress} busy={busy === 'remaining'} onClick={() => setRemaining(Number(seconds))}>적용</Button>
                                <Button size="sm" variant="quiet" disabled={busy !== null || !state?.in_progress} title="마감 + 1분이 지난 상태로 만든다. 시험관에게 말을 걸면 자동 제출된다" onClick={() => setRemaining(-61)}>
                                    마감+1분 지남
                                </Button>
                            </div>
                            <p className="mt-1 leading-snug text-ink-faint">열려 있는 시험 화면의 타이머는 다시 열어야 바뀌어요.</p>
                        </Section>

                        <Section title="다음 채점 결과">
                            <div className="flex flex-wrap items-center gap-1">
                                {(Object.keys(GRADE_LABEL) as ForcedGrade[]).map((g) => (
                                    <Button
                                        key={g}
                                        size="sm"
                                        variant={state?.next_grade === g ? 'primary' : 'secondary'}
                                        disabled={busy !== null}
                                        busy={busy === `grade:${g}`}
                                        onClick={() => run(`grade:${g}`, async () => {
                                            await request('POST', '/__mock__/next-grade', { result: g });
                                            return `다음 채점을 "${GRADE_LABEL[g]}"(으)로 지정했어요.`;
                                        })}
                                    >
                                        {GRADE_LABEL[g]}
                                    </Button>
                                ))}
                                {state?.next_grade && (
                                    <Button size="sm" variant="quiet" disabled={busy !== null} onClick={() => run('grade:clear', async () => {
                                        await request('POST', '/__mock__/next-grade', { result: null });
                                        return '규칙대로 채점하도록 되돌렸어요.';
                                    })}>
                                        해제
                                    </Button>
                                )}
                            </div>
                        </Section>

                        <Section title="장애 흉내">
                            <div className="flex flex-wrap items-center gap-1">
                                <Button size="sm" disabled={busy !== null} busy={busy === 'ai'} onClick={() => run('ai', async () => {
                                    await request('POST', '/__mock__/next-ai-failure');
                                    return '다음 AI 답변이 한 번 실패해요 (AI_UNAVAILABLE).';
                                })}>
                                    다음 AI 답변 실패
                                </Button>
                                {state?.next_ai_failure && <Chip tone="danger">대기 중</Chip>}
                                <Button size="sm" disabled={busy !== null} busy={busy === 'expire'} onClick={() => run('expire', async () => {
                                    await request('POST', '/__mock__/expire-token');
                                    return '액세스 토큰을 만료시켰어요. 다음 요청에서 재발급돼요.';
                                })}>
                                    액세스 토큰 만료
                                </Button>
                            </div>
                        </Section>
                    </>
                )}

                <div className="mt-3 border-t-2 border-line pt-2">
                    <Button size="sm" variant="danger" className="w-full" disabled={busy !== null} busy={busy === 'reset'} onClick={resetData}>
                        데이터 초기화 (시드로)
                    </Button>
                </div>
              </div>
            </Panel>
        </div>
    );

    function setRemaining(sec: number) {
        if (!Number.isFinite(sec)) return;
        void run('remaining', async () => {
            const res = await request<{ remaining_sec: number }>('POST', '/__mock__/attempts/current/remaining', { remaining_sec: Math.round(sec) });
            return sec < 0 ? `마감이 ${-Math.round(sec)}초 지난 상태로 바꿨어요.` : `남은 시간을 ${res.remaining_sec}초로 바꿨어요.`;
        });
    }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mt-2.5">
            <h3 className="mb-1 font-pixel text-[12px] font-bold">{title}</h3>
            {children}
        </section>
    );
}
