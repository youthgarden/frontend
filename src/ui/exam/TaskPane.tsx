import { useEffect, useId, useRef, useState } from 'react';
import type { AttemptTask } from '../../api';
import { Markdown } from './Markdown';
import { TabBar } from './parts';

// 시험 화면 왼쪽: 과제(상황, 해야 할 일)와 제공 자료를 탭으로 바꿔 가며 읽는다.

export function TaskPane({ task }: { task: AttemptTask }) {
    const idBase = useId();
    const [tab, setTab] = useState<string>('task');
    const tabs = [
        { key: 'task', label: '과제' },
        ...task.materials.map((m) => ({ key: `m${m.id}`, label: m.title })),
    ];
    const material = task.materials.find((m) => `m${m.id}` === tab);

    // 본문의 자료 이름 버튼은 패널이 새로 그려지며 사라진다. 바꾼 뒤 그 자료의 탭에 초점을 둔다
    const focusTab = useRef(false);
    useEffect(() => {
        if (!focusTab.current) return;
        focusTab.current = false;
        document.getElementById(`${idBase}-tab-${tab}`)?.focus();
    }, [tab, idBase]);
    const openMaterial = (key: string) => {
        focusTab.current = true;
        setTab(key);
    };

    return (
        <>
            <div className="shrink-0 border-b-2 border-line px-4 pb-3 pt-3">
                <h2 className="mb-2 font-pixel text-[14px] font-bold text-ink-soft">과제와 자료</h2>
                <TabBar tabs={tabs} active={tab} onChange={setTab} idBase={idBase} label="과제와 제공 자료" />
            </div>
            <div
                key={tab}
                role="tabpanel"
                id={`${idBase}-panel-${tab}`}
                aria-labelledby={`${idBase}-tab-${tab}`}
                tabIndex={0}
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
            >
                {material ? (
                    <article className="max-w-[68ch]">
                        <h3 className="mb-3 font-pixel text-[16px] font-bold">{material.title}</h3>
                        <Markdown source={material.content} />
                    </article>
                ) : (
                    <div className="max-w-[68ch] space-y-5 text-[15px] leading-7">
                        <section>
                            <h3 className="mb-1 font-pixel text-[14px] font-bold text-ink-soft">상황</h3>
                            <p className="whitespace-pre-line">{task.situation}</p>
                        </section>
                        <section>
                            <h3 className="mb-1 font-pixel text-[14px] font-bold text-ink-soft">해야 할 일</h3>
                            <p className="whitespace-pre-line">{task.instruction}</p>
                        </section>
                        {task.materials.length > 0 && (
                            <section>
                                <h3 className="mb-1 font-pixel text-[14px] font-bold text-ink-soft">제공 자료</h3>
                                <p className="text-ink-soft">위의 탭을 눌러 읽어요.</p>
                                <ul className="mt-1 list-disc pl-6">
                                    {task.materials.map((m) => (
                                        <li key={m.id}>
                                            <button
                                                type="button"
                                                onClick={() => openMaterial(`m${m.id}`)}
                                                className="text-uniform underline underline-offset-2 hover:text-ink"
                                            >
                                                {m.title}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
