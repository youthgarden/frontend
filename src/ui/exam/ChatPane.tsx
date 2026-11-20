import { useEffect, useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { errorMessage, useSendMessage } from '../../api';
import type { ChatMessage } from '../../api';
import { Button, Kbd, Notice } from '../kit';
import { Markdown } from './Markdown';
import { isCode } from './util';

// 시험 화면 가운데: 플랫폼 안의 AI와 대화한다.
// AI 답변을 답안으로 옮기는 버튼은 일부러 두지 않는다. 스스로 검토하고 고쳐 쓰는 과정이 평가 대상이다.

const MAX_LEN = 4000;

export function ChatPane({ attemptId, initialMessages, locked, onPaste, onTimeOver, onGone, onReply }: {
    attemptId: number;
    initialMessages: ChatMessage[];
    /** 시간이 끝났거나 제출 중이면 더 묻지 못한다 */
    locked: boolean;
    onPaste: (length: number) => void;
    onTimeOver: () => void;
    onGone: (code: 'ATTEMPT_NOT_IN_PROGRESS' | 'ATTEMPT_NOT_FOUND') => void;
    /** 새 답변이 왔다 (좁은 화면에서 다른 탭을 보고 있을 때 표시용) */
    onReply: () => void;
}) {
    const inputId = useId();
    const hintId = useId();
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [draft, setDraft] = useState('');
    const ask = useSendMessage(attemptId);
    // 보내고 답을 기다리는 질문. 답과 같은 순간에 바뀌어야 해서 요청 상태에서 꺼내지 않고 따로 둔다
    const [pending, setPending] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const sendingRef = useRef(false);
    const logRef = useRef<HTMLDivElement>(null);

    // 새 메시지가 오거나 기다림 표시가 생기면 맨 아래로
    useEffect(() => {
        const el = logRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.length, pending]);

    const trimmed = draft.trim();
    const tooLong = draft.length > MAX_LEN;
    const canSend = !locked && !pending && trimmed.length > 0 && !tooLong;

    const send = async () => {
        if (!canSend || sendingRef.current) return;
        sendingRef.current = true;
        const content = draft;
        setPending(content);
        setDraft('');
        setError(null);
        try {
            const res = await ask.mutateAsync(content);
            setMessages((m) => [...m, res.user_message, res.assistant_message]);
            onReply();
        } catch (e) {
            // 질문은 지우지 않고 입력란에 되돌려 놓는다 (입력란에 새로 쓴 것이 있으면 그대로 둔다)
            setDraft((d) => (d.trim() ? d : content));
            if (isCode(e, 'ATTEMPT_TIME_OVER')) onTimeOver();
            else if (isCode(e, 'ATTEMPT_NOT_IN_PROGRESS', 'ATTEMPT_NOT_FOUND')) onGone(isCode(e, 'ATTEMPT_NOT_FOUND') ? 'ATTEMPT_NOT_FOUND' : 'ATTEMPT_NOT_IN_PROGRESS');
            else if (isCode(e, 'AI_UNAVAILABLE')) setError('AI가 지금 답하지 못했어요. 질문은 입력란에 그대로 남겨 뒀어요. 잠시 뒤 다시 보내 주세요.');
            else setError(`질문을 보내지 못했어요. ${errorMessage(e)} 질문은 입력란에 그대로 남겨 뒀어요.`);
        } finally {
            setPending(null);
            sendingRef.current = false;
        }
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // 한글 조합 중의 Enter는 글자를 확정하는 키라서 보내지 않는다
        if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        void send();
    };

    const onPasteText = (e: ClipboardEvent<HTMLTextAreaElement>) => {
        onPaste(e.clipboardData.getData('text/plain').length);
    };

    return (
        <>
            <div className="shrink-0 border-b-2 border-line px-4 py-3">
                <h2 className="font-pixel text-[14px] font-bold text-ink-soft">AI에게 물어보기</h2>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">AI의 답이 늘 맞지는 않아요. 제공 자료와 맞춰 보고 써 주세요.</p>
            </div>

            <div ref={logRef} role="log" aria-label="AI와 나눈 대화" tabIndex={0} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                {messages.length === 0 && !pending && (
                    <div className="mx-auto max-w-[44ch] border-2 border-dashed border-line px-4 py-4 text-[14px] leading-6 text-ink-soft">
                        <p className="font-pixel text-[13px] font-bold text-ink">무엇이든 물어볼 수 있어요</p>
                        <p className="mt-1.5">
                            AI에게 <strong className="text-ink">역할, 상황, 조건, 원하는 형식</strong>을 함께 알려 주면 더 좋은 답을 받아요.
                            답이 마음에 들지 않으면 무엇이 아쉬운지 말하고 다시 부탁해 보세요.
                        </p>
                    </div>
                )}
                {messages.map((m) => <ChatBubble key={m.id} message={m} />)}
                {pending !== null && (
                    <>
                        <ChatBubble message={{ id: -1, role: 'USER', content: pending, created_at: '' }} />
                        <p role="status" className="flex items-center gap-2 font-pixel text-[13px] text-ink-soft">
                            <span className="inline-block h-2.5 w-2.5 animate-[px-blink_0.8s_steps(2)_infinite] bg-ink-soft" aria-hidden />
                            AI가 답을 쓰고 있어요
                        </p>
                    </>
                )}
            </div>

            <div className="shrink-0 border-t-2 border-line bg-paper-sunk px-4 py-3">
                {error && (
                    <Notice tone="danger" className="mb-2" action={<Button size="sm" onClick={() => void send()} disabled={!canSend}>다시 시도</Button>}>
                        {error}
                    </Notice>
                )}
                <label htmlFor={inputId} className="sr-only">AI에게 보낼 질문</label>
                <textarea
                    id={inputId}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    onPaste={onPasteText}
                    disabled={locked}
                    rows={3}
                    aria-describedby={hintId}
                    aria-invalid={tooLong || undefined}
                    placeholder={locked ? '시간이 끝나서 더 물어볼 수 없어요' : 'AI에게 물어볼 내용을 써요'}
                    className="px-well block max-h-48 min-h-[84px] w-full resize-y bg-white px-3 py-2 text-[15px] leading-6 text-ink placeholder:text-ink-faint disabled:opacity-60"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                    <p id={hintId} className="flex flex-wrap items-center gap-1 text-[12px] leading-snug text-ink-soft">
                        <Kbd>Enter</Kbd> 보내기 · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> 줄 바꾸기
                        <span className={`ml-2 tabular-nums ${tooLong ? 'font-bold text-danger' : ''}`}>
                            {draft.length.toLocaleString()} / {MAX_LEN.toLocaleString()}자{tooLong ? ' (너무 길어요)' : ''}
                        </span>
                    </p>
                    <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={() => void send()} disabled={!canSend} busy={pending !== null}>보내기</Button>
                </div>
            </div>
        </>
    );
}

/** 대화 한 줄. 결과 화면의 대화 기록에서도 같은 모양을 쓴다 */
export function ChatBubble({ message, highlight = false, id }: { message: ChatMessage; highlight?: boolean; id?: string }) {
    const mine = message.role === 'USER';
    return (
        <div id={id} tabIndex={highlight ? -1 : undefined} className={`flex flex-col outline-none ${mine ? 'items-end' : 'items-start'}`}>
            <span className="mb-1 flex items-center gap-2 font-pixel text-[12px] font-bold text-ink-soft">
                {mine ? '나' : 'AI'}
                {highlight && (
                    <span className="border-2 border-sun-deep bg-sun px-1.5 py-0.5 leading-none text-ink">근거가 된 대화</span>
                )}
            </span>
            <div
                className={[
                    'max-w-[92%] border-2 px-3.5 py-2.5 text-[15px] leading-7',
                    mine ? 'border-uniform/40 bg-uniform-soft' : 'border-line bg-white',
                    highlight ? 'outline outline-[3px] outline-offset-2 outline-sun-deep' : '',
                ].join(' ')}
            >
                {mine ? <p className="whitespace-pre-wrap break-words">{message.content}</p> : <Markdown source={message.content} />}
            </div>
        </div>
    );
}
