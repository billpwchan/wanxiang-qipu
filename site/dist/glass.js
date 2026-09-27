// 棱镜玻璃：官方 S1 主视觉的竖纹玻璃（fluted glass）。WebGL2 片元着色器：
// 每条竖纹是一段柱面透镜 → 横向折射 + 色散 + 磨砂模糊 + 高光线。
// A 纹理在玻璃后面（折射），B 纹理在揭开后清晰显示；sweep 从左到右把玻璃"推开"。
// 不支持 WebGL2 / 减少动态效果时退化为静态图。

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p * .5 + .5; uv.y = 1. - uv.y; gl_Position = vec4(p, 0., 1.); }`;

const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D A, B;
uniform vec2 res;        // 画布像素
uniform vec4 aBox, bBox; // 纹理映射：xy = 缩放, zw = 偏移（object-fit: cover）
uniform float flutes, open, t, pan, amt, edge, vert;
uniform vec2 ptr;
uniform vec3 tint;
uniform float frost;

vec3 sa(vec2 q){ q = q * aBox.xy + aBox.zw; q.x = fract(q.x + pan); return texture(A, q).rgb; }
vec3 sb(vec2 q){ return texture(B, clamp(q * bBox.xy + bBox.zw, .001, .999)).rgb; }

void main(){
  float fx = uv.x * flutes + ptr.x * .8 + t * .02;
  float f = fract(fx), id = floor(fx);
  float lens = (f - .5);
  lens = lens * (1. + .35 * lens * lens * 4.);           // 柱面：边缘折射更强
  float w = .055 + .02 * sin(id * 2.13);                 // 每条纹理略有差异
  // 玻璃覆盖区：open 推进的扫描线（水平）或 edge 固定边界（路线页）
  float c = vert > .5 ? 1. - uv.y : uv.x;
  float s = open * 1.35 - .2;
  float g = open < 0. ? 1. : smoothstep(s - .16, s + .02, c);
  if (edge > 0.) g = 1. - smoothstep(edge - .12, edge + .05, c + (ptr.x - .5) * .04);
  g *= amt;

  vec2 off = vec2(lens * w, 0.);
  float d = .018;
  vec3 col = vec3(0.);
  // 横向 5 次采样 = 磨砂；RGB 各自偏移 = 色散
  for (int k = -2; k <= 2; k++) {
    float kk = float(k) * .008;
    col.r += sa(uv + off * (1. + d * 9.) + vec2(kk, 0.)).r;
    col.g += sa(uv + off + vec2(kk, 0.)).g;
    col.b += sa(uv + off * (1. - d * 9.) + vec2(kk, 0.)).b;
  }
  col /= 5.;
  // 柱面明暗 + 高光线 + 彩虹边
  float shade = .92 + .16 * (1. - f);
  float hi = smoothstep(.9, 1., f) * .55 + smoothstep(.06, 0., f) * .25;
  vec3 irid = .5 + .5 * cos(6.2831 * (vec3(0., .33, .67) + id * .09 + t * .05));
  vec3 glass = col * shade + hi * .22 + irid * hi * .12;
  glass = mix(glass, tint, frost);

  // 扫描线前沿：清晰图像带一点液态折射
  float front = smoothstep(.0, .12, g) * (1. - smoothstep(.12, .5, g));
  vec2 q = uv + vec2((ptr.x - .5) * -.012, (ptr.y - .5) * -.008) + vec2(lens * .02 * front, 0.);
  vec3 clear = sb(q);
  vec3 outc = mix(clear, glass, g);
  o = vec4(outc, 1.);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export const loadImg = (src) => new Promise((ok, no) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = no; i.src = src; });

// cover 映射：纹理 (tw,th) 铺满画布 (cw,ch)，焦点 (fx,fy) ∈ 0..1
function cover(tw, th, cw, ch, fx = .5, fy = .5) {
  const s = Math.max(cw / tw, ch / th);
  const sx = cw / (tw * s), sy = ch / (th * s);
  return [sx, sy, (1 - sx) * fx, (1 - sy) * fy];
}

export class Glass {
  constructor(canvas, opts = {}) {
    this.c = canvas;
    this.o = Object.assign({ flute: 26, edge: 0, vert: 0, tint: [0.9, 0.93, 1.0], frost: 0.16, dpr: 1.5 }, opts);
    this.gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    this.ok = !!this.gl;
    this.open = -1; this.amt = 1; this.pan = 0; this.panSpeed = 0; this.t = 0;
    this.ptr = [0.5, 0.5]; this.ptrT = [0.5, 0.5];
    this.aInfo = null; this.bInfo = null;
    if (!this.ok) return;
    const gl = this.gl;
    const pr = gl.createProgram();
    gl.attachShader(pr, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    gl.useProgram(pr);
    this.pr = pr;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ['A', 'B', 'res', 'aBox', 'bBox', 'flutes', 'open', 't', 'pan', 'amt', 'edge', 'vert', 'ptr', 'tint', 'frost']) this.u[n] = gl.getUniformLocation(pr, n);
    this.tex = [gl.createTexture(), gl.createTexture()];
    gl.uniform1i(this.u.A, 0);
    gl.uniform1i(this.u.B, 1);
    this.resize();
    this.ro = new ResizeObserver(() => { this.resize(); this.draw(); });
    this.ro.observe(canvas);
    this.io = new IntersectionObserver(([e]) => { this.vis = e.isIntersecting; if (this.vis) this.kick(); });
    this.io.observe(canvas);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.ok = false; });
  }

  resize() {
    const r = this.c.getBoundingClientRect();
    const d = Math.min(devicePixelRatio || 1, this.o.dpr);
    this.w = Math.max(2, Math.round(r.width * d));
    this.h = Math.max(2, Math.round(r.height * d));
    if (this.c.width !== this.w || this.c.height !== this.h) { this.c.width = this.w; this.c.height = this.h; }
    this.cssW = r.width;
  }

  // src: HTMLImageElement | HTMLCanvasElement；slot 0 = A（玻璃后），1 = B（清晰）
  set(slot, src, fx = .5, fy = .5, repeat = false) {
    if (!this.ok) return;
    const gl = this.gl;
    gl.activeTexture(slot ? gl.TEXTURE1 : gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[slot]);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const info = { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height, fx, fy, repeat };
    if (slot) this.bInfo = info; else this.aInfo = info;
  }

  // 把 B 复制成 A（用于连续切换：旧答案变成玻璃后的画面）
  swap() {
    if (!this.ok) return;
    [this.tex[0], this.tex[1]] = [this.tex[1], this.tex[0]];
    [this.aInfo, this.bInfo] = [this.bInfo, this.aInfo];
  }

  pointer(x, y) { this.ptrT = [x, y]; this.kick(); }

  kick() {
    if (this.raf || !this.ok) return;
    const loop = (ts) => {
      this.raf = 0;
      const dt = this.last ? Math.min(50, ts - this.last) : 16;
      this.last = ts;
      this.t += dt / 1000;
      this.pan = (this.pan + this.panSpeed * dt / 1000) % 1;
      this.ptr[0] += (this.ptrT[0] - this.ptr[0]) * 0.08;
      this.ptr[1] += (this.ptrT[1] - this.ptr[1]) * 0.08;
      this.draw();
      const moving = Math.abs(this.ptrT[0] - this.ptr[0]) + Math.abs(this.ptrT[1] - this.ptr[1]) > 0.001;
      if (this.vis !== false && !document.hidden && (this.panSpeed || moving || this.anim)) this.raf = requestAnimationFrame(loop);
      else this.last = 0;
    };
    this.raf = requestAnimationFrame(loop);
  }

  draw() {
    if (!this.ok || !this.aInfo) return;
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.w, this.h);
    const a = this.aInfo, b = this.bInfo || a;
    const ab = a.repeat ? [this.w / this.h / (a.w / a.h), 1, 0, 0] : cover(a.w, a.h, this.w, this.h, a.fx, a.fy);
    gl.uniform4f(u.aBox, ...ab);
    gl.uniform4f(u.bBox, ...cover(b.w, b.h, this.w, this.h, b.fx, b.fy));
    gl.uniform2f(u.res, this.w, this.h);
    gl.uniform1f(u.flutes, Math.max(8, this.cssW / this.o.flute));
    gl.uniform1f(u.open, this.open);
    gl.uniform1f(u.t, this.t);
    gl.uniform1f(u.pan, this.pan);
    gl.uniform1f(u.amt, this.amt);
    gl.uniform1f(u.edge, this.o.edge);
    gl.uniform1f(u.vert, this.o.vert);
    gl.uniform2f(u.ptr, this.ptr[0], this.ptr[1]);
    gl.uniform3f(u.tint, ...this.o.tint);
    gl.uniform1f(u.frost, this.o.frost);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex[0]);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.bInfo ? this.tex[1] : this.tex[0]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // 推开玻璃：open 从 0 → 1
  reveal(dur = 1.1, cb) {
    if (!this.ok) return cb && cb();
    this.open = 0; this.anim = true;
    const t0 = performance.now();
    const step = (ts) => {
      const k = Math.min(1, (ts - t0) / (dur * 1000));
      this.open = 1 - Math.pow(1 - k, 3);
      if (k < 1) requestAnimationFrame(step); else { this.anim = false; this.open = 1; cb && cb(); }
    };
    requestAnimationFrame(step);
    this.kick();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect(); this.io?.disconnect();
    const ext = this.gl?.getExtension('WEBGL_lose_context');
    ext && ext.loseContext();
  }
}

// 离屏合成：答案画面 = 路线原画（压暗、偏冷）+ 棋手立绘（底边对齐）
export async function composeAnswer({ splash, lord, w = 1200, h = 1300, dark = false, fx = .6, fy = .3 }) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const x = cv.getContext('2d');
  const [s, l] = await Promise.all([splash ? loadImg(splash) : null, lord ? loadImg(lord) : null]);
  if (s) {
    const k = Math.max(w / s.width, h / s.height) * 1.02;
    const sw = s.width * k, sh = s.height * k;
    x.filter = 'saturate(1.05)';
    x.drawImage(s, (w - sw) * fx, (h - sh) * fy, sw, sh);
    x.filter = 'none';
  }
  const g = x.createLinearGradient(0, 0, 0, h);
  if (dark) { g.addColorStop(0, 'rgba(10,14,28,.15)'); g.addColorStop(.55, 'rgba(10,14,28,.35)'); g.addColorStop(1, 'rgba(10,14,28,.92)'); }
  else { g.addColorStop(0, 'rgba(232,237,247,.05)'); g.addColorStop(.5, 'rgba(232,237,247,.18)'); g.addColorStop(1, 'rgba(232,237,247,.94)'); }
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  if (l) {
    const lh = h * 0.8, lw = l.width * lh / l.height;
    const lx = Math.min(w - lw * 0.92, (w - lw) / 2 + w * 0.08);
    // 立绘投影
    x.save(); x.shadowColor = dark ? 'rgba(0,0,0,.55)' : 'rgba(30,40,90,.28)'; x.shadowBlur = 60; x.shadowOffsetY = 20;
    x.drawImage(l, lx, h - lh, lw, lh); x.restore();
  }
  return cv;
}

// 待机画面：一排棋手立绘，横向可无缝循环
export async function composeParade(srcs, { h = 1024, dark = false } = {}) {
  const imgs = (await Promise.allSettled(srcs.map(loadImg))).filter((r) => r.status === 'fulfilled').map((r) => r.value);
  // 纹理宽度控制在 4096 以内（iPad 的安全上限）
  const raw = imgs.reduce((a, i) => a + i.width / i.height * 0.86 * 0.72, 0);
  h = Math.min(h, Math.floor(4096 / raw));
  const lh = h * 0.86;
  const widths = imgs.map((i) => i.width * lh / i.height * 0.72);
  const W = Math.ceil(widths.reduce((a, b) => a + b, 0));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = h;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, h);
  const stops = dark ? ['#0d1330', '#1b2150', '#0f2a44', '#23174a', '#0d1330'] : ['#dfe7fb', '#c9d6fb', '#e9dcfb', '#d1ecf6', '#dfe7fb'];
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  x.fillStyle = g; x.fillRect(0, 0, W, h);
  let cx = 0;
  imgs.forEach((im, i) => {
    const lw = im.width * lh / im.height;
    x.drawImage(im, cx - lw * 0.14, h - lh, lw, lh);
    cx += widths[i];
  });
  return cv;
}
