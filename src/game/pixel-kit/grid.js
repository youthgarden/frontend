// 픽셀 단위로 그리는 작은 캔버스. 색은 '#rrggbb' 문자열, 빈 칸은 null.
// 모든 에셋(캐릭터, 타일, 오브젝트)이 이 클래스로 그려진다.

export class Grid {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.d = new Array(w * h).fill(null);
    this.ox = 0; // 그리기 오프셋 (걷기 흔들림 등에 사용)
    this.oy = 0;
  }

  set(x, y, c) {
    if (!c) return;
    x += this.ox;
    y += this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  }

  clear(x, y) {
    x += this.ox;
    y += this.oy;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = null;
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.d[y * this.w + x];
  }

  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  hline(x0, x1, y, c) {
    for (let x = x0; x <= x1; x++) this.set(x, y, c);
  }

  vline(x, y0, y1, c) {
    for (let y = y0; y <= y1; y++) this.set(x, y, c);
  }

  // 양 끝 좌표를 포함하는 타원 채우기. clip(x, y)가 false면 그 칸은 건너뛴다.
  ellipse(x0, y0, x1, y1, c, clip) {
    const cx = (x0 + x1 + 1) / 2;
    const cy = (y0 + y1 + 1) / 2;
    const rx = (x1 - x0 + 1) / 2;
    const ry = (y1 - y0 + 1) / 2;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1.08 && (!clip || clip(x, y))) this.set(x, y, c);
      }
    }
  }

  // 문자열 그림을 찍는다. pal에 없는 문자('.', ' ')는 투명.
  map(x, y, rows, pal) {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const c = pal[row[i]];
        if (c) this.set(x + i, y + j, c);
      }
    });
  }

  // 바깥 윤곽선: 비어 있고 상하좌우에 칠해진 칸이 있으면 윤곽선 색을 넣는다.
  outline(c) {
    const src = this.d.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? null : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src[y * this.w + x]) continue;
        if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1)) this.d[y * this.w + x] = c;
      }
    }
    return this;
  }

  flipX() {
    const g = new Grid(this.w, this.h);
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) g.d[y * this.w + (this.w - 1 - x)] = this.d[y * this.w + x];
    return g;
  }

  // 다른 Grid를 (dx, dy)에 겹쳐 그린다.
  blit(g, dx, dy) {
    for (let y = 0; y < g.h; y++)
      for (let x = 0; x < g.w; x++) {
        const c = g.d[y * g.w + x];
        if (c) {
          const tx = x + dx;
          const ty = y + dy;
          if (tx >= 0 && ty >= 0 && tx < this.w && ty < this.h) this.d[ty * this.w + tx] = c;
        }
      }
  }

  // 캔버스 컨텍스트의 (dx, dy)에 1:1로 그린다.
  drawTo(ctx, dx = 0, dy = 0) {
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.d.length; i++) {
      const c = this.d[i];
      if (!c) continue;
      const n = parseInt(c.slice(1), 16);
      img.data[i * 4] = (n >> 16) & 255;
      img.data[i * 4 + 1] = (n >> 8) & 255;
      img.data[i * 4 + 2] = n & 255;
      img.data[i * 4 + 3] = 255;
    }
    // putImageData는 투명을 덮어쓰므로 임시 캔버스를 거쳐 합성한다.
    const tmp = makeCanvas(this.w, this.h);
    tmp.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(tmp, dx, dy);
  }

  toCanvas() {
    const c = makeCanvas(this.w, this.h);
    this.drawTo(c.getContext('2d'));
    return c;
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 시드 고정 난수. 같은 시드면 같은 무늬가 나와서 타일이 매번 똑같이 그려진다.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}
