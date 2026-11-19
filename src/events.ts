import { Events } from 'phaser';

// 맵(game/)과 화면(ui/)이 주고받는 이벤트 목록.
// 새 이벤트는 여기에 먼저 추가하고 두 담당자가 합의한 뒤 양쪽에서 쓴다.
export type GameEvents = {
    // 맵 → 화면: 상호작용 지점 앞에서 F 키를 눌렀다
    interact: [target: 'blackboard' | 'examiner'];
    // 화면 → 맵: 창이 열렸다(true) / 닫혔다(false). 열려 있는 동안 캐릭터가 멈춘다
    'ui-modal': [open: boolean];
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
