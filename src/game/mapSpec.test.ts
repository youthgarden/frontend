import { describe, expect, it } from 'vitest';
import { dirToYaw, yawToDir, type Dir } from './mapSpec';

describe('yaw (명세 8절)', () => {
    it('오른쪽 0, 아래 π/2, 위 -π/2, 모두 [-π, π) 안이고 되돌리면 같은 방향이다', () => {
        expect(dirToYaw('right')).toBe(0);
        expect(dirToYaw('down')).toBe(Math.PI / 2);
        expect(dirToYaw('up')).toBe(-Math.PI / 2);
        for (const d of ['up', 'down', 'left', 'right'] as Dir[]) {
            const yaw = dirToYaw(d);
            expect(yaw >= -Math.PI && yaw < Math.PI).toBe(true);
            expect(yawToDir(yaw)).toBe(d);
        }
    });
    it('네 방향이 아닌 각도는 가장 가까운 방향으로 본다', () => {
        expect(yawToDir(1.57)).toBe('down');
        expect(yawToDir(0.3)).toBe('right');
        expect(yawToDir(3.1)).toBe('left');
    });
});
