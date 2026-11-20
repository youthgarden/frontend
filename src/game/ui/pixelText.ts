import type { GameObjects, Scene, Types } from 'phaser';

// 맵 위 글자(이름표, 구역 이름, 상호작용 안내)를 픽셀 글꼴로 그리는 한 곳.
// Galmuri11은 CSS @font-face로 선언만 되어 있고, 화면 어딘가에서 쓰이기 전에는 내려받지 않는다.
// Phaser Text는 만들 때 한 번 캔버스에 그려 두므로, 글꼴이 오기 전에 만들면 대체 글꼴로 남는다.
// 그래서 글꼴을 직접 불러오고, 그 전에 만든 글자는 글꼴이 도착하면 다시 그린다.

export const PIXEL_FONT = "'Galmuri11', 'Malgun Gothic', sans-serif";

const FONT_PROBES = ["12px 'Galmuri11'", "bold 12px 'Galmuri11'"];
// 글꼴 파일을 못 받아도 맵이 멈추면 안 된다. 이 시간이 지나면 대체 글꼴로 그대로 간다.
const FONT_TIMEOUT_MS = 3000;

let ready = typeof document === 'undefined' || FONT_PROBES.every((f) => document.fonts.check(f));
let loading: Promise<void> | null = null;

/** 픽셀 글꼴이 준비되면 끝나는 Promise. 실패하거나 시간이 지나도 끝난다(거부하지 않는다). */
export function pixelFontReady(): Promise<void> {
    if (ready) return Promise.resolve();
    if (!loading) {
        const load = Promise.all(FONT_PROBES.map((f) => document.fonts.load(f, '가나다Lv.0')))
            .then(() => undefined)
            .catch(() => undefined);
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, FONT_TIMEOUT_MS));
        loading = Promise.race([load, timeout]).then(() => {
            ready = true;
        });
    }
    return loading;
}

/**
 * 픽셀 글꼴로 Text를 만든다. 글꼴이 아직 없으면 도착한 뒤 한 번 다시 그린다.
 * 크기는 12의 배수로 쓴다. Galmuri11은 12px 격자로 그려진 글꼴이라 그때 가장 또렷하다.
 * onRedraw: 다시 그려 글자 폭이 바뀐 뒤 부른다. 글자 폭에 맞춘 배경을 다시 그릴 때 쓴다.
 */
export function addPixelText(
    scene: Scene,
    x: number,
    y: number,
    text: string,
    style: Types.GameObjects.Text.TextStyle = {},
    onRedraw?: () => void,
): GameObjects.Text {
    const t = scene.add.text(x, y, text, { fontFamily: PIXEL_FONT, fontSize: '12px', color: '#2e1c14', ...style });
    if (!ready) {
        void pixelFontReady().then(() => {
            // 그 사이에 씬이 끝나 글자가 지워졌으면 아무것도 하지 않는다
            if (!t.active || !t.scene) return;
            // true: 글자 높이(ascent/descent)도 새 글꼴 기준으로 다시 잰다
            t.style.update(true);
            onRedraw?.();
        });
    }
    return t;
}
