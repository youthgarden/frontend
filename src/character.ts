import { CHARACTERS, HAT_LEVELS, type CharacterSpec, type EmotionKey } from './game/pixel-kit/index.js';

// 캐릭터 외형과 레벨 표시를 정하는 한 곳. 화면(React)과 맵(Phaser)이 함께 쓴다.

/**
 * 회원 번호로 키트의 기본 캐릭터 20명 중 하나를 고른다.
 * API에 외형 필드가 아직 없어서, 같은 회원은 어느 화면과 어느 접속자에게든 같은 모습으로 보이도록 번호로 정한다.
 * 외형 선택 기능이 생기면 이 함수 안만 바꾸면 된다 (docs/adr/0005).
 */
export function characterSpec(userId: number, level: number, emotion: EmotionKey = 'basic'): CharacterSpec {
    const preset = CHARACTERS[Math.abs(userId) % CHARACTERS.length];
    return { ...preset, level: clampLevel(level), emotion };
}

/** AI 시험관. 키트에 전용 그림이 없어서 골드 모자를 쓴 캐릭터로 대신한다. */
export const EXAMINER_SPEC: CharacterSpec = {
    skin: 'light',
    hair: { style: 'side', color: 'ash' },
    glasses: true,
    bottom: 'navy',
    bag: null,
    level: 6,
    emotion: 'friendly',
};

export const MAX_LEVEL = 6;

export function clampLevel(level: number) {
    return Math.min(Math.max(Math.round(level), 1), MAX_LEVEL);
}

export interface LevelInfo {
    level: number;
    /** 'Lv.1' ~ 'Lv.5', 'Lv.MAX' */
    label: string;
    /** '노랑 모자' */
    hatName: string;
    /** '새싹 단계' */
    stage: string;
    /** 모자의 기본 색 */
    color: string;
    /** 모자의 그늘 색. 밝은 바탕 위 글자나 테두리에 쓴다 */
    colorDeep: string;
}

export function levelInfo(level: number): LevelInfo {
    const lv = clampLevel(level);
    const hat = HAT_LEVELS[lv - 1];
    return {
        level: lv,
        label: lv === MAX_LEVEL ? 'Lv.MAX' : `Lv.${lv}`,
        hatName: hat.name,
        stage: hat.stage,
        color: hat.ramp[1],
        colorDeep: hat.ramp[2],
    };
}

export const ALL_LEVELS: LevelInfo[] = HAT_LEVELS.map((h) => levelInfo(h.level));
