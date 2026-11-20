// 설계/2_API명세서.md의 응답 형식을 그대로 옮긴 타입.
// 필드 이름은 명세를 따라 snake_case로 둔다. 화면에서 다른 이름으로 바꿔 쓰지 않는다.
// 배우는 쪽: 인증, 회원, 강의, 멀티플레이 (명세 2~5절, 8절). 담당: 조가을

export interface Job { id: number; name: string }

export interface SignupRequest { login_id: string; password: string; nickname: string; job_id: number }
export interface SignupResponse { id: number; login_id: string; nickname: string; job: Job; level: number }
export interface LoginRequest { login_id: string; password: string }
export interface TokenResponse { access_token: string; token_type: 'bearer'; expires_in: number }

export interface Me {
    id: number;
    login_id: string;
    nickname: string;
    job: Job;
    /** 1~6. 6이 Lv.MAX */
    level: number;
    passed_task_count: number;
    tutorial_seen: boolean;
}

export interface LectureSummary {
    id: number;
    title: string;
    duration_sec: number;
    /** 0~1 */
    progress_rate: number;
    completed: boolean;
}
export interface LectureDashboard { completed_count: number; total_count: number; lectures: LectureSummary[] }
/** task_id: 이 강의와 연결된 과제. 없으면 null */
export interface LectureDetail extends LectureSummary { youtube_video_id: string; last_position_sec: number; task_id: number | null }
export interface ProgressRequest { watched_ranges: [number, number][]; position_sec: number }
export interface ProgressResponse { progress_rate: number; completed: boolean; just_completed: boolean }

// ── 멀티플레이 (WebSocket /ws/map) ──
export type Dir = 'up' | 'down' | 'left' | 'right';
export interface MapPlayer { user_id: number; nickname: string; level: number; x: number; y: number; dir: Dir; moving: boolean }
export type MapClientMessage =
    | { type: 'auth'; access_token: string }
    | { type: 'move'; x: number; y: number; dir: Dir; moving: boolean };
export type MapServerMessage =
    | { type: 'snapshot'; me: { x: number; y: number; dir: Dir }; players: MapPlayer[] }
    | { type: 'player_joined'; player: MapPlayer }
    | { type: 'player_moved'; user_id: number; x: number; y: number; dir: Dir; moving: boolean }
    | { type: 'player_updated'; user_id: number; level: number }
    | { type: 'player_left'; user_id: number };
