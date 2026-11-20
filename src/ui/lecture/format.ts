import type { TaskSummary } from '../../api/types';

/** 초를 '분:초'로. 예: 605 → '10:05' */
export function formatTime(sec: number) {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 0~1 비율을 화면에 보일 퍼센트 정수로 */
export const percent = (rate: number) => Math.round(Math.min(Math.max(rate, 0), 1) * 100);

/** 수강 완료 기준 (명세: 실제로 본 구간의 합이 80% 이상) */
export const COMPLETE_RATE = 0.8;

/** 이 강의를 필수 강의로 삼는 과제들. 과제 목록이 아직 없으면 빈 배열 */
export function tasksForLecture(tasks: TaskSummary[] | null, lectureId: number) {
    return (tasks ?? []).filter((t) => t.required_lecture.id === lectureId);
}

/** 강의 상태 문구. 색만으로 구분하지 않도록 상태마다 글자를 정한다 */
export function lectureStatus(l: { progress_rate: number; completed: boolean }) {
    if (l.completed) return { kind: 'done' as const, text: '수강 완료', action: '다시 보기' };
    if (l.progress_rate > 0) return { kind: 'doing' as const, text: `수강 중 ${percent(l.progress_rate)}%`, action: '이어 보기' };
    return { kind: 'todo' as const, text: '수강 전', action: '보기' };
}
