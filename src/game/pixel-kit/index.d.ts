// 청년 유치원 픽셀 키트의 타입 선언.
// 키트 원본(.js)은 디자인 담당이 새 버전을 주면 그대로 덮어쓴다. 타입은 이 파일에서만 관리한다.
// 원본에서 내보내는 것 중 화면과 맵이 실제로 쓰는 것만 선언했다.

export type SkinKey = 'fair' | 'light' | 'tan' | 'deep';
export type HairColorKey =
    | 'black' | 'darkbrown' | 'brown' | 'chestnut' | 'blonde'
    | 'pink' | 'navy' | 'ash' | 'mint' | 'lilac';
export type HairStyleKey =
    | 'short' | 'spiky' | 'bowl' | 'side' | 'buzz'
    | 'curly' | 'bob' | 'long' | 'ponytail' | 'twintail';
export type BagKey = 'orange' | 'red' | 'green' | 'sky' | 'brown';
export type EmotionKey = 'basic' | 'friendly' | 'excited' | 'curious' | 'determined' | 'love';
export type Dir = 'down' | 'left' | 'right' | 'up';
export type EmoteKey = 'question' | 'heart' | 'sparkle' | 'flame' | 'note' | 'exclaim' | 'sweat' | 'zzz';

export interface CharacterSpec {
    skin?: SkinKey;
    hair?: { style?: HairStyleKey; color?: HairColorKey };
    bottom?: 'shorts' | 'navy' | 'skirt';
    bag?: BagKey | null;
    glasses?: boolean;
    pin?: string | null;
    /** 1~6. 모자 색을 정한다. 6이 Lv.MAX(골드) */
    level?: number;
    emotion?: EmotionKey;
}

export interface CharacterPreset extends CharacterSpec {
    id: string;
    name: string;
}

export class Grid {
    constructor(w: number, h: number);
    w: number;
    h: number;
    toCanvas(): HTMLCanvasElement;
    drawTo(ctx: CanvasRenderingContext2D, dx?: number, dy?: number): void;
    flipX(): Grid;
}

export function makeCanvas(w: number, h: number): HTMLCanvasElement;

export const OUTLINE: string;
export const HAT_LEVELS: { level: number; name: string; stage: string; ramp: [string, string, string]; max?: boolean }[];

export const FRAME_W: 48;
export const FRAME_H: 64;
export const COLS: 5;
export const DIRS: Dir[];
export const EMOTIONS: { id: EmotionKey; label: string }[];
export const EMOTION_EMOTE: Record<EmotionKey, EmoteKey | null>;
export const ANIMS: Record<string, { frames: number[]; frameRate: number; repeat: number }>;
export const CHARACTERS: CharacterPreset[];

/** 프레임 0~3은 걷기, 4는 숨쉬기 */
export function drawCharacter(spec: CharacterSpec, dir?: Dir, frame?: number): Grid;
export function buildCharacterSheet(spec: CharacterSpec): HTMLCanvasElement;

export const TILE: 32;
export const TILES: Record<string, { label: string; draw: () => Grid; frames?: number; drawFrame?: (f: number) => Grid }>;
export const TILE_KEYS: string[];
export function buildTileset(cols?: number): { canvas: HTMLCanvasElement; index: Record<string, number> };

export const OBJECTS: Record<string, { label: string; draw: () => Grid; flat?: boolean; frames?: number; drawFrame?: (f: number) => Grid }>;
export const OBJECT_KEYS: string[];

export const EMOTE_KEYS: EmoteKey[];
export function drawEmote(key: EmoteKey): Grid;

// Phaser 연결부. scene은 Phaser.Scene, sprite는 Phaser.GameObjects.Sprite를 넘긴다.
// 키트가 Phaser를 import하지 않으므로 여기서도 타입을 느슨하게 둔다.
export function registerCharacter(scene: unknown, key: string, spec: CharacterSpec): string;
export function updateCharacter(sprite: unknown, spec: CharacterSpec): void;
export function registerTiles(scene: unknown, key?: string): Record<string, number>;
export function registerObjects(scene: unknown, prefix?: string): void;
export function registerEmotes(scene: unknown, prefix?: string): void;
export function registerAll(scene: unknown): {
    characters: string[];
    tileIndex: Record<string, number>;
    tiles: string[];
    objects: string[];
};
