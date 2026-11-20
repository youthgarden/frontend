import { attemptApi } from './domains/attempts';
import { authApi } from './domains/auth';
import { lectureApi } from './domains/lectures';
import { taskApi } from './domains/tasks';
import { userApi } from './domains/users';

// 명세의 API 함수를 한 이름으로 모은 것. 화면은 api.lectures(), api.submit()처럼 부른다.
// 함수 자체는 분야별 파일(domains/)에 있다. 여러 사람이 이 파일을 함께 고치지 않도록 여기에는 모으는 줄만 둔다.
// 새 분야를 더하면 아래에 한 줄을 더한다.

export const api = {
    ...authApi,
    ...userApi,
    ...lectureApi,
    ...taskApi,
    ...attemptApi,
};
