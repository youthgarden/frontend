import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown, parseMarkdown } from './Markdown';

// 제공 자료와 AI 답변은 이 렌더러로 보인다. 자료 본문은 과제 작성자가, AI 답변은 응시자가 유도한 대로
// 만들어지므로 무엇이 들어 있든 실행 가능한 HTML이 되면 안 된다. 모르는 문법은 글자 그대로 보여야 한다.

function html(source: string) {
    return renderToStaticMarkup(<Markdown source={source} />);
}

/** 바깥 div를 걷어 낸 안쪽 HTML */
function body(source: string) {
    return html(source).replace(/^<div[^>]*>/, '').replace(/<\/div>$/, '');
}

/** 렌더 결과에 실제 태그로 나온 요소 이름들 (글자로 보이는 &lt;...&gt;는 제외된다) */
function tagsOf(markup: string) {
    return [...markup.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)/g)].map((m) => m[1].toLowerCase());
}

const ALLOWED_TAGS = new Set([
    'div', 'p', 'span', 'br', 'strong', 'code', 'h3', 'h4', 'h5', 'ul', 'ol', 'li',
    'blockquote', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

describe('parseMarkdown: 지원하는 문법', () => {
    it('제목은 1~3단계로 접고, 끝의 # 표시는 지운다', () => {
        expect(parseMarkdown('# 하나\n## 둘 ##\n###### 여섯')).toEqual([
            { t: 'h', level: 1, text: '하나' },
            { t: 'h', level: 2, text: '둘' },
            { t: 'h', level: 3, text: '여섯' },
        ]);
    });

    it('# 뒤에 빈칸이 없으면 제목이 아니다 (해시태그, C# 같은 글자)', () => {
        expect(parseMarkdown('#해시태그')).toEqual([{ t: 'p', lines: ['#해시태그'] }]);
        expect(parseMarkdown('# 언어는 C#')).toEqual([{ t: 'h', level: 1, text: '언어는 C#' }]);
    });

    it('글머리 목록과 번호 목록을 나누고, 번호 목록은 첫 번호부터 센다', () => {
        expect(parseMarkdown('- 가\n* 나\n+ 다')).toEqual([{ t: 'ul', items: ['가', '나', '다'] }]);
        expect(parseMarkdown('3. 셋\n4) 넷')).toEqual([{ t: 'ol', items: ['셋', '넷'], start: 3 }]);
    });

    it('표: 머리와 구분 줄 뒤의 | 로 시작하는 줄이 행이 된다', () => {
        expect(parseMarkdown('| 항목 | 금액 |\n| :--- | ---: |\n| 식비 | 1,000 |\n| 교통 | 2,000 |\n\n뒤 문단')).toEqual([
            { t: 'table', head: ['항목', '금액'], rows: [['식비', '1,000'], ['교통', '2,000']] },
            { t: 'p', lines: ['뒤 문단'] },
        ]);
    });

    it('인용은 > 를 떼고 줄을 모은다', () => {
        expect(parseMarkdown('> 첫 줄\n>둘째 줄')).toEqual([{ t: 'quote', lines: ['첫 줄', '둘째 줄'] }]);
    });

    it('코드 블록 안의 글은 마크다운으로 해석하지 않는다', () => {
        expect(parseMarkdown('```js\n# 제목 아님\n- 목록 아님\n```\n끝')).toEqual([
            { t: 'code', text: '# 제목 아님\n- 목록 아님' },
            { t: 'p', lines: ['끝'] },
        ]);
    });

    it('가로줄은 ---, ***, ___, - - - 모두 된다', () => {
        for (const s of ['---', '***', '___', '- - -']) expect(parseMarkdown(s)).toEqual([{ t: 'hr' }]);
    });

    it('문단은 줄바꿈을 살리고, 빈 줄에서 나뉜다. CRLF도 같다', () => {
        expect(parseMarkdown('보낸 사람: 김 팀장\r\n받는 사람: 나\r\n\r\n안녕하세요')).toEqual([
            { t: 'p', lines: ['보낸 사람: 김 팀장', '받는 사람: 나'] },
            { t: 'p', lines: ['안녕하세요'] },
        ]);
    });

    it('문단 바로 다음 줄이 다른 블록으로 시작하면 문단이 끝난다', () => {
        expect(parseMarkdown('설명\n- 항목')).toEqual([
            { t: 'p', lines: ['설명'] },
            { t: 'ul', items: ['항목'] },
        ]);
    });
});

describe('Markdown: 화면에 그리는 모양', () => {
    it('제목은 창 제목(h2) 아래 단계인 h3~h5로 그린다', () => {
        expect(body('# 가\n## 나\n### 다')).toBe(
            '<h3 class="text-[18px] font-bold mt-2">가</h3><h4 class="text-[16px] font-bold mt-2">나</h4><h5 class="text-[15px] font-bold">다</h5>',
        );
    });

    it('굵은 글씨와 인라인 코드', () => {
        const out = body('**중요** 값은 `total_sum`이에요');
        expect(out).toContain('<strong class="font-bold">중요</strong>');
        expect(out).toContain('>total_sum</code>');
        expect(out).toContain('이에요');
    });

    it('문단의 줄바꿈은 <br>로 보인다', () => {
        expect(body('첫 줄\n둘째 줄')).toBe('<p><span>첫 줄</span><br/><span>둘째 줄</span></p>');
    });

    it('번호 목록은 시작 번호를 start로 넘긴다', () => {
        const out = body('5. 다섯\n6. 여섯');
        expect(out).toMatch(/^<ol start="5"[^>]*><li>다섯<\/li><li>여섯<\/li><\/ol>$/);
    });

    it('표는 머리 칸에 scope="col"을 달고, 칸이 모자란 행은 빈 칸으로 채운다', () => {
        const out = body('| 이름 | 부서 | 연락처 |\n|---|---|---|\n| 김 | 영업 |');
        expect(tagsOf(out).filter((t) => t === 'th')).toHaveLength(3);
        expect(out).toContain('scope="col"');
        expect(tagsOf(out).filter((t) => t === 'td')).toHaveLength(3);
        expect(out).toMatch(/<td[^>]*><\/td><\/tr>/);
    });

    it('칸이 넘치는 행의 남는 칸은 버린다 (GFM 표와 같은 규칙)', () => {
        const out = body('| 이름 |\n|---|\n| 김 | 넘침 |');
        expect(tagsOf(out).filter((t) => t === 'td')).toHaveLength(1);
        expect(out).not.toContain('넘침');
    });

    it('인용과 코드 블록과 가로줄', () => {
        expect(body('> 인용')).toMatch(/^<blockquote[^>]*><span>인용<\/span><\/blockquote>$/);
        expect(body('```\nconst a = 1;\n  들여쓰기\n```')).toMatch(/^<pre[^>]*>const a = 1;\n {2}들여쓰기<\/pre>$/);
        expect(body('---')).toMatch(/^<hr[^>]*\/>$/);
    });

    it('지원하지 않는 문법(링크, 기울임, 이미지)은 글자 그대로 보인다', () => {
        const out = body('[보고서](https://example.com) *기울임* ![그림](a.png)');
        expect(out).toBe('<p><span>[보고서](https://example.com) *기울임* ![그림](a.png)</span></p>');
    });
});

describe('Markdown: 안전성 (자료 본문이 HTML로 실행되면 안 된다)', () => {
    const ATTACKS = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<a href="javascript:alert(1)">눌러 보세요</a>',
        '[눌러 보세요](javascript:alert(1))',
        '<svg onload=alert(1)>',
        '<style>body{display:none}</style>',
        '"><script>alert(1)</script>',
        '&lt;script&gt;alert(1)&lt;/script&gt;',
    ];

    /** 공격 문자열을 모든 블록 종류에 넣어 본다 */
    function everywhere(a: string) {
        return [
            a,
            `# ${a}`,
            `- ${a}`,
            `1. ${a}`,
            `> ${a}`,
            `**${a}**`,
            `\`${a}\``,
            `| ${a} | b |\n|---|---|\n| ${a} | ${a} |`,
            `\`\`\`\n${a}\n\`\`\``,
            `문단 첫 줄\n${a}`,
        ];
    }

    for (const attack of ATTACKS) {
        it(`실행 가능한 태그나 속성이 나오지 않는다: ${attack}`, () => {
            for (const src of everywhere(attack)) {
                const out = html(src);
                for (const tag of tagsOf(out)) expect(ALLOWED_TAGS.has(tag), `${tag} in ${out}`).toBe(true);
                // 실제 태그(글자로 이스케이프된 &lt;...&gt;가 아닌 것)에 달린 속성은 렌더러가 만든 class, scope, start뿐이다.
                // React는 속성값 안의 " 를 &quot;로 바꾸므로 "[^"]*"로 태그 하나를 정확히 끊을 수 있다
                const realTags = [...out.matchAll(/<[a-z][a-z0-9]*(?:\s+[a-z-]+="[^"]*")*\s*\/?>/gi)].map((m) => m[0]);
                const attrs = realTags.flatMap((t) => [...t.matchAll(/\s([a-z-]+)="/gi)].map((x) => x[1].toLowerCase()));
                for (const name of attrs) expect(['class', 'scope', 'start'], `${name} in ${out}`).toContain(name);
                // 태그로 인식되지 않은 '<'가 남아 있지 않다 (모든 '<'는 위의 실제 태그로 설명된다)
                expect(out.replace(/<\/?[a-z][a-z0-9]*(?:\s+[a-z-]+="[^"]*")*\s*\/?>/gi, '')).not.toContain('<');
            }
        });
    }

    it('<script>는 글자 그대로(이스케이프되어) 보인다', () => {
        expect(body('<script>alert(1)</script>')).toBe('<p><span>&lt;script&gt;alert(1)&lt;/script&gt;</span></p>');
    });

    it('<img onerror>도 글자 그대로 보인다', () => {
        expect(body('<img src=x onerror=alert(1)>')).toBe('<p><span>&lt;img src=x onerror=alert(1)&gt;</span></p>');
    });

    it('javascript: 주소는 링크가 되지 않고 글자로 남는다', () => {
        const out = body('[눌러 보세요](javascript:alert(1))');
        expect(out).toBe('<p><span>[눌러 보세요](javascript:alert(1))</span></p>');
        expect(tagsOf(out)).not.toContain('a');
    });

    it('HTML 엔티티를 풀지 않는다 (&lt;는 화면에 &lt;로 보인다)', () => {
        expect(body('&lt;b&gt;')).toBe('<p><span>&amp;lt;b&amp;gt;</span></p>');
    });

    it('번호 목록의 start에는 숫자만 들어간다', () => {
        const out = body('99999999999999999999. 큰 번호');
        expect(out).toMatch(/^<ol start="[0-9e+]+"/);
    });
});

describe('Markdown: 어긋난 입력에서도 오류 없이 무엇인가를 보인다', () => {
    it('빈 입력과 빈칸뿐인 입력은 빈 상자를 그린다', () => {
        expect(parseMarkdown('')).toEqual([]);
        expect(parseMarkdown('  \n\t\n')).toEqual([]);
        expect(body('')).toBe('');
    });

    it('닫히지 않은 코드 블록은 끝까지 코드로 보인다', () => {
        expect(parseMarkdown('앞\n```\n코드 1\n코드 2')).toEqual([
            { t: 'p', lines: ['앞'] },
            { t: 'code', text: '코드 1\n코드 2' },
        ]);
        expect(body('```')).toMatch(/^<pre[^>]*><\/pre>$/);
    });

    it('구분 줄이 없는 | 줄은 표가 아니라 문단 글자로 보인다', () => {
        expect(parseMarkdown('| a | b |\n| c | d |')).toEqual([{ t: 'p', lines: ['| a | b |', '| c | d |'] }]);
    });

    it('머리만 있고 행이 없는 표, 칸 수가 들쭉날쭉한 표도 그린다', () => {
        expect(() => html('| a | b |\n|---|---|')).not.toThrow();
        expect(() => html('| a |\n|---|---|---|\n| 1 | 2 | 3 | 4 |\n|\n||')).not.toThrow();
        expect(parseMarkdown('| a |\n|---|\n|')).toEqual([{ t: 'table', head: ['a'], rows: [['']] }]);
    });

    it('짝이 맞지 않는 ** 와 ` 는 글자 그대로 보인다', () => {
        expect(body('**닫히지 않음')).toBe('<p><span>**닫히지 않음</span></p>');
        expect(body('`닫히지 않음')).toBe('<p><span>`닫히지 않음</span></p>');
        expect(body('****')).toMatch(/^<hr/);
        expect(body('a ** b')).toBe('<p><span>a ** b</span></p>');
    });

    it('내용 없는 제목, 아주 긴 줄, 7개 이상의 # 도 오류 없이 그린다', () => {
        expect(() => html('# ')).not.toThrow();
        expect(parseMarkdown('####### 일곱')).toEqual([{ t: 'p', lines: ['####### 일곱'] }]);
        expect(() => html('가'.repeat(100_000))).not.toThrow();
    });
});
