import { queryOptions, useQuery } from '@tanstack/react-query';
import { http, type RequestOptions } from '../client';
import type { TaskDetail, TaskSummary } from '../types';

// 과제 (명세 6절). 검증받는 쪽, 담당: 김균호
// 지금 있는 조회는 여러 화면이 함께 보는 "과제 목록" 하나다. 나머지 조회와 변경 훅은 담당자가 필요할 때 더한다.

export const taskApi = {
    tasks: (o?: RequestOptions) => http.get<TaskSummary[]>('/tasks', o),
    task: (id: number, o?: RequestOptions) => http.get<TaskDetail>(`/tasks/${id}`, o),
};

export const taskKeys = {
    all: ['tasks'] as const,
    list: () => [...taskKeys.all, 'list'] as const,
};

export const taskQueries = {
    list: () => queryOptions({ queryKey: taskKeys.list(), queryFn: ({ signal }) => taskApi.tasks({ signal }) }),
};

/** 과제 목록. 로그인 상태(HUD의 "지금 할 일"이 본다)와 과제 목록 창이 함께 쓴다 */
export const useTasks = (enabled = true) => useQuery({ ...taskQueries.list(), enabled });
