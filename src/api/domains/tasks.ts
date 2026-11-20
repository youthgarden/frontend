import { queryOptions, useQuery } from '@tanstack/react-query';
import { http, type RequestOptions } from '../client';
import type { TaskDetail, TaskSummary } from '../types';

// 과제 (명세 6절). 검증받는 쪽, 담당: 김균호

export const taskApi = {
    tasks: (o?: RequestOptions) => http.get<TaskSummary[]>('/tasks', o),
    task: (id: number, o?: RequestOptions) => http.get<TaskDetail>(`/tasks/${id}`, o),
};

/** 이름표. taskKeys.all은 과제에 관한 조회 전부다 (통과 여부, 응시 가능 여부가 바뀌면 함께 낡는다) */
export const taskKeys = {
    all: ['tasks'] as const,
    list: () => [...taskKeys.all, 'list'] as const,
    detail: (id: number) => [...taskKeys.all, 'detail', id] as const,
};

export const taskQueries = {
    list: () => queryOptions({ queryKey: taskKeys.list(), queryFn: ({ signal }) => taskApi.tasks({ signal }) }),
    detail: (id: number) =>
        queryOptions({ queryKey: taskKeys.detail(id), queryFn: ({ signal }) => taskApi.task(id, { signal }) }),
};

/** 과제 목록. 로그인 상태(HUD의 "지금 할 일"이 본다)와 과제 목록 창이 함께 쓴다 */
export const useTasks = (enabled = true) => useQuery({ ...taskQueries.list(), enabled });

/**
 * 과제 안내. 필수 강의를 안 들었으면 LECTURE_NOT_COMPLETED(403)로 실패한다.
 * 안내의 내용은 바뀌지 않으므로 저장해 둔 값을 그대로 쓴다.
 */
export const useTask = (id: number) => useQuery(taskQueries.detail(id));
