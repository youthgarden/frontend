import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';
type Size = 'md' | 'lg' | 'sm';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
    /** primary: 화면에서 가장 권하는 행동 하나. danger: 되돌릴 수 없는 행동 */
    variant?: Variant;
    size?: Size;
    /** 버튼 옆에 작게 붙는 단축키 안내. 예: 'Esc' */
    keyHint?: string;
    /** 요청을 보내는 중. 눌리지 않고 글자가 깜빡인다 */
    busy?: boolean;
    children: ReactNode;
};

const VARIANT: Record<Variant, string> = {
    primary: 'bg-sun text-ink hover:bg-sun-soft',
    secondary: 'bg-paper text-ink hover:bg-paper-sunk',
    danger: 'bg-danger text-white hover:brightness-110',
    quiet: 'bg-transparent text-ink-soft hover:bg-paper-sunk hover:text-ink',
};
const SIZE: Record<Size, string> = {
    sm: 'min-h-8 px-3 text-[13px]',
    md: 'min-h-10 px-4 text-[15px]',
    lg: 'min-h-12 px-6 text-[17px]',
};

// 픽셀 테두리 버튼. 누르면 아래로 3px 내려가며 그림자가 사라진다.
export function Button({ variant = 'secondary', size = 'md', keyHint, busy, className = '', children, disabled, type = 'button', ...rest }: Props) {
    const quiet = variant === 'quiet';
    return (
        <button
            type={type}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            className={[
                'inline-flex select-none items-center justify-center gap-2 font-pixel font-bold leading-none',
                'transition-transform duration-75 disabled:cursor-not-allowed disabled:opacity-50',
                quiet ? '' : 'px-box-sm active:translate-y-[3px] active:px-box-flat disabled:active:translate-y-0',
                VARIANT[variant],
                SIZE[size],
                className,
            ].join(' ')}
            {...rest}
        >
            <span className={busy ? 'animate-[px-blink_0.9s_steps(2)_infinite]' : ''}>{children}</span>
            {keyHint && (
                <span className="rounded-sm border border-current px-1 py-0.5 text-[11px] font-normal opacity-70">{keyHint}</span>
            )}
        </button>
    );
}
