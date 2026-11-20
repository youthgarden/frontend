import { useEffect, useRef, useState } from 'react';
import type { AttemptInProgress } from '../../api';

/**
 * 서버에서 받은 응시와, 받은 순간의 단조 시계 값(performance.now()).
 * 남은 시간은 사용자 PC의 시계가 아니라 "서버가 준 remaining_sec - 받은 뒤 흐른 시간"으로 센다.
 * 탭이 백그라운드에 있어 setInterval이 늦게 돌아도, 계산 기준이 고정돼 있어 어긋나지 않는다.
 */
export interface LiveAttempt {
    attempt: AttemptInProgress;
    receivedAt: number;
}

/** 단조 시계 기준의 마감 시각(ms) */
export function deadlineOf(live: LiveAttempt) {
    return live.receivedAt + live.attempt.remaining_sec * 1000;
}

/** 지금 남은 초 (0 이상, 올림한 정수) */
export function secondsLeftNow(live: LiveAttempt) {
    return Math.max(0, Math.ceil((deadlineOf(live) - performance.now()) / 1000));
}

/**
 * 남은 초를 1초 단위로 돌려준다. 값이 바뀔 때만 다시 그린다.
 * onExpire는 0이 되는 순간 한 번 부른다 (이미 0이면 처음 그린 뒤 바로).
 */
export function useSecondsLeft(live: LiveAttempt, onExpire?: () => void) {
    const [left, setLeft] = useState(() => secondsLeftNow(live));
    const expireRef = useRef(onExpire);
    expireRef.current = onExpire;
    const deadline = deadlineOf(live);

    useEffect(() => {
        let fired = false;
        const tick = () => {
            const s = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
            setLeft(s);
            if (s <= 0 && !fired) {
                fired = true;
                expireRef.current?.();
            }
        };
        tick();
        const timer = window.setInterval(tick, 250);
        // 백그라운드에서 돌아오면 바로 맞춘다
        document.addEventListener('visibilitychange', tick);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [deadline]);

    return left;
}
