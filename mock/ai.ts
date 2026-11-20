// 모의 AI 대화. 실제 모델 대신 질문의 낱말과 과제 자료로 답을 고른다.
// 과제마다 하나씩 "자료와 다른 사실"을 첫 내용 답변에 섞고, 사용자가 지적하면 바로잡는다.
// 같은 입력에는 늘 같은 답을 준다 (시드 데이터도 이 함수로 만든다).

import type { TaskDef } from './content';
import type { TrapState } from './store';

export type ReplyKind = 'correction' | 'translate' | 'review' | 'tone' | 'draft' | 'fact' | 'summary' | 'guide';

export interface ChatTurn { role: 'USER' | 'ASSISTANT'; content: string }

export interface ChatResult {
    text: string;
    kind: ReplyKind;
    /** 이 답변이 틀린 사실을 처음 섞었는지 */
    injects: boolean;
    /** 이 답변이 틀린 사실을 바로잡았는지 */
    corrects: boolean;
}

const CHALLENGE = /(틀린|틀렸|틀리|다르|다른 것|다른데|맞아\?|맞나|맞는지|맞는 거|확인해|대조|사실인지|잘못|아닌데|아니야|아닌 것|오류|근거|정확한지|검증)/;
const TRANSLATE = /(번역|우리말로|한국어로|영어로 옮|해석)/;
const REVIEW_VERB = /(검토|봐\s?줘|고쳐|교정|어색|문법|피드백|점검|평가해)/;
const REVIEW_OBJ = /(답안|내가|제가|작성한|내 메일|내 초안|아래|이거|이 글)/;
const TONE = /(정중|공손|어조|톤|부드럽|격식|딱딱)/;
const DRAFT = /(써\s?줘|써\s?주|작성해|작성 해|초안|만들어|답장|짜\s?줘)/;
const REFINE = /(수정해|고쳐|다듬어|보완해|덧붙|바꿔|추가해|구체적으로)/;
const SUMMARY = /(요약|정리|파악|핵심|알려|설명|무슨|뭐야|뭔지|찾아|분석|대조해|비교)/;
const ROLE_OR_FORMAT = /(너는|당신은|역할|담당자|전문가|형식|표로|목록|항목|조건|포함)/;

function opening(n: number, short: boolean) {
    if (short) return '질문이 짧아서 자료를 바탕으로 일반적인 방향만 잡아 볼게요. 상황과 원하는 형식을 함께 알려 주시면 더 정확히 맞춰 드릴 수 있어요.\n\n';
    const list = ['', '네, 이어서 볼게요.\n\n', '좋아요.\n\n', '알겠어요.\n\n'];
    return list[n % list.length];
}

function reviewAnswer(task: TaskDef, answer: string): string {
    const text = answer.trim();
    if (!text) return '아직 답안이 비어 있어요. 먼저 초안을 써 두시면 빠진 부분과 어색한 표현을 짚어 드릴게요.';
    const have = task.elements.filter((e) => e.pattern.test(text)).map((e) => e.label);
    const miss = task.elements.filter((e) => !e.pattern.test(text)).map((e) => e.label);
    const lines = ['지금 답안을 과제 요구에 비춰 봤어요.', ''];
    if (have.length) lines.push(`- 잘 담긴 부분: ${have.join(', ')}`);
    if (miss.length) lines.push(`- 더 담으면 좋은 부분: ${miss.join(', ')}`);
    else lines.push('- 과제가 요구한 요소는 모두 담겼어요.');
    if (text.length < 200) lines.push('- 분량이 조금 짧아요. 각 요소를 한두 문장씩 풀어 쓰면 읽는 사람이 이해하기 쉬워요.');
    lines.push('', '숫자와 날짜는 제공 자료와 한 번 더 대조해 보시길 권해요.');
    return lines.join('\n');
}

/**
 * 사용자 질문에 대한 답을 만든다.
 * @param history 이번 질문 앞까지의 대화
 * @param answer 지금 저장된 답안 (검토 요청에 쓴다)
 */
export function chatReply(task: TaskDef, history: ChatTurn[], question: string, trap: TrapState, answer: string): ChatResult {
    const q = question.trim();
    const n = history.filter((h) => h.role === 'USER').length;
    const short = q.length < 15 && !ROLE_OR_FORMAT.test(q);
    const wrongNow = trap.state !== 'corrected';
    const r = task.reply;

    const mentionsCorrect = task.trap.correctPattern.test(q);
    const challenge = CHALLENGE.test(q) && (task.trap.topicPattern.test(q) || /(자료|대조|원문)/.test(q));
    if (trap.state === 'injected' && (challenge || mentionsCorrect)) {
        return { text: r.correction, kind: 'correction', injects: false, corrects: true };
    }

    const content = (kind: ReplyKind, make: (wrong: boolean) => string): ChatResult => ({
        text: opening(n, short) + make(wrongNow),
        kind,
        injects: trap.state === 'none',
        corrects: false,
    });

    if (TRANSLATE.test(q)) return { text: r.translate, kind: 'translate', injects: false, corrects: false };
    if (REVIEW_VERB.test(q) && (REVIEW_OBJ.test(q) || q.length > 300)) {
        return { text: reviewAnswer(task, q.length > 300 ? q : answer), kind: 'review', injects: false, corrects: false };
    }
    if (TONE.test(q)) return { text: r.tone, kind: 'tone', injects: false, corrects: false };
    if (DRAFT.test(q)) return content('draft', r.draft);
    if (SUMMARY.test(q)) return content('summary', r.summary);
    if (r.factPattern.test(q)) return content('fact', r.fact);
    if (REFINE.test(q)) {
        const c = content('draft', r.draft);
        return { ...c, text: `말씀하신 부분을 반영해 다시 정리했어요.

${c.text}` };
    }
    if (CHALLENGE.test(q)) {
        // 틀린 사실을 말하기 전에 검증을 부탁하면 자료에 있는 값을 그대로 알려 준다
        return { text: `자료와 대조해 볼게요.\n\n${r.fact(false)}`, kind: 'fact', injects: false, corrects: false };
    }

    const tip = r.tips[n % r.tips.length];
    return {
        text: `${opening(n, short)}이 과제에서 제가 도울 수 있는 일은 자료 요약, 초안 작성, 작성한 답안 검토, 어조 다듬기, 번역이에요.\n\n참고로, ${tip}\n\n원하는 결과물의 형식(메일, 표, 목록 등)과 꼭 넣을 조건을 알려 주시면 그에 맞춰 답할게요.`,
        kind: 'guide',
        injects: false,
        corrects: false,
    };
}
