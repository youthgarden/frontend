import { ApiError } from '../../api';
import type { CriterionCode, ErrorCode } from '../../api';

// 시험장 화면들이 함께 쓰는 작은 도우미.

/** 이 오류가 주어진 code 중 하나인지 */
export function isCode(e: unknown, ...codes: ErrorCode[]): boolean {
    return e instanceof ApiError && codes.includes(e.code);
}

/** 초를 "12:03" 꼴로. 남은 1초도 1초로 보이도록 올림한다 */
export function formatClock(sec: number): string {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** 초를 "12분 3초" 꼴로. 화면 낭독기와 문장 안에서 쓴다 */
export function formatDuration(sec: number): string {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m === 0) return `${r}초`;
    return r === 0 ? `${m}분` : `${m}분 ${r}초`;
}

/** 서버의 UTC 시각을 사용자 지역 시각 "12:03"으로 */
export function formatTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 서버의 UTC 시각을 사용자 지역 시각 "2026. 11. 20. 12:27"로 */
export function formatDateTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
}

/** 평가 항목이 무엇을 보는지. 기획서 5절 "보는 것"을 응시자에게 하는 말로 옮겼다 */
export const CRITERION_LOOKS_AT: Record<CriterionCode, string> = {
    RESULT: '답안이 과제에서 요구한 내용을 빠짐없이 담았는지, 사실과 다른 내용은 없는지 봐요.',
    PROMPT: 'AI에게 역할, 상황, 조건, 원하는 형식을 알려 주고 물었는지 봐요.',
    VERIFY: 'AI의 답을 제공 자료와 맞춰 보고, 틀린 내용을 걸러 냈는지 봐요.',
    IMPROVE: '다시 묻거나 직접 고쳐서 결과물을 더 낫게 만들었는지 봐요.',
};

/** 명세의 기본 통과 점수. 응답에 pass_score가 오면 그것을 쓴다 */
export const DEFAULT_PASS_SCORE = 80;

/** 이 흐름 안에서 과제를 가리킬 때 들고 다니는 정보 */
export interface TaskRef {
    id: number;
    title: string;
    /** 필수 강의. 403(강의 미수강)이 왔을 때 안내에 쓴다 */
    requiredLecture: { id: number; title: string } | null;
}
