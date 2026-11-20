import type { Criterion, PassRequirements } from '../../api';
import { Chip } from '../kit';
import { criteriaOverview, groupRule, josa } from './passing';
import { CRITERION_LOOKS_AT } from './util';

// 공개 평가 기준: 통과 기준, 이 과제에서 꼭 지켜야 할 것, 영역별 항목과 배점.
// 과제 안내(시작 전)와 시험 화면의 "평가 기준" 탭(시험 중)이 함께 쓴다. 숫자와 문구는 모두 응답에서 가져온다.

export function CriteriaGuide({ criteria, req, narrow = false }: {
    criteria: Criterion[];
    req: PassRequirements;
    /** 좁은 곳(시험 화면의 왼쪽 영역)에서는 영역 카드를 한 줄에 하나씩 둔다 */
    narrow?: boolean;
}) {
    const ov = criteriaOverview(criteria, req);

    if (ov.kind === 'legacy') {
        return (
            <div className="space-y-3">
                <div className="border-2 border-ink bg-white px-4 py-3">
                    <h4 className="font-pixel text-[14px] font-bold">통과 기준</h4>
                    <p className="mt-1 text-[15px] leading-7">
                        네 항목을 더해 <strong>{ov.max}점 중 {ov.minTotal}점 이상</strong>이면 통과예요.
                    </p>
                </div>
                <ul className={`grid gap-2 ${narrow ? '' : 'sm:grid-cols-2'}`}>
                    {ov.criteria.map((c) => <CriterionRow key={c.code} c={c} />)}
                </ul>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="border-2 border-ink bg-white px-4 py-3">
                <h4 className="font-pixel text-[14px] font-bold">통과 기준</h4>
                <p className="mt-1 text-[15px] leading-7">
                    아래 <strong>두 영역을 모두 충족해야</strong> 통과예요.
                    총점이 높아도 한 영역이라도 기준에 못 미치면 통과가 아니에요.
                </p>
                <ul className="mt-2 space-y-1.5 text-[15px] leading-7">
                    {ov.groups.map((g) => (
                        <li key={g.code} className="flex gap-2">
                            <span aria-hidden className="mt-[11px] inline-block h-1.5 w-1.5 shrink-0 bg-ink" />
                            <span>
                                <strong className="font-bold">{g.name}</strong>: {groupRule(g, ov)}
                            </span>
                        </li>
                    ))}
                </ul>
                {ov.verify && (
                    <p className="mt-2 text-[14px] leading-6 text-ink-soft">
                        {ov.verify.name}{josa(ov.verify.name, '은', '는')} AI의 답을 제공 자료와 맞춰 본 기록(대화나 답안을 고친 과정)으로 매겨요.
                        맞춰 본 기록이 없으면 점수를 받을 수 없어요.
                    </p>
                )}
            </div>

            {ov.checks.length > 0 && (
                <div className="border-l-[6px] border-sun-deep bg-sun-soft px-4 py-3">
                    <h4 className="font-pixel text-[14px] font-bold">이 과제에서 꼭 지켜야 할 것</h4>
                    <ul className="mt-2 space-y-1.5 text-[15px] leading-7">
                        {ov.checks.map((c) => (
                            <li key={c.check_id} className="flex gap-2">
                                <span aria-hidden className="mt-[11px] inline-block h-1.5 w-1.5 shrink-0 bg-ink" />
                                <strong className="font-bold">{c.label}</strong>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-[14px] leading-6">
                        하나라도 지키지 못하면 다른 점수가 높아도 통과할 수 없어요.
                    </p>
                </div>
            )}

            <div className={`grid gap-3 ${narrow ? '' : 'sm:grid-cols-2'}`}>
                {ov.groups.map((g) => (
                    <section key={g.code} aria-label={`${g.name} 영역`} className="border-2 border-line bg-white">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b-2 border-line bg-paper-sunk px-3 py-2">
                            <h4 className="font-pixel text-[14px] font-bold">{g.name}</h4>
                            <p className="font-pixel text-[13px] text-ink-soft">
                                {g.max}점 만점 · 최소 <strong className="text-ink">{g.min}점</strong>
                            </p>
                        </div>
                        <ul className="divide-y-2 divide-line">
                            {g.criteria.map((c) => <CriterionRow key={c.code} c={c} flat />)}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}

function CriterionRow({ c, flat = false }: { c: Criterion & { min?: number }; flat?: boolean }) {
    return (
        <li className={flat ? 'px-3 py-2.5' : 'border-2 border-line bg-white px-3 py-2.5'}>
            <p className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-pixel text-[14px] font-bold">{c.name}</span>
                <span className="flex items-center gap-2">
                    {c.min !== undefined && <Chip tone="uniform">최소 {c.min}점</Chip>}
                    <span className="font-pixel text-[13px] text-ink-soft">{c.max_score}점</span>
                </span>
            </p>
            <p className="mt-1 text-[14px] leading-6">{CRITERION_LOOKS_AT[c.code]}</p>
        </li>
    );
}
