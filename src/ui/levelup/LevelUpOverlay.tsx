import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ALL_LEVELS, characterSpec, clampLevel, levelInfo, MAX_LEVEL } from '../../character';
import { useMe } from '../../session/SessionProvider';
import { HatHeads } from '../hud/HatTrack';
import { KitArt } from '../hud/KitArt';
import { Button, PixelCharacter, useMapLock } from '../kit';

// 시험에 통과해 레벨이 올랐을 때 맵 위에 뜨는 연출. 서비스에서 가장 기쁜 순간이라 움직임을 가장 많이 쓴다.
// 순서: 이전 모자를 쓴 캐릭터가 들썩인다 → 번쩍 → 새 모자로 바뀌고 빛줄기와 색종이가 흩날린다.
// 움직임 줄이기 설정이면 전역 CSS가 애니메이션을 멈추고, 여기서도 색종이와 빛줄기를 그리지 않는다.

// 이전 모자를 보여 주는 시간
const BEFORE_MS = 1300;
const BEFORE_MS_REDUCED = 700;

// 이 화면에서만 쓰는 움직임. 도트 느낌이 나게 steps()를 섞는다
const KEYFRAMES = `
@keyframes lvup-rise { from { transform: translateY(24px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes lvup-wiggle { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
@keyframes lvup-jump { 0%,100% { transform: translateY(0) } 30%,55% { transform: translateY(-20px) } }
@keyframes lvup-flash { 0% { opacity: 0; transform: scale(0.3) } 25% { opacity: 1 } 100% { opacity: 0; transform: scale(2) } }
@keyframes lvup-spin { to { transform: rotate(360deg) } }
@keyframes lvup-fall { from { transform: translateY(-12vh) rotate(0deg) } to { transform: translateY(112vh) rotate(720deg) } }
@keyframes lvup-twinkle { 0%,100% { opacity: 0.15; transform: scale(0.7) } 50% { opacity: 1; transform: scale(1.1) } }
@keyframes lvup-stamp { 0% { transform: scale(2.2); opacity: 0 } 60% { transform: scale(0.92); opacity: 1 } 100% { transform: scale(1) } }
`;

function prefersReducedMotion() {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function LevelUpOverlay({ level, onDone }: { level: number; onDone: () => void }) {
    const me = useMe();
    useMapLock();
    const titleId = useId();
    const confirmId = useId();
    const reduced = useMemo(prefersReducedMotion, []);

    const next = levelInfo(level);
    const prev = levelInfo(Math.max(1, clampLevel(level) - 1));
    const isMax = next.level >= MAX_LEVEL;
    // 레벨 1로 "올랐다"는 값이 오면 바뀔 모자가 없으니 곧바로 새 모자를 보여 준다
    const [phase, setPhase] = useState<'before' | 'after'>(next.level > prev.level ? 'before' : 'after');

    useEffect(() => {
        if (phase !== 'before') return;
        const timer = window.setTimeout(() => setPhase('after'), reduced ? BEFORE_MS_REDUCED : BEFORE_MS);
        return () => window.clearTimeout(timer);
    }, [phase, reduced]);

    const done = useRef(false);
    const finish = () => {
        if (done.current) return;
        done.current = true;
        onDone();
    };
    const finishRef = useRef(finish);
    finishRef.current = finish;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // 시험 창에서 누르고 있던 키가 반복 입력되어 연출을 보기도 전에 닫히지 않게 한다
            // 이 연출 안에서 초점을 받는 것은 확인 버튼 하나다. Tab이 연출 밖(검수용 조작판 등)으로 나가지 않게 붙잡아 둔다
            if (e.key === 'Tab') {
                e.preventDefault();
                document.getElementById(confirmId)?.focus();
                return;
            }
            if (e.repeat) return;
            if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault();
                finishRef.current();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [confirmId]);

    const after = phase === 'after';
    const shown = after ? next : prev;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-ink/80 p-6"
        >
            <style>{KEYFRAMES}</style>
            {after && !reduced && <Confetti />}

            <div className="relative flex max-h-full flex-col items-center overflow-y-auto px-4 pb-4 text-center">
                <h2
                    id={titleId}
                    className="font-pixel text-[44px] font-bold leading-none text-sun"
                    style={{ textShadow: '3px 3px 0 var(--color-ink)', animation: reduced ? undefined : 'lvup-stamp 0.5s steps(5) both' }}
                >
                    레벨 업!
                </h2>

                {/* 무대: 빛줄기, 번쩍임, 반짝이, 캐릭터 */}
                <div className="relative mt-4 flex h-[290px] w-[320px] items-end justify-center">
                    {after && !reduced && (
                        <div
                            aria-hidden
                            className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 opacity-60"
                            style={{
                                background: 'repeating-conic-gradient(var(--color-sun-soft) 0deg 12deg, transparent 12deg 30deg)',
                                maskImage: 'radial-gradient(circle, black 30%, transparent 68%)',
                                WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 68%)',
                                animation: 'lvup-spin 14s linear infinite',
                            }}
                        />
                    )}
                    {after && !reduced && (
                        <div
                            key="flash"
                            aria-hidden
                            className="absolute left-1/2 top-[40%] h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper"
                            style={{ animation: 'lvup-flash 0.6s ease-out both' }}
                        />
                    )}
                    {after && <Sparkles still={reduced} />}
                    <div
                        key={phase}
                        className="relative"
                        style={{
                            animation: reduced ? undefined : after ? 'lvup-jump 0.9s steps(6) 0.15s 2 both' : 'lvup-wiggle 0.25s steps(2) infinite',
                        }}
                    >
                        <PixelCharacter
                            spec={characterSpec(me.id, shown.level, after ? 'excited' : 'determined')}
                            scale={4}
                            breathing={after}
                            label={`${shown.hatName}를 쓴 내 캐릭터`}
                        />
                    </div>
                </div>

                {/* 새 레벨 표기 */}
                <div
                    className="mt-2 flex flex-col items-center"
                    style={{ animation: after && !reduced ? 'lvup-rise 0.4s steps(4) both' : undefined, visibility: after ? 'visible' : 'hidden' }}
                    aria-live="polite"
                >
                    <p className="flex items-center gap-3 font-pixel text-[30px] font-bold leading-none text-paper">
                        <span className="inline-block h-7 w-7 border-[3px] border-paper" style={{ background: next.color }} aria-hidden />
                        {next.label}
                        <span className="text-[20px] text-sun-soft">{next.hatName}</span>
                    </p>
                    <p className="mt-3 max-w-[440px] text-[16px] leading-relaxed text-paper">
                        {isMax ? (
                            <>골드 모자를 썼어요! <b>최고 레벨</b>에 도달한 {next.stage}예요. 이제 모두의 멘토예요.</>
                        ) : (
                            <>{prev.hatName}에서 <b>{next.hatName}</b>로 바뀌었어요. 이제 <b>{next.stage}</b>예요.</>
                        )}
                    </p>
                </div>

                <div className="mt-5 bg-paper px-box px-5 pb-4 pt-3">
                    <p className="mb-2 font-pixel text-[13px] font-bold text-ink-soft">
                        {isMax && after ? '6단계를 모두 올랐어요' : `6단계 중 ${shown.level}단계`}
                    </p>
                    <HatHeads current={after ? next.level : prev.level} userId={me.id} scale={1} />
                </div>

                <Button id={confirmId} variant="primary" size="lg" keyHint="Enter" autoFocus className="mt-8" onClick={finish}>
                    확인
                </Button>
            </div>
        </div>
    );
}

/** 캐릭터 둘레에서 깜빡이는 반짝이 (키트의 sparkle 감정 표현) */
function Sparkles({ still }: { still: boolean }) {
    const spots = [
        { left: '8%', top: '18%', delay: '0s' },
        { left: '82%', top: '10%', delay: '0.35s' },
        { left: '88%', top: '58%', delay: '0.7s' },
        { left: '2%', top: '62%', delay: '0.5s' },
        { left: '48%', top: '0%', delay: '0.9s' },
    ];
    return (
        <>
            {spots.map((s, i) => (
                <span
                    key={i}
                    aria-hidden
                    className="absolute"
                    style={{ left: s.left, top: s.top, animation: still ? undefined : `lvup-twinkle 1.2s steps(4) ${s.delay} infinite` }}
                >
                    <KitArt kind="emote" name="sparkle" scale={3} />
                </span>
            ))}
        </>
    );
}

/** 모자 6색으로 만든 색종이. 매번 같은 자리에 뿌려지도록 위치를 번호로 정한다 */
function Confetti() {
    const pieces = useMemo(
        () =>
            Array.from({ length: 36 }, (_, i) => ({
                left: (i * 37) % 100,
                size: 6 + ((i * 7) % 3) * 3,
                delay: ((i * 13) % 20) / 10,
                duration: 2.6 + ((i * 11) % 15) / 10,
                color: ALL_LEVELS[i % ALL_LEVELS.length].color,
            })),
        [],
    );
    return (
        <div aria-hidden className="pointer-events-none absolute inset-0">
            {pieces.map((p, i) => (
                <span
                    key={i}
                    className="absolute top-0 block border border-ink"
                    style={{
                        left: `${p.left}%`,
                        width: p.size,
                        height: p.size,
                        background: p.color,
                        animation: `lvup-fall ${p.duration}s linear ${p.delay}s infinite both`,
                    }}
                />
            ))}
        </div>
    );
}
