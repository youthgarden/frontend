# API 모듈 사용법

서버와 주고받는 코드는 모두 `src/api/`에 있다. 화면은 `fetch`를 직접 부르지 않고 이 모듈만 쓴다.

```ts
import { api, errorMessage, isApiError } from '../../api';
```

이 모듈은 **공통 부분**과 **분야별 부분**으로 나뉜다. 공통 부분은 두 사람이 함께 쓰고, 분야별 부분은 그 분야를 맡은 사람이 채운다. 누가 무엇을 맡는지는 [분담](ownership.md)에 있다. 왜 이런 구성인지는 [ADR 0009](adr/0009-api-module-own-client-and-tanstack-query.md)에 있다.

## 구성

```
src/api/
  index.ts              입구. 화면은 여기에서만 가져다 쓴다
  ── 공통 ──
  core/
    createClient.ts     범용 HTTP 클라이언트. 시간 제한, 다시 시도, 끊기, 훅
    errors.ts           ApiError와 도우미
  client.ts             이 서비스의 HTTP 클라이언트 하나(http). 기본 주소, 토큰, 재발급
  query/
    queryClient.ts      조회 결과 저장소의 기본값
    options.ts          조회에 덧붙이는 공통 옵션 (FRESH_ON_OPEN, NEVER_CACHE)
  types/common.ts       두 분야가 함께 쓰는 타입 (에러 코드)
  ── 분야별 ──
  domains/
    auth.ts             인증 (명세 2절)             배우는 쪽
    users.ts            직무, 회원 (명세 3절, 4절)   배우는 쪽
    lectures.ts         강의 (명세 5절)             배우는 쪽
    tasks.ts            과제 (명세 6절)             검증받는 쪽
    attempts.ts         응시 (명세 7절)             검증받는 쪽
  types/
    learn.ts            배우는 쪽의 응답 형식 (인증, 회원, 강의, 멀티플레이)
    exam.ts             검증받는 쪽의 응답 형식 (과제, 응시)
  endpoints.ts          분야별 함수를 api 한 이름으로 모으는 줄만 있다
  types/index.ts        타입을 한 이름으로 모으는 줄만 있다
```

분야를 파일로 나눈 이유는 여러 사람이 동시에 일하기 때문이다. 자기 분야의 파일만 고치면 다른 사람과 같은 줄을 고칠 일이 없다.

## 분야별 파일에 지금 들어 있는 것

화면이 이미 만들어져 있어서 명세의 API 함수 23개는 모두 들어 있다. 조회의 이름표와 훅은 **여러 화면이 함께 보는 값**에만 만들어 두었고, 나머지는 비워 두었다. 그 분야를 맡은 사람이 필요할 때 더한다.

| 파일 | API 함수 | 조회와 훅 |
|---|---|---|
| `auth.ts` | 가입, 로그인, 로그아웃 | 없음 |
| `users.ts` | 직무 목록, 내 정보, 첫 입장 안내 완료 | 내 정보 조회 (`userQueries.me`) |
| `lectures.ts` | 대시보드, 상세, 시청 기록 보고 | 대시보드 조회 (`useLectures`), 수강률이 바뀌었다고 알리기 (`invalidateLectureProgress`) |
| `tasks.ts` | 목록, 안내 | 목록 조회 (`useTasks`) |
| `attempts.ts` | 시작, 현재 응시, 목록, 결과, 포기, AI 질문, 대화 기록, 답안 저장, 행동 기록, 제출, 재채점 | 없음 |

토큰 재발급(`POST /auth/refresh`)은 공통 부분인 `client.ts`가 맡는다. 모든 요청이 기대는 동작이라 분야별 파일에 두지 않았다.

## 공통 부분이 해 주는 것

분야별 파일에서 `http.get(...)`, `http.post(...)`로 부르기만 하면 아래가 따라붙는다.

| 무엇을 | 어떻게 |
|---|---|
| 토큰 붙이기 | 메모리의 액세스 토큰을 `Authorization` 헤더에 넣는다 |
| 토큰 만료 | 401 `TOKEN_EXPIRED`를 받으면 재발급하고 원래 요청을 한 번 다시 보낸다. 여러 요청이 동시에 만료를 받아도 재발급은 한 번만 보낸다 |
| 로그인 풀림 | 재발급까지 실패하면 화면이 로그인으로 돌아간다 |
| 실패를 한 모양으로 | 명세의 에러 형식을 `ApiError`(`code`, `message`, `status`)로 바꾼다 |
| 다시 시도 | **조회(GET)만** 서버에 닿지 못했거나 502·503·504일 때 두 번까지 다시 보낸다. 만들기와 제출은 다시 보내지 않는다. 두 번 처리될 수 있기 때문이다 |
| 시간 제한 | 15초. 요청마다 `timeoutMs`로 바꾼다 |
| 끊기 | `signal`을 넘기면 화면이 닫힐 때 요청을 끊을 수 있다. 조회 훅은 알아서 넘긴다 |

## 내 분야의 API를 더하는 법

명세에 `GET /notices`와 `POST /notices/{id}/read`가 생겼고 내가 맡았다고 하자.

### 1. 응답 타입을 적는다 (`types/learn.ts` 또는 `types/exam.ts`)

자기 분야의 타입 파일에 적는다. 필드 이름은 명세 그대로 `snake_case`다. 새 분야라면 `types/notices.ts`를 만들고 `types/index.ts`에 한 줄을 더한다.

```ts
export interface Notice { id: number; title: string; read: boolean; created_at: string }
```

### 2. 분야별 파일을 만들고 API 함수를 적는다 (`domains/notices.ts`)

모든 함수의 마지막 인자는 요청 옵션(`RequestOptions`)이다. 그대로 `http`에 넘긴다.

```ts
import { http, type RequestOptions } from '../client';
import type { Notice } from '../types';

export const noticeApi = {
    notices: (o?: RequestOptions) => http.get<Notice[]>('/notices', o),
    markRead: (id: number, o?: RequestOptions) => http.post<null>(`/notices/${id}/read`, undefined, o),
};
```

요청마다 기본값을 바꿀 수 있다.

```ts
http.get('/search', { ...o, query: { q, page } });        // 주소 뒤에 ?q=...&page=...
http.post('/ai/ask', body, { timeoutMs: 60_000, ...o });   // 오래 걸리는 요청
http.post('/auth/login', body, { ...o, auth: false });     // 토큰을 붙이지 않고, 401에도 재발급하지 않는다
```

### 3. 모으는 파일과 입구에 한 줄씩 더한다

```ts
// endpoints.ts
export const api = { ...authApi, ...userApi, ...lectureApi, ...taskApi, ...attemptApi, ...noticeApi };

// index.ts
export * from './domains/notices';
```

여기까지 하면 화면에서 `api.notices()`로 부를 수 있다. 훅이 필요 없으면 여기서 끝이다.

### 4. 화면에서 값을 불러와 보여 주려면: 조회를 적는다

같은 분야별 파일에 이름표(key, 어떤 조회인지 가리키는 값)와 불러오는 방법을 적는다. 이름표를 화면마다 문자열로 적으면 오타 하나로 화면이 갱신되지 않는다. 그래서 여기서만 만든다.

```ts
import { queryOptions, useQuery } from '@tanstack/react-query';

export const noticeKeys = {
    all: ['notices'] as const,
    list: () => [...noticeKeys.all, 'list'] as const,
};

export const noticeQueries = {
    list: () => queryOptions({ queryKey: noticeKeys.list(), queryFn: ({ signal }) => noticeApi.notices({ signal }) }),
};

export const useNotices = () => useQuery(noticeQueries.list());
```

화면에서는 이렇게 쓴다. 화면이 닫히면 요청이 끊기고, 같은 조회를 여러 화면이 쓰면 한 번만 부른다.

```tsx
const { data, error, refetch, isFetching } = useNotices();

if (!data && error) {
    return <Notice tone="danger" action={<Button busy={isFetching} onClick={() => void refetch()}>다시 시도</Button>}>
        공지를 불러오지 못했어요. {errorMessage(error)}
    </Notice>;
}
if (!data) return <Loading />;
```

### 5. 값을 바꾸는 API라면: 무엇이 낡는지를 함께 적는다

값을 바꾼 뒤에는 그 값에 기대는 조회를 "낡았다"고 표시한다(invalidate). 그러면 그 조회를 보고 있는 화면이 알아서 다시 불러온다. **이것을 빠뜨리면 화면의 숫자가 어긋난다.**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useMarkNoticeRead() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => noticeApi.markRead(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: noticeKeys.all }),
    });
}
```

다른 분야의 조회까지 낡는 경우에는 그 분야의 이름표를 가져다 쓴다. 지금 있는 예가 `lectures.ts`의 `invalidateLectureProgress`다. 강의 수강률이 바뀌면 과제의 "응시 가능" 여부도 낡기 때문에 `taskKeys.all`까지 표시한다.

## 화면에서 쓰는 법

### 실패를 갈래로 나누기

실패는 모두 `ApiError`다. `code`는 명세 1절의 에러 코드이고 `message`는 화면에 그대로 보여 줘도 되는 문장이다.

```ts
try {
    await api.startAttempt(taskId);
} catch (e) {
    if (isApiError(e, 'LECTURE_NOT_COMPLETED')) return showLectureFirst();
    if (isApiError(e, 'ATTEMPT_ALREADY_IN_PROGRESS')) return showResume();
    setError(errorMessage(e));
}
```

서버가 주지 않고 이 모듈이 만드는 코드가 넷 있다.

| code | 뜻 |
|---|---|
| `NETWORK_ERROR` | 서버에 닿지 못했다 |
| `TIMEOUT` | 시간 안에 응답이 없었다 |
| `ABORTED` | 화면이 요청을 일부러 끊었다. 사용자에게 알릴 실패가 아니다 (`isAborted(e)`) |
| `UNKNOWN` | 형식을 알 수 없는 응답 |

### 조회에 덧붙이는 공통 옵션

| 옵션 | 쓰는 때 |
|---|---|
| `FRESH_ON_OPEN` | 창을 열 때마다 최신 값이 필요할 때. 저장해 둔 값을 먼저 보여 주고 뒤에서 새로 받는다. 방금 바뀌었을 수 있는 수강률, 통과 여부 |
| `NEVER_CACHE` | 부를 때마다 서버의 상태가 바뀌는 조회. 결과를 저장해 두지 않는다. `GET /attempts/current`가 그렇다 (부를 때 서버가 자동 제출을 처리한다) |

```tsx
const query = useQuery({ ...lectureQueries.dashboard(), ...FRESH_ON_OPEN });
```

## 모든 요청에 무언가를 끼워 넣을 때

`client.ts`의 `createClient`에 훅을 넣는다. 요청 기록, 추적용 헤더, 실패 수집 같은 일에 쓴다. 공통 부분이므로 고치기 전에 팀에 알린다.

```ts
export const http = createClient({
    baseUrl: API_BASE,
    auth: { ... },
    hooks: {
        beforeRequest: (ctx, headers) => headers.set('X-Request-Id', crypto.randomUUID()),
        onError: (ctx, error) => console.warn(ctx.method, ctx.path, error.code),
    },
});
```

기본값이 다른 클라이언트가 필요하면 `http.extend({ timeoutMs: 60_000 })`로 만든다. 원래 것은 바뀌지 않는다.

## 함께 지킬 것

- 화면은 `src/api`(입구)에서만 가져다 쓴다. `src/api/domains/...`를 직접 가리키지 않는다. 안쪽 구조를 바꿔도 화면을 고치지 않게 하려는 것이다.
- 분야별 파일끼리는 이름표만 가져다 쓴다. 다른 분야의 API 함수를 부르지 않는다.
- 공통 부분(`core/`, `client.ts`, `query/`)을 고치면 모든 요청이 영향을 받는다. 고치기 전에 팀에 알리고, `npm test`가 통과하는지 확인한다.

## 테스트

`npm test`로 돌린다. 서버 없이 돈다.

| 파일 | 확인하는 것 |
|---|---|
| `core/createClient.test.ts` | 주소 만들기, 다시 시도(조회만), 시간 제한, 끊기, 토큰 재발급, 훅 |
| `client.test.ts` | 이 서비스의 규칙: 동시에 만료를 받아도 재발급은 한 번, 로그인 실패는 재발급하지 않음 |
| `domains/lectures.test.ts` | 강의 수강률이 바뀌면 어떤 조회가 낡는가 |

분야별 파일에 "무엇이 낡는가"를 더하면 `lectures.test.ts`처럼 테스트를 함께 둔다.
