# API 모듈 사용법

서버와 주고받는 코드는 모두 `src/api/`에 있다. 화면은 `fetch`를 직접 부르지 않고 이 모듈만 쓴다.

```ts
import { api, errorMessage, isApiError, useLectures } from '../../api';
```

왜 이런 구성인지는 [ADR 0009](adr/0009-api-module-own-client-and-tanstack-query.md)에 있다.

## 구성

```
src/api/
  index.ts              입구. 화면은 여기에서만 가져다 쓴다
  types.ts              API 명세의 응답 형식
  endpoints.ts          명세의 API 23개와 1:1인 함수 (api.lectures(), api.submit() ...)
  client.ts             이 서비스의 HTTP 클라이언트 하나. 기본 주소, 토큰, 재발급
  core/
    createClient.ts     범용 HTTP 클라이언트. 시간 제한, 다시 시도, 끊기, 훅
    errors.ts           ApiError와 도우미
  query/
    queries.ts          조회마다의 이름표(key)와 불러오는 방법
    hooks.ts            React 훅 (useLectures, useSubmit ...)과 "무엇이 바뀌면 무엇이 낡는가"
    queryClient.ts      조회 결과 저장소의 기본값
```

아래로 갈수록 이 서비스를 모른다. `core/`는 주소도 토큰도 모르는 범용 코드라서 다른 프로젝트에 그대로 옮길 수 있다.

## 화면에서 쓰기

### 값을 불러와 보여 주기

조회 훅은 "값, 실패, 불러오는 중"을 돌려준다. 화면이 닫히면 요청이 끊기고, 같은 조회를 여러 화면이 쓰면 한 번만 부른다.

```tsx
function LectureList() {
    const { data, error, refetch, isFetching } = useLectures();

    if (!data && error) {
        return <Notice tone="danger" action={<Button busy={isFetching} onClick={() => void refetch()}>다시 시도</Button>}>
            강의 목록을 불러오지 못했어요. {errorMessage(error)}
        </Notice>;
    }
    if (!data) return <Loading />;
    return <ul>{data.lectures.map((l) => <li key={l.id}>{l.title}</li>)}</ul>;
}
```

창을 열 때마다 최신 값이 필요하면(방금 바뀌었을 수 있는 수강률, 통과 여부) 옵션을 더한다. 저장해 둔 값을 먼저 보여 주고 뒤에서 새로 받는다.

```tsx
const query = useQuery({ ...queries.lectures(), ...FRESH_ON_OPEN });
```

### 값을 바꾸기

변경 훅은 성공한 뒤 그 값에 기대는 조회를 스스로 낡은 것으로 표시한다. HUD나 다른 창에 "다시 불러와"라고 알릴 필요가 없다.

```tsx
const submit = useSubmit(attemptId);

<Button variant="primary" busy={submit.isPending} onClick={() => submit.mutate(answer)}>제출하기</Button>
{submit.error && <Notice tone="danger">{errorMessage(submit.error)}</Notice>}
```

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
| `TIMEOUT` | 시간 안에 응답이 없었다 (기본 15초, AI 질문은 60초) |
| `ABORTED` | 화면이 요청을 일부러 끊었다. 사용자에게 알릴 실패가 아니다 (`isAborted(e)`) |
| `UNKNOWN` | 형식을 알 수 없는 응답 |

### 훅 없이 부르기

이벤트 처리 안에서 한 번 부르는 경우에는 `api`를 직접 쓴다. 모든 함수의 마지막 인자는 요청 옵션이다.

```ts
await api.saveAnswer(attemptId, text);
await api.lecture(3, { signal, timeoutMs: 5000, retry: false });
```

## 자동으로 해 주는 것

| 무엇을 | 어떻게 |
|---|---|
| 토큰 붙이기 | 메모리의 액세스 토큰을 `Authorization` 헤더에 넣는다 |
| 토큰 만료 | 401 `TOKEN_EXPIRED`를 받으면 재발급하고 원래 요청을 한 번 다시 보낸다. 여러 요청이 동시에 만료를 받아도 재발급은 한 번만 보낸다 |
| 로그인 풀림 | 재발급까지 실패하면 화면이 로그인으로 돌아간다 |
| 다시 시도 | **조회(GET)만** 서버에 닿지 못했거나 502·503·504일 때 두 번까지 다시 보낸다. 만들기와 제출은 다시 보내지 않는다. 두 번 처리될 수 있기 때문이다 |
| 시간 제한 | 15초. 요청마다 `timeoutMs`로 바꾼다 |
| 끊기 | 조회 훅은 화면이 닫히면 요청을 끊는다 |
| 채점 결과 묻기 | `useAttempt(id)`는 채점 중이면 2초마다 다시 묻고, 끝나면 멈춘다 |

## 새 API를 더할 때

명세에 `GET /notices`가 생겼다고 하자. 세 곳에 한 줄씩이다.

1. `types.ts`에 응답 타입을 적는다. 필드 이름은 명세 그대로 `snake_case`다.

```ts
export interface Notice { id: number; title: string; created_at: string }
```

2. `endpoints.ts`의 `api`에 함수를 더한다.

```ts
notices: (o?: Opt) => http.get<Notice[]>('/notices', o),
```

3. 조회라면 `query/queries.ts`에 이름표와 불러오는 방법을, `query/hooks.ts`에 훅을 더한다.

```ts
// queries.ts
notices: ['notices'] as const,                                   // keys 안에
notices: () => queryOptions({ queryKey: keys.notices, queryFn: ({ signal }) => api.notices({ signal }) }),  // queries 안에

// hooks.ts
export const useNotices = () => useQuery(queries.notices());
```

값을 바꾸는 API라면 3번 대신 변경 훅을 만들고, **성공했을 때 어떤 조회가 낡는지**를 함께 적는다. 이것을 빠뜨리면 화면의 숫자가 어긋난다. 지금 정해진 규칙은 둘이다.

| 바뀐 것 | 낡는 조회 | 함수 |
|---|---|---|
| 강의 수강률 | 강의 조회 전부, 과제 목록(응시 가능 여부) | `invalidateLectureProgress` |
| 응시 (시작, 포기, 제출, 채점) | 응시 조회 전부, 과제 목록(통과 여부, 최고 점수), 내 정보(레벨) | `invalidateAttempts` |

## 모든 요청에 무언가를 끼워 넣을 때

`client.ts`의 `createClient`에 훅을 넣는다. 요청 기록, 추적용 헤더, 실패 수집 같은 일에 쓴다.

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

## 아직 옮기지 않은 화면

이 모듈은 기존 화면이 쓰던 `api.xxx()` 호출을 그대로 받는다. 그래서 화면을 한꺼번에 고치지 않았다. 조회 훅으로 옮긴 곳과 남은 곳은 아래와 같다.

| 상태 | 화면 |
|---|---|
| 훅으로 옮김 | 로그인 상태의 강의·과제 현황(HUD가 본다), 강의 대시보드, 과제 목록 |
| `api`를 직접 부름 | 회원가입의 직무 목록, 강의 재생, 시험관에게 말 걸기, 과제 안내, 시험 화면, 채점 대기, 결과, 지난 결과 |

남은 화면은 지금도 올바르게 동작한다. 그 화면을 고칠 일이 생길 때 훅으로 옮긴다. 채점 대기의 2초 간격 묻기는 `useAttempt`가 같은 일을 하므로 옮기면 코드가 가장 많이 줄어든다.

## 테스트

`npm test`로 돌린다. 서버 없이 돈다.

| 파일 | 확인하는 것 |
|---|---|
| `core/createClient.test.ts` | 주소 만들기, 다시 시도(조회만), 시간 제한, 끊기, 토큰 재발급, 훅 |
| `client.test.ts` | 이 서비스의 규칙: 동시에 만료를 받아도 재발급은 한 번, 로그인 실패는 재발급하지 않음 |
| `query/queries.test.ts` | 무엇이 바뀌면 무엇이 낡는가, 채점 중일 때만 다시 묻기 |
