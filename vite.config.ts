import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { mockServer } from './mock/plugin';

// API_TARGET(예: http://localhost:8000)이 있으면 /api를 실제 백엔드로 넘긴다.
// 없으면 모의 서버(mock/)가 /api/v1을 직접 응답한다. 프론트 코드는 어느 쪽이든 같다.
// 자세한 사용법: docs/mock-server.md
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    const target = env.API_TARGET?.trim();
    const useMock = !target;

    const proxy: Record<string, ProxyOptions> | undefined = target
        ? { '/api': { target, changeOrigin: true, ws: true } }
        : undefined;

    return {
        plugins: [
            react(),
            tailwindcss(),
            ...(useMock ? [mockServer({ accessTtlSec: Number(env.MOCK_ACCESS_TTL_SEC) || undefined })] : []),
        ],
        define: { __MOCK_API__: JSON.stringify(useMock) },
        server: { proxy },
        preview: { proxy },
    };
});
