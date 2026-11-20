import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../core/errors';

// 조회 결과를 보관하고, 같은 조회를 여러 화면이 함께 쓰게 해 주는 저장소.
// 다시 시도는 HTTP 클라이언트(core/createClient.ts)가 이미 한다. 여기서 또 하면 실패 하나에 여러 번 보낸다.
// 그래서 여기서는 "서버에 닿지 못한 경우"만 한 번 더 시도하고, 서버가 답한 실패(4xx, 5xx)는 바로 화면에 넘긴다.

export function createQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                // 창을 열 때마다 다시 불러올 필요가 없도록 잠깐은 저장해 둔 값을 쓴다
                staleTime: 10_000,
                retry: (failureCount, error) =>
                    failureCount < 1 && error instanceof ApiError && (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT'),
                // 맵에서 다른 창으로 갔다 돌아올 때마다 다시 부르지 않는다. 값을 바꾼 쪽이 직접 낡았다고 표시한다
                refetchOnWindowFocus: false,
            },
            mutations: { retry: false },
        },
    });
}
