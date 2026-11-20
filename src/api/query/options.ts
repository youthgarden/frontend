// 조회에 덧붙여 쓰는 공통 옵션. 분야와 상관없이 쓴다.

/**
 * 화면을 열 때 반드시 최신 값을 받게 한다. 저장해 둔 값을 먼저 보여 주고 뒤에서 새로 받는다.
 * 수강률이나 통과 여부처럼 방금 바뀌었을 수 있는 값을 보여 주는 창에 쓴다.
 *
 *   useQuery({ ...lectureQueries.dashboard(), ...FRESH_ON_OPEN })
 */
export const FRESH_ON_OPEN = { refetchOnMount: 'always' } as const;

/**
 * 부를 때마다 서버의 상태가 바뀔 수 있는 조회에 쓴다. 결과를 저장해 두지 않고 항상 새로 묻는다.
 * (예: GET /attempts/current는 부를 때 서버가 자동 제출을 처리한다)
 */
export const NEVER_CACHE = { staleTime: 0, gcTime: 0 } as const;
