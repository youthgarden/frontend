import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { refreshAccessToken, setAccessToken, setSessionLostHandler } from '../api/client';
import { api } from '../api/endpoints';
import type { LectureDashboard, Me, TaskSummary } from '../api/types';

// 로그인 상태와, 여러 화면이 함께 보는 내 정보(레벨, 강의 수강 현황, 과제 현황)를 들고 있다.
// 화면마다 따로 불러오면 HUD와 창의 숫자가 어긋나므로 한 곳에 둔다.

type Status = 'booting' | 'guest' | 'authed';

interface Session {
    status: Status;
    me: Me | null;
    /** 강의 대시보드. 아직 못 불렀으면 null */
    lectures: LectureDashboard | null;
    /** 과제 목록. 아직 못 불렀으면 null */
    tasks: TaskSummary[] | null;
    login: (loginId: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    /** 내 정보를 다시 불러온다 (레벨업 뒤, 첫 입장 안내를 본 뒤) */
    reloadMe: () => Promise<Me | null>;
    /** 강의와 과제 현황을 다시 불러온다 (강의 창이나 시험 창을 닫은 뒤) */
    reloadProgress: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function useSession() {
    const s = useContext(Ctx);
    if (!s) throw new Error('SessionProvider 안에서만 쓸 수 있어요');
    return s;
}

/** 로그인한 화면에서 쓴다. me가 반드시 있다. */
export function useMe() {
    const { me } = useSession();
    if (!me) throw new Error('로그인한 뒤에만 쓸 수 있어요');
    return me;
}

export function SessionProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<Status>('booting');
    const [me, setMe] = useState<Me | null>(null);
    const [lectures, setLectures] = useState<LectureDashboard | null>(null);
    const [tasks, setTasks] = useState<TaskSummary[] | null>(null);

    const clear = useCallback(() => {
        setAccessToken(null);
        setMe(null);
        setLectures(null);
        setTasks(null);
        setStatus('guest');
    }, []);

    const reloadProgress = useCallback(async () => {
        // 한쪽이 실패해도 다른 쪽은 보여준다
        const [l, t] = await Promise.allSettled([api.lectures(), api.tasks()]);
        if (l.status === 'fulfilled') setLectures(l.value);
        if (t.status === 'fulfilled') setTasks(t.value);
    }, []);

    const reloadMe = useCallback(async () => {
        try {
            const next = await api.me();
            setMe(next);
            return next;
        } catch {
            return null;
        }
    }, []);

    const enter = useCallback(async () => {
        setMe(await api.me());
        setStatus('authed');
        void reloadProgress();
    }, [reloadProgress]);

    // 앱 시작: 새로고침하면 메모리의 액세스 토큰이 사라지므로 쿠키의 리프레시 토큰으로 복구한다
    useEffect(() => {
        let cancelled = false;
        setSessionLostHandler(clear);
        (async () => {
            try {
                await refreshAccessToken();
                if (!cancelled) await enter();
            } catch {
                if (!cancelled) clear();
            }
        })();
        return () => {
            cancelled = true;
            setSessionLostHandler(null);
        };
    }, [clear, enter]);

    const login = useCallback(async (loginId: string, password: string) => {
        const token = await api.login({ login_id: loginId, password });
        setAccessToken(token.access_token);
        await enter();
    }, [enter]);

    const logout = useCallback(async () => {
        try {
            await api.logout();
        } finally {
            // 서버에 닿지 못해도 이 브라우저에서는 로그아웃한다
            clear();
        }
    }, [clear]);

    const value = useMemo<Session>(
        () => ({ status, me, lectures, tasks, login, logout, reloadMe, reloadProgress }),
        [status, me, lectures, tasks, login, logout, reloadMe, reloadProgress],
    );
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
