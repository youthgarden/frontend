// 설계/2_API명세서.md의 응답 형식을 그대로 옮긴 타입.
// 필드 이름은 명세를 따라 snake_case로 둔다. 화면에서 다른 이름으로 바꿔 쓰지 않는다.
// 공통: 두 분야가 함께 쓴다. 고치기 전에 서로 알린다.

export type ErrorCode =
    | 'INVALID_CREDENTIALS' | 'TOKEN_EXPIRED' | 'INVALID_TOKEN' | 'INVALID_REFRESH_TOKEN'
    | 'LOGIN_ID_TAKEN' | 'INVALID_JOB'
    | 'LECTURE_NOT_FOUND' | 'TASK_NOT_FOUND' | 'ATTEMPT_NOT_FOUND'
    | 'LECTURE_NOT_COMPLETED'
    | 'ATTEMPT_NOT_IN_PROGRESS' | 'ATTEMPT_ALREADY_IN_PROGRESS' | 'ATTEMPT_TIME_OVER' | 'ATTEMPT_NOT_REGRADABLE'
    | 'AI_UNAVAILABLE'
    // 아래 둘은 명세에 없고 프론트가 만든다: 서버에 닿지 못함 / 형식을 알 수 없는 응답
    | 'NETWORK_ERROR' | 'UNKNOWN'
    // 응답이 시간 안에 오지 않음 / 화면이 요청을 일부러 끊음
    | 'TIMEOUT' | 'ABORTED';
