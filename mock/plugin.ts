// Vite 플러그인: 개발 서버(npm run dev)와 미리보기 서버(npm run preview) 안에서 모의 백엔드를 띄운다.
// REST는 미들웨어로, WebSocket(/api/v1/ws/map)은 HTTP 서버의 upgrade 이벤트로 받는다.
// 실제 백엔드로 연결할 때(API_TARGET)는 vite.config.ts가 이 플러그인을 넣지 않는다.

import type { Server as HttpServer } from 'node:http';
import type { Connect, Logger, Plugin } from 'vite';
import { MockApp } from './app';

export interface MockServerOptions {
    /** 액세스 토큰 유효 시간(초). 기본 3600 (명세). 재발급 흐름을 검수할 때 줄인다 */
    accessTtlSec?: number;
}

interface Host {
    middlewares: Connect.Server;
    httpServer: unknown;
    config: { root: string; logger: Logger };
}

export function mockServer(options: MockServerOptions = {}): Plugin {
    const accessTtlSec = options.accessTtlSec && options.accessTtlSec > 0 ? Math.floor(options.accessTtlSec) : 3600;

    const attach = (server: Host) => {
        const logger = server.config.logger;
        const app = new MockApp({
            root: server.config.root,
            accessTtlSec,
            log: (msg) => logger.info(`[mock] ${msg}`, { timestamp: true }),
        });
        server.middlewares.use(app.middleware);

        // 미들웨어 모드에서는 httpServer가 없다. 그때는 WebSocket 없이 REST만 동작한다
        const http = server.httpServer as HttpServer | null;
        if (http) {
            http.on('upgrade', app.hub.handleUpgrade);
            http.once('close', () => {
                http.off('upgrade', app.hub.handleUpgrade);
                app.dispose();
            });
        }
        logger.info(`[mock] 모의 서버를 켰어요: /api/v1 (액세스 토큰 ${accessTtlSec}초, 데이터 ${app.dbFile})`, { timestamp: true });
    };

    return {
        name: 'youthgarten-mock-server',
        configureServer: attach,
        configurePreviewServer: attach,
    };
}
