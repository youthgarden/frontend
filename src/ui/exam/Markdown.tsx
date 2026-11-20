import type { ReactNode } from 'react';

// 제공 자료와 AI 답변을 읽기 좋게 보여 주는 작은 마크다운 렌더러.
// 제목, 목록, 굵은 글씨, 인라인 코드, 표, 인용, 코드 블록, 가로줄만 다룬다.
// HTML을 주입하지 않고 React 요소로만 만든다. 모르는 문법은 글자 그대로 보인다.

type Block =
    | { t: 'h'; level: 1 | 2 | 3; text: string }
    | { t: 'p'; lines: string[] }
    | { t: 'ul'; items: string[] }
    | { t: 'ol'; items: string[]; start: number }
    | { t: 'table'; head: string[]; rows: string[][] }
    | { t: 'quote'; lines: string[] }
    | { t: 'code'; text: string }
    | { t: 'hr' };

const RE_HEADING = /^(#{1,6})\s+(.*)$/;
const RE_UL = /^\s*[-*+]\s+/;
const RE_OL = /^\s*(\d+)[.)]\s+/;
const RE_QUOTE = /^\s*>\s?/;
const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map((c) => c.trim());
}

function isTableStart(lines: string[], i: number) {
    return lines[i].trim().startsWith('|') && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1]);
}

function startsBlock(lines: string[], i: number) {
    const l = lines[i];
    return (
        !l.trim() || RE_HEADING.test(l) || RE_HR.test(l) || RE_UL.test(l) || RE_OL.test(l) ||
        RE_QUOTE.test(l) || l.trim().startsWith('```') || isTableStart(lines, i)
    );
}

export function parseMarkdown(src: string): Block[] {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const out: Block[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) {
            i++;
            continue;
        }
        if (line.trim().startsWith('```')) {
            const buf: string[] = [];
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('```')) buf.push(lines[i++]);
            i++;
            out.push({ t: 'code', text: buf.join('\n') });
            continue;
        }
        const h = RE_HEADING.exec(line);
        if (h) {
            out.push({ t: 'h', level: Math.min(h[1].length, 3) as 1 | 2 | 3, text: h[2].replace(/\s+#+\s*$/, '') });
            i++;
            continue;
        }
        if (RE_HR.test(line)) {
            out.push({ t: 'hr' });
            i++;
            continue;
        }
        if (isTableStart(lines, i)) {
            const head = splitRow(line);
            i += 2;
            const rows: string[][] = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
            out.push({ t: 'table', head, rows });
            continue;
        }
        if (RE_UL.test(line)) {
            const items: string[] = [];
            while (i < lines.length && RE_UL.test(lines[i])) items.push(lines[i++].replace(RE_UL, ''));
            out.push({ t: 'ul', items });
            continue;
        }
        const ol = RE_OL.exec(line);
        if (ol) {
            const items: string[] = [];
            while (i < lines.length && RE_OL.test(lines[i])) items.push(lines[i++].replace(RE_OL, ''));
            out.push({ t: 'ol', items, start: Number(ol[1]) });
            continue;
        }
        if (RE_QUOTE.test(line)) {
            const buf: string[] = [];
            while (i < lines.length && RE_QUOTE.test(lines[i])) buf.push(lines[i++].replace(RE_QUOTE, ''));
            out.push({ t: 'quote', lines: buf });
            continue;
        }
        // 문단: 줄바꿈을 그대로 살린다 (메일 원문처럼 줄 구분이 의미 있는 자료가 많다)
        const buf: string[] = [line];
        i++;
        while (i < lines.length && !startsBlock(lines, i)) buf.push(lines[i++]);
        out.push({ t: 'p', lines: buf });
    }
    return out;
}

/** 굵은 글씨와 인라인 코드만 처리한다 */
function inline(text: string): ReactNode[] {
    return text
        .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
        .filter((p) => p !== '')
        .map((p, i) => {
            if (p.length > 4 && p.startsWith('**') && p.endsWith('**')) return <strong key={i} className="font-bold">{p.slice(2, -2)}</strong>;
            if (p.length > 2 && p.startsWith('`') && p.endsWith('`')) {
                return <code key={i} className="bg-paper-sunk px-1 font-mono text-[0.92em]">{p.slice(1, -1)}</code>;
            }
            return p;
        });
}

function lineBreaks(lines: string[]): ReactNode[] {
    return lines.flatMap((l, i) => (i === 0 ? [<span key={i}>{inline(l)}</span>] : [<br key={`b${i}`} />, <span key={i}>{inline(l)}</span>]));
}

const HEADING = {
    1: 'text-[18px] font-bold mt-2',
    2: 'text-[16px] font-bold mt-2',
    3: 'text-[15px] font-bold',
};

/** 마크다운 문자열을 본문 글꼴(고딕)로 보여 준다 */
export function Markdown({ source, className = '' }: { source: string; className?: string }) {
    const blocks = parseMarkdown(source);
    return (
        <div className={`space-y-3 break-words text-[15px] leading-7 text-ink ${className}`}>
            {blocks.map((b, i) => {
                switch (b.t) {
                    case 'h': {
                        const Tag = (['h3', 'h4', 'h5'] as const)[b.level - 1];
                        return <Tag key={i} className={HEADING[b.level]}>{inline(b.text)}</Tag>;
                    }
                    case 'p':
                        return <p key={i}>{lineBreaks(b.lines)}</p>;
                    case 'ul':
                        return (
                            <ul key={i} className="list-disc space-y-1 pl-6">
                                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
                            </ul>
                        );
                    case 'ol':
                        return (
                            <ol key={i} start={b.start} className="list-decimal space-y-1 pl-6">
                                {b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}
                            </ol>
                        );
                    case 'quote':
                        return (
                            <blockquote key={i} className="border-l-4 border-line pl-3 text-ink-soft">
                                {lineBreaks(b.lines)}
                            </blockquote>
                        );
                    case 'code':
                        return (
                            <pre key={i} className="overflow-x-auto bg-paper-sunk p-3 font-mono text-[13px] leading-6 whitespace-pre">
                                {b.text}
                            </pre>
                        );
                    case 'hr':
                        return <hr key={i} className="border-t-2 border-line" />;
                    case 'table':
                        return (
                            <div key={i} className="overflow-x-auto">
                                <table className="w-full border-collapse text-[14px] leading-6">
                                    <thead>
                                        <tr>
                                            {b.head.map((c, j) => (
                                                <th key={j} scope="col" className="border-2 border-line bg-paper-sunk px-3 py-1.5 text-left font-bold">
                                                    {inline(c)}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {b.rows.map((r, j) => (
                                            <tr key={j}>
                                                {b.head.map((_, k) => (
                                                    <td key={k} className="border-2 border-line bg-white px-3 py-1.5 align-top">{inline(r[k] ?? '')}</td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        );
                }
            })}
        </div>
    );
}
