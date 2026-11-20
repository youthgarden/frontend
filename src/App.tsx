import { useCallback, useEffect, useState } from 'react';
import { emit, on } from './events';
import { PhaserGame } from './game/PhaserGame';
import { SessionProvider, useMe, useSession } from './session/SessionProvider';
import { AuthScreen } from './ui/auth/AuthScreen';
import { MockPanel } from './ui/dev/MockPanel';
import { ExamFlow } from './ui/exam/ExamFlow';
import { Hud } from './ui/hud/Hud';
import { Tutorial } from './ui/hud/Tutorial';
import { Loading } from './ui/kit';
import { LectureOverlay } from './ui/lecture/LectureOverlay';
import { LevelUpOverlay } from './ui/levelup/LevelUpOverlay';

export default function App() {
    return (
        <SessionProvider>
            <Root />
            {/* 모의 서버로 띄웠을 때만 보이는 검수용 조작판 */}
            {__MOCK_API__ && <MockPanel />}
        </SessionProvider>
    );
}

function Root() {
    const { status } = useSession();
    if (status === 'booting') {
        return (
            <main className="flex h-full items-center justify-center">
                <Loading>청년 유치원에 들어가는 중이에요</Loading>
            </main>
        );
    }
    return status === 'guest' ? <AuthScreen /> : <MapScreen />;
}

// 맵 위에 뜨는 큰 창. 한 번에 하나만 뜬다.
type Overlay = { kind: 'lecture'; lectureId?: number } | { kind: 'exam' } | null;

// 로그인한 뒤의 화면 전체: 맵 한 장 + 그 위의 HUD와 창들.
// 기획서대로 화면 전환이 없다. 강의도 시험도 맵 위에 뜬다.
function MapScreen() {
    const me = useMe();
    const { reloadMe, reloadProgress } = useSession();
    const [overlay, setOverlay] = useState<Overlay>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    // 시험 결과로 오른 레벨. 시험 창이 닫힌 뒤 맵에서 연출한다
    const [pendingLevel, setPendingLevel] = useState<number | null>(null);

    useEffect(() => on('interact', (target) => {
        setOverlay(target === 'lectures' ? { kind: 'lecture' } : { kind: 'exam' });
    }), []);

    const closeOverlay = useCallback(() => {
        setOverlay(null);
        // 창 안에서 바뀐 수강률과 통과 여부를 HUD에 반영한다
        void reloadProgress();
    }, [reloadProgress]);

    const finishLevelUp = useCallback(() => {
        if (pendingLevel !== null) emit('player-level', pendingLevel);
        setPendingLevel(null);
        void reloadMe();
    }, [pendingLevel, reloadMe]);

    const showTutorial = !me.tutorial_seen || helpOpen;

    return (
        <>
            <PhaserGame profile={{ userId: me.id, nickname: me.nickname, level: me.level }} />
            <Hud onOpenHelp={() => setHelpOpen(true)} />

            {overlay?.kind === 'lecture' && (
                <LectureOverlay initialLectureId={overlay.lectureId} onClose={closeOverlay} />
            )}
            {overlay?.kind === 'exam' && (
                <ExamFlow
                    onClose={closeOverlay}
                    onOpenLecture={(lectureId) => {
                        void reloadProgress();
                        setOverlay({ kind: 'lecture', lectureId });
                    }}
                    onLevelUp={setPendingLevel}
                />
            )}

            {overlay === null && pendingLevel !== null && (
                <LevelUpOverlay level={pendingLevel} onDone={finishLevelUp} />
            )}
            {overlay === null && pendingLevel === null && showTutorial && (
                <Tutorial
                    onDone={() => {
                        setHelpOpen(false);
                        if (!me.tutorial_seen) void reloadMe();
                    }}
                />
            )}
        </>
    );
}
