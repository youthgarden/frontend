import { Events } from 'phaser';

// 맵(game/)과 화면(ui/)이 주고받는 이벤트 목록.
// 새 이벤트는 여기에 먼저 추가하고 두 담당자가 합의한 뒤 양쪽에서 쓴다.
export type Place = 'plaza' | 'classroom' | 'exam';

export type GameEvents = {
    // 맵 → 화면: 상호작용 지점 앞에서 F 키나 스페이스를 눌렀다. lectures = 강의실 칠판, exam = 시험장 입구
    interact: [target: 'lectures' | 'exam'];
    // 화면 → 맵: 패널이 열렸다(true) / 닫혔다(false). 열려 있는 동안 캐릭터가 멈춘다
    'ui-modal': [open: boolean];
    // 화면 → 맵: 캐릭터를 그 공간의 입구로 옮긴다. 예: 수강 완료 후 '시험장으로 이동'
    goto: [place: Place];
};

const bus = new Events.EventEmitter();

export function emit<K extends keyof GameEvents>(event: K, ...args: GameEvents[K]) {
    bus.emit(event, ...args);
}

// 구독을 끊는 함수를 돌려준다. React에서는 useEffect의 반환값으로 그대로 쓰면 된다.
export function on<K extends keyof GameEvents>(event: K, handler: (...args: GameEvents[K]) => void) {
    bus.on(event, handler);
    return () => {
        bus.off(event, handler);
    };
}
