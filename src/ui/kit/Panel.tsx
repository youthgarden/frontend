import type { HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLElement> & {
    /** 판 왼쪽 위에 걸치는 이름표. 시안의 "캐릭터 디자인", "감정 표현" 같은 알약 모양 제목이다 */
    label?: ReactNode;
    /** 이름표 색. 기본은 노랑 */
    labelTone?: 'sun' | 'uniform' | 'paper';
    tone?: 'paper' | 'sunk';
    as?: 'section' | 'div' | 'article' | 'aside';
    children: ReactNode;
};

const LABEL_TONE = {
    sun: 'bg-sun text-ink',
    uniform: 'bg-uniform text-white',
    paper: 'bg-paper text-ink',
};

// 크림색 판. 화면의 모든 창과 카드의 바탕이다.
export function Panel({ label, labelTone = 'sun', tone = 'paper', as: Tag = 'section', className = '', children, ...rest }: Props) {
    return (
        <Tag className={`relative px-box ${tone === 'paper' ? 'bg-paper' : 'bg-paper-sunk'} ${label ? 'pt-7' : ''} ${className}`} {...rest}>
            {label && (
                <div className={`absolute -top-4 left-4 px-box-flat px-3 py-1 font-pixel text-[15px] font-bold leading-none ${LABEL_TONE[labelTone]}`}>
                    {label}
                </div>
            )}
            {children}
        </Tag>
    );
}
