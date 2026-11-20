import { Events } from 'phaser';

// 맵(game/)과 화면(ui/)이 주고받는 이벤트 목록.
// 새 이벤트는 여기에 먼저 추가하고 두 담당자가 합의한 뒤 양쪽에서 쓴다.
export type Place = 'plaza' | 'classroom' | 'exam';

/** 맵에 그릴 내 캐릭터 정보. 화면이 PhaserGame에 넘긴다 */
export interface PlayerProfile {
    userId: number;
    nickname: string;
    level: number;
}

export type GameEvents = {
    // 맵 → 화면: 상호작용 지점 앞에서 F 키나 스페이스를 눌렀다. lectures = 강의실 칠판, exam = 시험장 입구
    interact: [target: 'lectures' | 'exam'];
    // 화면 → 맵: 패널이 열렸다(true) / 닫혔다(false). 열려 있는 동안 캐릭터가 멈춘다
    'ui-modal': [open: boolean];
    // 화면 → 맵: 캐릭터를 그 공간의 입구로 옮긴다. 예: 수강 완료 후 '시험장으로 이동'
    goto: [place: Place];

    // ── 아래는 화면 담당이 추가를 제안하는 이벤트다. 합의 전이다 (docs/adr/0006 참고) ──
    // 화면 → 맵: 내 캐릭터의 레벨이 바뀌었다. 모자 색을 바꾼다
    'player-level': [level: number];
    // 맵 → 화면: 캐릭터가 지금 있는 공간이 바뀌었다. 화면이 "지금 할 일"의 안내 문구를 고르는 데 쓴다
    place: [place: Place];
    // 맵 → 화면: 멀티플레이 연결 상태. replaced는 다른 탭이나 기기에서 같은 계정으로 접속한 경우다
    'map-connection': [state: 'connected' | 'reconnecting' | 'replaced'];
    // 맵 → 화면: 지금 광장에 함께 있는 다른 사용자 수
    'map-population': [count: number];
};

const bus = new Events.EventEmitter();
const last: Partial<{ [K in keyof GameEvents]: GameEvents[K] }> = {};

export function emit<K extends keyof GameEvents>(event: K, ...args: GameEvents[K]) {
    last[event] = args;
    bus.emit(event, ...args);
}

// 가장 최근에 보낸 값을 돌려준다. 한 번도 보낸 적이 없으면 undefined.
// 맵은 화면보다 늦게 준비되고 장면이 바뀔 때마다 새로 만들어지므로,
// 장면이 만들어질 때 그 전에 지나간 'ui-modal' 같은 상태를 이것으로 확인한다.
export function current<K extends keyof GameEvents>(event: K): GameEvents[K] | undefined {
    return last[event];
}

// 구독을 끊는 함수를 돌려준다. React에서는 useEffect의 반환값으로 그대로 쓰면 된다.
export function on<K extends keyof GameEvents>(event: K, handler: (...args: GameEvents[K]) => void) {
    bus.on(event, handler);
    return () => {
        bus.off(event, handler);
    };
}
