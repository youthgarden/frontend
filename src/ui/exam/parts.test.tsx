import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AttemptStatusChip } from './parts';

// events.ts가 Phaser를 불러오는데, Phaser는 불러오는 순간 window를 찾는다. 이 테스트는 맵과 상관없으므로 막는다
vi.mock('../../events', () => ({ emit: () => {}, on: () => () => {}, current: () => undefined }));

// 지난 결과 목록의 상태 꼬리표. 통과와 미달을 바꿔 보이면 응시자가 다시 도전할지를 잘못 판단한다.
// 색만으로 구분하지 않도록 글자를 꼭 넣는다.

/** 태그를 걷어 낸 글자 */
function text(markup: string) {
    return markup.replace(/<[^>]+>/g, '');
}

describe('AttemptStatusChip', () => {
    it('채점이 끝나고 통과면 "통과 N점"', () => {
        expect(text(renderToStaticMarkup(<AttemptStatusChip status="GRADED" score={85} passed />))).toBe('통과 85점');
    });

    it('채점이 끝나고 미달이면 "미달 N점"', () => {
        expect(text(renderToStaticMarkup(<AttemptStatusChip status="GRADED" score={72} passed={false} />))).toBe('미달 72점');
    });

    it('점수가 0점이어도 0점으로 보인다', () => {
        expect(text(renderToStaticMarkup(<AttemptStatusChip status="GRADED" score={0} passed={false} />))).toBe('미달 0점');
    });

    it('채점 중, 채점 실패, 푸는 중은 점수 없이 상태를 글자로 말한다', () => {
        expect(text(renderToStaticMarkup(<AttemptStatusChip status="GRADING" score={null} passed={null} />))).toBe('채점 중');
        expect(text(renderToStaticMarkup(<AttemptStatusChip status="GRADING_FAILED" score={null} passed={null} />))).toBe('채점 실패');
        expect(text(renderToStaticMarkup(<AttemptStatusChip status="IN_PROGRESS" score={null} passed={null} />))).toBe('푸는 중');
    });

    it('통과와 미달은 글자뿐 아니라 꼬리표 색도 다르다', () => {
        const ok = renderToStaticMarkup(<AttemptStatusChip status="GRADED" score={85} passed />);
        const ng = renderToStaticMarkup(<AttemptStatusChip status="GRADED" score={72} passed={false} />);
        expect(ok).toContain('text-ok');
        expect(ng).not.toContain('text-ok');
    });
});
