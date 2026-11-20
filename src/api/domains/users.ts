import { queryOptions } from '@tanstack/react-query';
import { http, type RequestOptions } from '../client';
import type { Job, Me } from '../types';

// 직무와 회원 (명세 3절, 4절). 배우는 쪽, 담당: 조가을

export const userApi = {
    jobs: (o?: RequestOptions) => http.get<Job[]>('/jobs', o),
    me: (o?: RequestOptions) => http.get<Me>('/users/me', o),
    markTutorialSeen: (o?: RequestOptions) => http.patch<Me>('/users/me', { tutorial_seen: true }, o),
};

export const userKeys = {
    me: ['me'] as const,
};

export const userQueries = {
    me: () => queryOptions({ queryKey: userKeys.me, queryFn: ({ signal }) => userApi.me({ signal }) }),
};
