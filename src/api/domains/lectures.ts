import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { http, type RequestOptions } from '../client';
import type { LectureDashboard, LectureDetail, ProgressRequest, ProgressResponse } from '../types';
import { taskKeys } from './tasks';

// 강의 (명세 5절). 담당자가 정해지면 이 파일을 맡는다.
// 지금 있는 조회는 여러 화면이 함께 보는 "강의 대시보드" 하나다. 나머지 조회와 변경 훅은 담당자가 필요할 때 더한다.

export const lectureApi = {
    lectures: (o?: RequestOptions) => http.get<LectureDashboard>('/lectures', o),
    lecture: (id: number, o?: RequestOptions) => http.get<LectureDetail>(`/lectures/${id}`, o),
    reportProgress: (id: number, body: ProgressRequest, o?: RequestOptions) =>
        http.post<ProgressResponse>(`/lectures/${id}/progress`, body, o),
};

/** 이름표. 앞부분이 같으면 한꺼번에 가리킬 수 있다: lectureKeys.all은 강의에 관한 조회 전부다 */
export const lectureKeys = {
    all: ['lectures'] as const,
    dashboard: () => [...lectureKeys.all, 'dashboard'] as const,
};

export const lectureQueries = {
    dashboard: () =>
        queryOptions({ queryKey: lectureKeys.dashboard(), queryFn: ({ signal }) => lectureApi.lectures({ signal }) }),
};

/** 강의 대시보드. 로그인 상태(HUD가 본다)와 강의 창이 함께 쓴다 */
export const useLectures = (enabled = true) => useQuery({ ...lectureQueries.dashboard(), enabled });

/**
 * 강의 수강률이 바뀌었다고 알린다. 강의 조회 전부와, 과제의 "응시 가능" 여부가 낡는다.
 * (필수 강의를 다 들어야 그 과제를 볼 수 있기 때문이다. 명세 6절)
 */
export function invalidateLectureProgress(qc: QueryClient) {
    return Promise.all([
        qc.invalidateQueries({ queryKey: lectureKeys.all }),
        qc.invalidateQueries({ queryKey: taskKeys.all }),
    ]);
}
