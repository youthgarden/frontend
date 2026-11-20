import { ALL_LEVELS, characterSpec } from '../../character';
import { PixelCharacter } from '../kit';

// 레벨별 모자 색 6단계를 한 줄로 보여 준다. 로그인 화면의 소개, HUD의 진행 상황, 레벨업 연출이 함께 쓴다.
// current를 주면 지나온 단계와 지금 단계, 남은 단계를 글자와 모양으로 구분한다 (색만으로 구분하지 않는다).

const HAT_BG = ['bg-hat-1', 'bg-hat-2', 'bg-hat-3', 'bg-hat-4', 'bg-hat-5', 'bg-hat-6'];

/** 작은 네모 6개. HUD처럼 자리가 좁은 곳에 쓴다 */
export function HatDots({ current, className = '' }: { current: number; className?: string }) {
    return (
        <ol className={`flex items-center gap-1 ${className}`} aria-label={`모자 6단계 중 ${current}단계`}>
            {ALL_LEVELS.map((info, i) => {
                const reached = info.level <= current;
                const here = info.level === current;
                return (
                    <li
                        key={info.level}
                        title={`${info.label} ${info.hatName}`}
                        aria-current={here ? 'step' : undefined}
                        className={[
                            'block border-2 border-ink',
                            here ? 'h-4 w-4' : 'h-3 w-3',
                            // 아직 못 간 단계는 빈 칸으로 둔다
                            reached ? HAT_BG[i] : 'bg-paper-sunk',
                        ].join(' ')}
                    >
                        <span className="sr-only">
                            {info.label} {info.hatName}{here ? ' (지금)' : reached ? ' (지남)' : ''}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

/** 모자를 쓴 얼굴 6개와 이름. 로그인 화면 소개와 레벨업 연출에 쓴다 */
export function HatHeads({ current, userId = 3, scale = 1, showStage = false, className = '' }: {
    /** 주면 지금 단계를 강조하고 남은 단계를 흐리게 한다 */
    current?: number;
    /** 얼굴 모양을 정할 회원 번호 */
    userId?: number;
    scale?: number;
    showStage?: boolean;
    className?: string;
}) {
    return (
        <ol className={`grid grid-cols-6 gap-x-3 gap-y-1 ${className}`}>
            {ALL_LEVELS.map((info) => {
                const here = current === info.level;
                const ahead = current !== undefined && info.level > current;
                return (
                    <li
                        key={info.level}
                        aria-current={here ? 'step' : undefined}
                        className={`flex flex-col items-center text-center ${ahead ? 'opacity-45' : ''}`}
                    >
                        <div className={`flex items-end justify-center px-1 pt-1 ${here ? 'bg-sun-soft px-box-flat' : ''}`}>
                            <PixelCharacter spec={characterSpec(userId, info.level)} crop="head" scale={scale} />
                        </div>
                        <span className="mt-1.5 font-pixel text-[13px] font-bold leading-none">{info.label}</span>
                        <span className="mt-1 font-pixel text-[12px] leading-none text-ink-soft">{info.hatName}</span>
                        {showStage && <span className="mt-1 text-[12px] leading-tight text-ink-soft">{info.stage}</span>}
                        {here && <span className="sr-only">(지금 단계)</span>}
                    </li>
                );
            })}
        </ol>
    );
}
