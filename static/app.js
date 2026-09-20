/* v30 Monitor — 前端。原生 JS，无依赖。
   设计参考 Open Pi 风格：iOS 分组卡片 + 实时折线图 + 详情页。 */

'use strict';

/* ------------------------------------------------------------------ 图标 */
const SVG = (d, extra = '') =>
  `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

const ICONS = {
  gear: SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.08A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  bell: SVG('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
  chart: SVG('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
  folder: SVG('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
  chip: SVG('<rect x="4" y="4" width="16" height="16" rx="3"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2"/>'),
  thermo: SVG('<path d="M14 14.76V4.5a2.5 2.5 0 0 0-5 0v10.26a4.5 4.5 0 1 0 5 0z"/>'),
  memory: SVG('<line x1="22" y1="12" x2="2" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01M10 16h.01"/>'),
  disk: SVG('<rect x="2" y="3" width="20" height="7" rx="2"/><rect x="2" y="14" width="20" height="7" rx="2"/><path d="M6 6.5h.01M6 17.5h.01"/>'),
  globe: SVG('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  bolt: SVG('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
  battery: SVG('<path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"/><line x1="23" y1="13" x2="23" y2="11"/><path d="M11 6 7 12h6l-4 6"/>'),
  activity: SVG('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'),
  clock: SVG('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  wifi: SVG('<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>'),
  layers: SVG('<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>'),
  close: SVG('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  check: SVG('<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'),
  alert: SVG('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'),
  refresh: SVG('<path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>'),
  download: SVG('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
  x: SVG('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
};

const COLORS = {
  blue: '#007AFF', orange: '#FF7A2F', purple: '#AF52DE', green: '#34C759',
  cyan: '#32ADE6', yellow: '#F5A623', red: '#FF3B30', indigo: '#5856D6',
  gray: '#8E8E93',
};

/* -------------------------------------------------------------- 小工具 */
const $ = (sel, root = document) => root.querySelector(sel);

function h(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

const pad2 = (n) => String(n).padStart(2, '0');

function clockTime(ts) {
  const d = new Date(ts * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/* 气泡用：5 分钟窗口里 HH:MM 分辨不出具体是哪一个样本（1 分钟 = 60 个点），
   选点时尤其明显，所以气泡带秒。横轴仍然只用 HH:MM，免得太挤。 */
function clockSec(ts) {
  const d = new Date(ts * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function fmtBytes(b) {
  if (b == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = Number(b);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(i >= 3 ? 2 : 1)} ${units[i]}`;
}

function fmtRate(bytesPerSec) {
  if (bytesPerSec == null) return '—';
  if (bytesPerSec >= 1048576) return `${(bytesPerSec / 1048576).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
}

/* 磁贴灰字用的紧凑速率（单位缩成 K/M/B 一个字母）。
   关键：数值部分最多 4 个字符，宽度才有上界 —— 灰字是单行 nowrap，
   一旦超宽会撑宽 grid 轨道把整块布局搞坏（见 traffic 磁贴的注释）。
   MB: >=10 取整(1 位)、否则 1 位小数 → "9.9M" / "12M"
   KB: 取整 → 最多 "1023K"；B: 取整 → 最多 "1023B" */
function fmtRateTiny(bytesPerSec) {
  if (bytesPerSec == null) return '—';
  if (bytesPerSec >= 1048576) {
    const v = bytesPerSec / 1048576;
    return `${v >= 10 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (bytesPerSec >= 1024) return `${Math.round(bytesPerSec / 1024)}K`;
  return `${Math.round(bytesPerSec)}B`;
}

function fmtKBps(kb) {
  if (kb == null) return '—';
  if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB/s`;
  return `${kb.toFixed(kb < 10 ? 1 : 0)} KB/s`;
}

function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const d = Math.floor(sec / 86400);
  const hrs = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${hrs}h`;
  if (hrs) return `${hrs}h ${min}m`;
  return `${min}m`;
}

function fmtMHz(mhz) {
  if (!mhz) return '—';
  return `${(mhz / 1000).toFixed(2)} GHz`;
}

const levelColor = (v, warn, crit) =>
  v >= crit ? COLORS.red : v >= warn ? COLORS.yellow : COLORS.green;

/* 充放电的数值一律显示**绝对量**，方向改由文字标注。
   不要用 +/− 号：有方向词已经说清了，再带符号反而干扰阅读，
   而且负号容易和"数值很小"的视觉印象混淆。
   后端 API 仍然给带符号的值（power / current_ma_signed），那只是内部表示。 */
function fmtMag(v, digits, unit) {
  return `${Math.abs(Number(v) || 0).toFixed(digits)}${unit}`;
}

/* 方向词（界面文案统一英文）。direction 由后端按 battery 的 status 字符串判定：
   in = 充入（输入），out = 放出（输出），idle = 无充放电 */
function flowWord(d) {
  const dir = d.battery.direction;
  if (dir === 'in') return 'In';
  if (dir === 'out') return 'Out';
  return 'Idle';
}

/* 整机功率的**来源**（给磁贴灰字用，和电池的充放电方向不是一回事）：
   usb = 插着电、系统吃的是 VBUS；battery = 由电池供电。
   注意这两个概念容易混：电池 direction 说的是"电流进电池还是出电池"，
   而 source 说的是"整机这会儿在吃谁的电"。 */
function sourceWord(d) {
  if ((d.battery.system_power || 0) < 0.05) return 'Idle';
  return d.battery.source === 'usb' ? 'In' : 'Out';
}

function avg(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/* 绝对量的平均：不能直接对带符号序列求平均再取绝对值——
   5 分钟窗口里方向翻转时两个方向会互相抵消，均值会假性接近 0。 */
function avgMag(arr) {
  if (!arr || !arr.length) return 0;
  return arr.reduce((a, b) => a + Math.abs(Number(b) || 0), 0) / arr.length;
}

/* ---------------------------------------------------------- 图表绘制 */
function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const mx = (x0 + x1) / 2;
    d += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
}

/* 一个图表实例：创建一次，之后只改内容，避免每秒钟重建 DOM */
function createChart(host, { height = 168, mini = false } = {}) {
  host.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chart-svg');
  svg.setAttribute('height', height);
  host.appendChild(svg);
  let axis = null, tip = null;
  if (!mini) {
    axis = h('div', 'chart-axis', '<span></span><span></span><span></span>');
    host.appendChild(axis);
    tip = h('div', 'chart-tip', '<b>—</b><span>—</span>');
    tip.style.display = 'none';
    host.appendChild(tip);
  }
  // 选中的点**不能存数组下标**：历史是环形缓冲，每秒新样本进来整个数组左移一位，
  // 同一个下标下一秒就是另一个样本了（表现为"刚点中的点自己变了 / 弹回最新"）。
  // 所以钉住(pinTs)和悬停(hoverTs)一律存**样本时间戳**，每次重绘再反解成下标。
  const inst = { host, svg, axis, tip, height, mini, pinTs: null, hoverTs: null };

  if (!mini) {
    const indexAt = (clientX) => {
      const rect = svg.getBoundingClientRect();
      const n = inst.n || 0;
      if (n < 2) return null;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left - inst.padL) /
                                          Math.max(1, rect.width - inst.padL - inst.padR)));
      return Math.round(ratio * (n - 1));
    };
    const redraw = () => drawChart(inst, inst.spec, inst.series, inst.meta);
    const tsAt = (i) => inst.meta.now - ((inst.n || 1) - 1 - i) * (inst.meta.interval || 1);

    const pick = (ev) => {
      const i = indexAt(ev.touches ? ev.touches[0].clientX : ev.clientX);
      if (i == null || !inst.meta) return;
      const pressed = ev.pointerType === 'mouse' ? ev.buttons > 0 : true;
      if (pressed) {
        inst.hoverTs = null;
        // 再点一次**同一个样本** = 解除钉住，回到实时
        if (inst.pinTs != null && resolveTs(inst, inst.n, inst.meta, inst.pinTs) === i) {
          inst.pinTs = null;
        } else {
          inst.pinTs = tsAt(i);
        }
        redraw();
      } else {
        // 鼠标悬停（没按下）：临时高亮，移出去就恢复实时
        inst.hoverTs = tsAt(i);
        redraw();
      }
    };

    host.addEventListener('pointerdown', pick);
    host.addEventListener('pointermove', pick);
    // 离开图表只清「悬停」，**绝不清钉住**。手指抬起同样会派发 pointerleave ——
    // 以前在这里清 cursor，就是"点一下立刻弹回最新"的根因。
    const clearHover = () => {
      if (inst.hoverTs == null) return;
      inst.hoverTs = null;
      redraw();
    };
    host.addEventListener('pointerleave', clearHover);
    host.addEventListener('pointercancel', clearHover);

    // 气泡上的 Live 按钮：解钉回实时。tip 整体 pointer-events:none，
    // 只有按钮可点，且要在 pointerdown 阶段就掐断冒泡（否则 host 会把它当成一次选点）。
    tip.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.tip-live')) { ev.stopPropagation(); ev.preventDefault(); }
    });
    tip.addEventListener('click', (ev) => {
      if (!ev.target.closest('.tip-live')) return;
      inst.pinTs = null;
      redraw();
    });
  }
  return inst;
}

/* 时间戳 → 当前数组下标；该样本已经滚出历史窗口时返回 null */
function resolveTs(inst, n, meta, ts) {
  const interval = (meta && meta.interval) || 1;
  const i = n - 1 - Math.round(((meta ? meta.now : 0) - ts) / interval);
  if (i < 0) return null;   // 比 5 分钟窗口还老，数据已经没了
  return Math.min(i, n - 1);
}

function drawChart(inst, spec, series, meta) {
  if (!spec || !series) return;
  inst.spec = spec;
  inst.series = series;
  inst.meta = meta;

  const w = Math.round(inst.svg.getBoundingClientRect().width) || inst.host.clientWidth || 320;
  const hgt = inst.height;
  const padL = inst.mini ? 1 : 4;
  const padR = inst.mini ? 1 : 6;
  const padT = inst.mini ? 3 : 12;
  const padB = inst.mini ? 3 : 10;

  // 线的 `abs: true` → 画绝对值（充放电功率/电流：方向已由文字标注，
  // 曲线只看量级，不需要正负两半）
  const lines = spec.lines
    .map((l) => ({
      ...l,
      values: (series[l.key] || []).map((v) => (l.abs ? Math.abs(Number(v) || 0) : v)),
    }))
    .filter((l) => l.values.length);

  const all = lines.flatMap((l) => l.values);
  if (!all.length) { inst.svg.innerHTML = ''; return; }

  let lo, hi;
  if (spec.domain) {
    [lo, hi] = spec.domain;
  } else {
    // 默认把 0 纳入值域 —— 占用率 / 负载 / 流量这类"从 0 起算"的量应该这样。
    // tight: 不强制纳入 0。功率、电流这种量方向已由文字标注（输入/输出）、
    //   且数值长期远离 0（放电常年 3~4 W），强行从 0 起会变成贴着顶端的一条
    //   平线，波动全被压没。tight 下按数据自身的 min/max 取范围。
    lo = spec.tight ? Math.min(...all) : Math.min(...all, 0);
    hi = Math.max(...all);
    const span = Math.max(hi - lo, spec.minSpan || 1);
    hi = lo + span * 1.18;
    lo = spec.tight ? lo - span * 0.08 : Math.max(0, lo - span * 0.08);
    if (spec.fromZero) lo = 0;
  }
  // 0 对称值域（保留给需要同时看正负两半的曲线）
  if (spec.symmetric) {
    const m = Math.max(spec.minHalf || 1, ...all.map((v) => Math.abs(v)));
    lo = -m * 1.25;
    hi = m * 1.25;
  }
  if (hi - lo < 1e-6) hi = lo + 1;

  const n = Math.max(...lines.map((l) => l.values.length));
  const x = (i) => padL + (i * (w - padL - padR)) / Math.max(1, n - 1);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (hgt - padT - padB);

  // 钉住 / 悬停都按时间戳反解下标。样本滚出 5 分钟窗口后自动放开、回到实时。
  let pinned = false;
  let cursor = n - 1;
  if (inst.pinTs != null) {
    const i = resolveTs(inst, n, meta, inst.pinTs);
    if (i == null) inst.pinTs = null; else { cursor = i; pinned = true; }
  }
  if (!pinned && inst.hoverTs != null) {
    const i = resolveTs(inst, n, meta, inst.hoverTs);
    if (i == null) inst.hoverTs = null; else cursor = i;
  }
  const cx = x(cursor);

  let out = '';

  // 0 基准线（充放电正负分界）
  if (spec.zero && lo < 0 && hi > 0) {
    const yz = y(0);
    out += `<line x1="${padL}" y1="${yz.toFixed(1)}" x2="${w - padR}" y2="${yz.toFixed(1)}" ` +
           `stroke="${COLORS.gray}" stroke-width="1" stroke-dasharray="2 4" opacity="0.7"/>`;
  }

  // 阈值虚线
  for (const dash of spec.dashes || []) {
    if (dash.v < lo || dash.v > hi) continue;
    const yv = y(dash.v);
    out += `<line x1="${padL}" y1="${yv.toFixed(1)}" x2="${w - padR}" y2="${yv.toFixed(1)}" ` +
           `stroke="${dash.color || COLORS.gray}" stroke-width="1" stroke-dasharray="4 5" opacity="${inst.mini ? 0.35 : 0.5}"/>`;
  }

  // 竖线指示：钉住时用曲线本色实线（明显区别于实时的灰色虚线）
  if (!inst.mini && n > 1) {
    const c = COLORS[lines[0].color] || lines[0].color || COLORS.gray;
    out += `<line x1="${cx.toFixed(1)}" y1="${padT - 6}" x2="${cx.toFixed(1)}" y2="${hgt - padB}" ` +
           `stroke="${pinned ? c : COLORS.gray}" stroke-width="${pinned ? 1.6 : 1}" ` +
           `${pinned ? '' : 'stroke-dasharray="3 4" '}opacity="${pinned ? 0.9 : 0.5}"/>`;
  }

  // 曲线
  for (const l of lines) {
    const pts = l.values.map((v, i) => [x(i), y(v)]);
    if (!pts.length) continue;
    const color = COLORS[l.color] || l.color;
    out += `<path d="${smoothPath(pts)}" fill="none" stroke="${color}" stroke-width="${inst.mini ? 1.8 : 2.4}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (!inst.mini) {
      const last = pts[pts.length - 1];
      out += `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.6" fill="${color}"/>`;
    }
  }

  // 钉住的点上画一个描边圆点，跟"最新的点"区分开
  if (pinned && !inst.mini) {
    const p = lines[0];
    const ci = Math.min(cursor, p.values.length - 1);
    const v = p.values[ci];
    if (v != null) {
      const color = COLORS[p.color] || p.color;
      out += `<circle cx="${x(ci).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4.6" ` +
             `fill="${color}" stroke="#fff" stroke-width="2"/>`;
    }
  }

  // 值域提示：tight 模式下 y 轴不锚定 0，画一条贴顶的曲线会让人高估波动幅度，
  // 所以在左上角标出这 5 分钟的实际数值范围。
  if (!inst.mini && spec.tight) {
    const dmin = Math.min(...all);
    const dmax = Math.max(...all);
    const fmtR = spec.format || ((v) => String(v));
    out += `<text x="${(padL + 2).toFixed(1)}" y="${(padT + 9).toFixed(1)}" ` +
           `font-size="10" font-weight="600" fill="${COLORS.gray}" opacity="0.9">` +
           `${fmtR(dmin)} – ${fmtR(dmax)}</text>`;
  }

  inst.svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  inst.svg.setAttribute('width', w);
  inst.svg.innerHTML = out;
  inst.n = n;
  inst.padL = padL;
  inst.padR = padR;

  // 提示气泡 + 时间轴
  if (!inst.mini) {
    const primary = lines[0];
    const at = (l) => l.values[Math.min(cursor, l.values.length - 1)];
    const val = at(primary);
    const ts = meta.now - (n - 1 - cursor) * meta.interval;
    if (val != null && w > 0) {
      // 注意：SVG 元素没有 offsetLeft/offsetTop，必须用 getBoundingClientRect 求相对偏移；
      // 且 SVG 的绘制宽度是卡片内容盒宽度（不含 padding），否则坐标会整体错位。
      const svgBox = inst.svg.getBoundingClientRect();
      const hostBox = inst.host.getBoundingClientRect();
      const offX = svgBox.left - hostBox.left;
      const offY = svgBox.top - hostBox.top;
      const cardW = hostBox.width || inst.host.clientWidth;
      // 多线图（功率双线、Traffic 上下行）每根线给一行，颜色和图例对应。
      // 仍然用 <b> 包每个值，单线时的样式和既有断言都不受影响。
      const rows = lines.map((l) => {
        const v = at(l);
        if (v == null || !Number.isFinite(Number(v))) return '';
        return `<b class="tip-k" style="color:${COLORS[l.color] || l.color}">${spec.format(v)}</b>`;
      }).join('');
      inst.tip.style.display = '';
      inst.tip.classList.toggle('multi', lines.length > 1);
      inst.tip.innerHTML =
        rows +
        `<span>${clockSec(ts)}</span>` +
        (pinned ? '<button type="button" class="tip-live" title="Back to live">Live</button>' : '');
      inst.tip.classList.toggle('pinned', pinned);
      // 先量实际尺寸，再把气泡夹进卡片内，避免被 overflow:hidden 切掉。
      // 垂直方向尤其要注意：气泡是 translate(-50%,-100%) 的（向上生长），
      // 只 clamp 一个固定 40 会让多行气泡的顶部被卡片顶边裁掉。
      const half = inst.tip.offsetWidth / 2 + 3;
      const tall = inst.tip.offsetHeight + 2;
      const left = Math.max(half, Math.min(cardW - half, offX + cx));
      inst.tip.style.left = `${left}px`;
      inst.tip.style.top = `${offY + Math.max(tall, y(val) - 10)}px`;
    }
    if (inst.axis) {
      const spans = inst.axis.querySelectorAll('span');
      const idx = [0, Math.floor((n - 1) / 2), n - 1];
      idx.forEach((i, k) => {
        spans[k].textContent = n > 1 ? clockTime(meta.now - (n - 1 - i) * meta.interval) : '';
      });
    }
  }
}

/* ------------------------------------------------------------ 指标定义 */
function statusWord(level, texts) {
  return { text: texts[level] || texts.normal, level };
}

const METRICS = {
  cpu: {
    label: 'CPU Load', icon: 'chip', color: 'blue',
    tile: (d) => {
      const v = d.cpu.total;
      return {
        badge: fmtMHz(d.cpu.freq_cur_mhz),
        value: `${Math.round(v)}%`,
        bar: { pct: v, color: levelColor(v, 50, 80) },
      };
    },
    detail: (d, series) => {
      const v = d.cpu.total;
      const lvl = v >= 80 ? 'critical' : v >= 50 ? 'elevated' : 'normal';
      return {
        title: 'CPU Load',
        name: 'CPU Load', icon: 'chip', color: 'blue',
        badge: `${(d.cpu.freq_max_mhz / 1000).toFixed(1)} GHz`,
        big: `${v.toFixed(1)}%`,
        status: statusWord(lvl, {
          normal: 'Within normal range', elevated: 'Elevated load', critical: 'Saturated',
        }),
        chart: {
          lines: [{ key: 'cpu', color: 'blue' }],
          domain: [0, 100],
          dashes: [{ v: 80 }, { v: 95 }],
          format: (x) => `${x.toFixed(0)}%`,
        },
        info: () => [
          ['Thresholds', 'Warning 80% • Critical 95%'],
          ['Load Average', `${d.cpu.load.load1.toFixed(2)} • ${d.cpu.load.load5.toFixed(2)} • ${d.cpu.load.load15.toFixed(2)}`],
          ['Processes / Threads', `${d.cpu.processes} / ${d.cpu.load.threads}`],
          ['Governor', d.cpu.governor],
          ['CPU Pressure (60s)', `${(d.cpu.pressure || 0).toFixed(1)}%`],
        ],
        cores: d.cpu.cores,
      };
    },
  },

  temp: {
    label: 'Temperature', icon: 'thermo', color: 'orange',
    tile: (d) => {
      const v = d.thermal.soc ?? 0;
      const lvl = v >= d.thermal.critical ? 'critical' : v >= d.thermal.warning ? 'elevated' : 'normal';
      return {
        badge: lvl === 'normal' ? 'Normal' : lvl === 'elevated' ? 'Warm' : 'Hot',
        value: `${v.toFixed(0)}°C`,
        bar: { pct: (v / 90) * 100, color: levelColor(v, d.thermal.warning, d.thermal.critical) },
      };
    },
    detail: (d) => {
      const v = d.thermal.soc ?? 0;
      const lvl = v >= d.thermal.critical ? 'critical' : v >= d.thermal.warning ? 'elevated' : 'normal';
      const trips = (d.thermal.kernel_trips || [])
        .map((t) => `${t.type} ${t.celsius.toFixed(0)}°C`).join(' • ') || '—';
      return {
        title: 'Temperature',
        name: 'Temperature', icon: 'thermo', color: 'orange',
        badge: lvl === 'normal' ? 'Normal' : lvl === 'elevated' ? 'Warm' : 'Hot',
        big: `${v.toFixed(0)}°C`,
        status: statusWord(lvl, {
          normal: 'Within normal range', elevated: 'Running warm', critical: 'Overheating',
        }),
        chart: {
          lines: [{ key: 'temp', color: 'orange' }],
          domain: [20, 90],
          dashes: [{ v: d.thermal.warning }, { v: d.thermal.critical }],
          format: (x) => `${x.toFixed(0)}°C`,
        },
        info: () => [
          ['Thresholds', `Warning ${d.thermal.warning}°C • Critical ${d.thermal.critical}°C`],
          ['Battery Temperature', d.thermal.battery != null ? `${d.thermal.battery.toFixed(1)}°C` : '—'],
          ['Sensor', d.thermal.soc_zone],
          ['Kernel Trips', trips],
        ],
        // thermal_zone 只有 SoC 和电池两个；skin / chg 来自 IIO rradc，一并列出
        zones: (d.thermal.zones || []).concat(d.thermal.iio_zones || []),
      };
    },
  },

  memory: {
    label: 'Memory', icon: 'memory', color: 'purple',
    tile: (d) => ({
      badge: fmtBytes(d.memory.total),
      value: `${d.memory.percent.toFixed(0)}%`,
      bar: { pct: d.memory.percent, color: levelColor(d.memory.percent, 70, 90) },
    }),
    detail: (d) => ({
      title: 'Memory',
      name: 'Memory', icon: 'memory', color: 'purple',
      badge: `${fmtBytes(d.memory.available)} free`,
      big: `${d.memory.percent.toFixed(1)}%`,
      status: statusWord(
        d.memory.percent >= 90 ? 'critical' : d.memory.percent >= 70 ? 'elevated' : 'normal',
        { normal: 'Plenty of memory available', elevated: 'Memory pressure is rising', critical: 'Low memory' }),
      chart: {
        lines: [{ key: 'mem', color: 'purple' }],
        domain: [0, 100],
        dashes: [{ v: 90 }],
        format: (x) => `${x.toFixed(0)}%`,
      },
      info: () => [
        ['Total', fmtBytes(d.memory.total)],
        ['Used', fmtBytes(d.memory.used)],
        ['Available', fmtBytes(d.memory.available)],
        ['Cached', fmtBytes(d.memory.cached)],
        ['Buffers', fmtBytes(d.memory.buffers)],
        ['Swap', d.memory.swap_total ? `${fmtBytes(d.memory.swap_used)} / ${fmtBytes(d.memory.swap_total)}` : 'Disabled'],
        ['Memory Pressure (60s)', `${((d.system.pressure.memory || {}).avg60 || 0).toFixed(2)}%`],
        ...(d.memory.zram ? [
          // zram：换出去的页是压缩存的，ratio 2.24 = 用 1 字节存了 2.24 字节
          ['Zram Compressed', `${fmtBytes(d.memory.zram.orig)} → ${fmtBytes(d.memory.zram.compr)} (${d.memory.zram.ratio.toFixed(2)}×, ${d.memory.zram.algorithm})`],
          ['Zram Saved', fmtBytes(d.memory.zram.saved)],
          ['Swap Activity', `${fmtRate(d.memory.swap_rate.in_bps)} in · ${fmtRate(d.memory.swap_rate.out_bps)} out`],
        ] : []),
      ],
    }),
  },

  disk: {
    label: 'Disk Usage', icon: 'disk', color: 'green',
    tile: (d) => ({
      badge: `${fmtBytes(d.disk.root.free)} free`,
      value: `${d.disk.root.percent.toFixed(0)}%`,
      bar: { pct: d.disk.root.percent, color: levelColor(d.disk.root.percent, 80, 92) },
    }),
    detail: (d) => ({
      title: 'Disk Usage',
      name: 'Disk Usage', icon: 'disk', color: 'green',
      badge: `${fmtBytes(d.disk.root.total)} total`,
      big: `${d.disk.root.percent.toFixed(1)}%`,
      status: statusWord(
        d.disk.root.percent >= 92 ? 'critical' : d.disk.root.percent >= 80 ? 'elevated' : 'normal',
        { normal: 'Plenty of space available', elevated: 'Storage is filling up', critical: 'Storage almost full' }),
      chart: {
        lines: [{ key: 'disk', color: 'green' }],
        domain: [0, 100],
        dashes: [{ v: 90 }],
        format: (x) => `${x.toFixed(1)}%`,
      },
      info: () => [
        ['Thresholds', 'Warning 80% • Critical 90%'],
        ...d.disk.mounts.map((m) => [
          `${m.label}  ${m.path}`,
          `${fmtBytes(m.used)} / ${fmtBytes(m.total)}  (${m.percent.toFixed(0)}%)`,
        ]),
      ],
    }),
  },

  traffic: {
    label: 'Traffic', icon: 'globe', color: 'cyan',
    // 大字 = 「上行 + 下行」合计吞吐；右上角灰字**单行**把两个方向分开。
    //
    // 单行必须换紧凑单位：灰字可用宽度只有 95px(360 视口) ~ 155px(492 视口)，
    // 而「↑ 12 KB/s ↓ 3.4 MB/s」完整单位版实测 156px，放不下。
    // 更糟的是 .tile 在 grid-template-columns: 1fr 1fr 里，1fr 的 min 是
    // min-content —— 灰字超宽会**撑宽网格轨道**、整块溢出后被
    // #app{overflow-x:clip} 裁掉，右列直接看不见（还没有滚动条提示）。
    // fmtRateTiny 把数值压到最多 4 位（1023K / 9.9M / 987B），宽度才有上界。
    tile: (d) => ({
      badge: `↑ ${fmtRateTiny(d.network.tx_rate)} ↓ ${fmtRateTiny(d.network.rx_rate)}`,
      value: fmtRate(d.network.rx_rate + d.network.tx_rate),
      bar: {
        pct: Math.min(100, ((d.network.rx_rate + d.network.tx_rate) / 1048576) * 100),
        color: COLORS.cyan,
      },
    }),
    detail: (d) => ({
      title: 'Traffic',
      name: 'Traffic', icon: 'globe', color: 'cyan',
      badge: d.network.iface,
      // 和磁贴同一个原则：大字给合计，上下行分开交给下面的灰字状态行
      big: fmtRate(d.network.rx_rate + d.network.tx_rate),
      // 早先这里还有一句「Network is busy / idle」，阈值是 2048 B/s（2 KB/s）——
      // 手机只要有后台流量就常年超线，等于恒定显示 busy，是个没信息的噪音，去掉。
      status: {
        text: `↓ ${fmtRate(d.network.rx_rate)} · ↑ ${fmtRate(d.network.tx_rate)}`,
        level: 'normal',
      },
      chart: {
        lines: [
          { key: 'rx', color: 'cyan' },
          { key: 'tx', color: 'purple' },
        ],
        fromZero: true,
        minSpan: 10,
        format: (x) => fmtKBps(x),
      },
      info: () => {
        const rows = [
          ['Interface', `${d.network.iface} · ${d.network.ip}`],
          ['Download Now', fmtRate(d.network.rx_rate)],
          ['Upload Now', fmtRate(d.network.tx_rate)],
          ['Received (total)', fmtBytes(d.network.rx_total)],
          ['Sent (total)', fmtBytes(d.network.tx_total)],
        ];
        // WiFi 链路信息来自 nmcli（后端 10s 采一次并缓存），拿不到就整段不显示
        const w = d.network.wifi;
        if (w) {
          rows.push(
            ['Wi-Fi Network', w.ssid],
            ['Signal', `${w.signal}%${w.bssid ? ` · ${w.bssid}` : ''}`],
            ['Band', `${w.freq} · CH ${w.channel}`],
            ['Link Rate', w.rate],
          );
        }
        return rows;
      },
      legend: [
        { color: 'cyan', text: 'Download' },
        { color: 'purple', text: 'Upload' },
      ],
    }),
  },

  battery: {
    label: 'Battery', icon: 'battery', color: 'green',
    // 2026-09-14：原来的 Power Draw 卡片合并进来了。它和 Battery 用的是**同一份**
    // 数据源（pmi8998-fg 的 V × I），详情页字段几乎全重复（电压/电流/方向/两个均值）。
    // 现在：磁贴大字 = 电量，灰字 = 功率 + 方向；详情页主图 = 功率，副图 = 电流。
    tile: (d) => ({
      // 灰字是**整机**功耗 + 它来自哪：插电时电池端 V×I 会小到接近 0，
      // 直接显示电池功率会让人以为机器几乎不耗电
      badge: `${fmtMag(d.battery.system_power, 2, ' W')} ${sourceWord(d)}`,
      value: `${d.battery.capacity}%`,
      bar: {
        pct: d.battery.capacity,
        color: d.battery.capacity <= 20 ? COLORS.red
          : d.battery.capacity <= 40 ? COLORS.yellow : COLORS.green,
      },
    }),
    detail: (d) => {
      const ch = d.charger || {};
      const chargerLine = !ch.present ? 'Not detected'
        : ch.online ? `${ch.usb_type} · ${ch.current_max_ma} mA max`
        : 'Not connected';
      const modeLine = !ch.present ? '—'
        : ch.inhibited ? `${ch.behaviour} (suspended)` : ch.behaviour;
      const sys = d.battery.system_power || 0;
      const fromUsb = d.battery.source === 'usb';
      return {
        title: 'Battery',
        name: 'Battery', icon: 'battery', color: 'green',
        badge: d.battery.status,
        big: `${d.battery.capacity}%`,
        status: {
          // 插着电却不充电，八成就是 charge_behaviour 被设成了 inhibit-charge ——
          // 直接把原因写出来，比让用户对着 "Not charging" 猜强
          text: ch.inhibited ? 'Charging suspended (inhibit-charge)'
            : d.battery.charging ? `Charging · ${fmtMag(sys, 2, ' W')} draw`
            : d.battery.capacity <= 20 ? 'Battery critical'
            : d.battery.capacity <= 40 ? 'Battery low'
            : `On battery · ${fmtMag(sys, 2, ' W')} draw`,
          level: ch.inhibited ? 'normal'
            : d.battery.capacity <= 20 ? 'critical'
            : d.battery.capacity <= 40 ? 'elevated' : 'normal',
        },
        // 主图两条线：整机（power）与电池端（batt_pow）。
        // 放电时电池就是整机的唯一来源，两条线**本来就应该重合**；
        // 插电时系统吃 VBUS，两条线会分开（inhibit-charge 下能差两个数量级）——
        // 这正是"为什么插着电电池端几乎不动"最直观的呈现。
        // 注意整机**不是** SoC/Core 功耗（v30 没有 rail 级传感器），
        // 且充电时"输入 − 充入电池"这个差值里含充电回路损耗，会比纯系统功耗略高。
        chart: {
          lines: [
            { key: 'power', color: 'yellow', abs: true },
            { key: 'batt_pow', color: 'green', abs: true },
          ],
          tight: true,
          minSpan: 1,
          format: (x) => `${x.toFixed(2)} W`,
        },
        // 电流单独一张图：mA 和 W 差两个数量级，画在一起会互相压平
        miniChart: {
          title: 'Current',
          lines: [{ key: 'batt_cur', color: 'cyan', abs: true }],
          tight: true,
          minSpan: 200,
          format: (x) => `${x.toFixed(0)} mA`,
        },
        stats: false,
        legend: [
          { color: 'yellow', text: 'System' },
          { color: 'green', text: 'Battery' },
        ],
        averages: (series) => [
          ['Avg System Power (5 min)', `${avgMag(series.power).toFixed(2)} W`],
          ['Avg Battery Power (5 min)', `${avgMag(series.batt_pow).toFixed(2)} W`],
          ['Avg Current (5 min)', `${avgMag(series.batt_cur).toFixed(0)} mA`],
        ],
        info: () => [
          ['Status', `${d.battery.status} · ${d.battery.charger_type}`],
          ['Voltage', `${d.battery.voltage.toFixed(3)} V`],
          ['Current', fmtMag(d.battery.current_ma_signed, 0, ' mA')],
          // 整机和电池端是两个数，充电时被抑制时差距能到两个数量级，必须分开列
          ['System Power', `${fmtMag(sys, 2, ' W')} (whole device)`],
          ['Battery Power', fmtMag(d.battery.power, 2, ' W')],
          ['Power Source', fromUsb ? 'External (USB)' : 'Battery'],
          ...(fromUsb ? [
            ['Input', `${d.battery.input_voltage.toFixed(2)} V × ${Math.round(d.battery.input_current_ma)} mA = ${fmtMag(d.battery.input_power, 2, ' W')}`],
          ] : []),
          // 充电效率 = 真正充进电池的 / 输入的总功率，其余是系统 + 充电回路损耗
          ...(fromUsb && d.battery.charging && d.battery.input_power > 0.5 ? [
            ['Charging Efficiency',
              `${((d.battery.batt_in_power / d.battery.input_power) * 100).toFixed(0)}% ` +
              `(${fmtMag(d.battery.batt_in_power, 2, ' W')} into battery)`],
          ] : []),
          ['Direction', flowWord(d)],
          ['Charger', chargerLine],
          ['Charging Mode', modeLine],
          ['Temperature', d.battery.temp != null ? `${d.battery.temp.toFixed(1)}°C` : '—'],
          ['Health', d.battery.health],
          ['Technology', d.battery.technology],
          ['Design Capacity', d.battery.design_capacity_mah ? `${d.battery.design_capacity_mah} mAh` : '—'],
          ['Time Remaining', d.battery.remaining ? `~${fmtDuration(d.battery.remaining)}` : '—'],
          ['Source', 'pmi8998-fg (/sys/class/power_supply/battery)'],
        ],
      };
    },
  },

  io: {
    label: 'Storage I/O', icon: 'disk', color: 'blue',
    // 大字 = 读 + 写合计；灰字单行分开（同样用紧凑单位，宽度才有上界）
    tile: (d) => ({
      badge: `R ${fmtRateTiny(d.io.read_bps)} W ${fmtRateTiny(d.io.write_bps)}`,
      value: fmtRate(d.io.read_bps + d.io.write_bps),
      bar: { pct: Math.min(100, d.io.util_pct), color: levelColor(d.io.util_pct, 50, 80) },
    }),
    detail: (d) => {
      const r = d.io.read_bps;
      const w = d.io.write_bps;
      const u = d.io.util_pct;
      return {
        title: 'Storage I/O',
        name: 'Storage I/O', icon: 'disk', color: 'blue',
        badge: `${u.toFixed(1)}% busy`,
        big: fmtRate(r + w),
        status: statusWord(u >= 80 ? 'critical' : u >= 50 ? 'elevated' : 'normal', {
          normal: 'Disk is keeping up', elevated: 'Disk is busy', critical: 'Disk is saturated',
        }),
        // 序列单位是 KB/s（后端已除以 1024）
        chart: {
          lines: [{ key: 'io_r', color: 'blue' }, { key: 'io_w', color: 'purple' }],
          fromZero: true,
          minSpan: 10,
          format: (x) => fmtKBps(x),
        },
        stats: false,
        averages: (series) => {
          const rd = series.io_r || [];
          const wr = series.io_w || [];
          const peak = Math.max(...rd.map((v, i) => (Number(v) || 0) + (Number(wr[i]) || 0)));
          return [
            ['Avg Read (5 min)', fmtKBps(avg(rd))],
            ['Avg Write (5 min)', fmtKBps(avg(wr))],
            ['Peak Total (5 min)', fmtKBps(Number.isFinite(peak) ? peak : 0)],
          ];
        },
        info: () => [
          ['Device', `${d.io.device} · ${d.io.model}`],
          ['Read Now', fmtRate(r)],
          ['Write Now', fmtRate(w)],
          ['IOPS', `${d.io.read_iops.toFixed(1)} read · ${d.io.write_iops.toFixed(1)} write`],
          ['Busy', `${u.toFixed(1)}%`],
          ['Read (total)', fmtBytes(d.io.read_total)],
          ['Written (total)', fmtBytes(d.io.write_total)],
        ],
        legend: [
          { color: 'blue', text: 'Read' },
          { color: 'purple', text: 'Write' },
        ],
      };
    },
  },

  netq: {
    label: 'Link Quality', icon: 'wifi', color: 'cyan',
    // 大字 = TCP 重传率（重传段数 / 发出段数），这是判断链路好坏最直接的量；
    // 灰字给丢包数。bar 按 5% 为满格缩放（日常 <1%，不缩放就永远是一条空条）
    tile: (d) => ({
      badge: `${d.netq.rx_dropped + d.netq.tx_dropped} drop`,
      value: `${d.netq.retx_pct.toFixed(2)}%`,
      bar: {
        pct: Math.min(100, d.netq.retx_pct * 20),
        color: levelColor(d.netq.retx_pct, 1, 3),
      },
    }),
    detail: (d) => {
      const r = d.netq.retx_pct;
      return {
        title: 'Network Quality',
        name: 'Network Quality', icon: 'wifi', color: 'cyan',
        badge: d.netq.iface,
        big: `${r.toFixed(2)}%`,
        status: statusWord(r >= 3 ? 'critical' : r >= 1 ? 'elevated' : 'normal', {
          normal: 'Link looks healthy',
          elevated: 'Elevated retransmission',
          critical: 'Heavy retransmission',
        }),
        chart: {
          lines: [{ key: 'retx', color: 'purple' }],
          fromZero: true,
          minSpan: 1,
          format: (x) => `${x.toFixed(2)}%`,
        },
        info: () => [
          ['Interface', d.netq.iface],
          ['TCP Connections', String(d.netq.curr_estab)],
          ['Retransmitted (total)', String(d.netq.retrans_total)],
          ['RX Dropped', String(d.netq.rx_dropped)],
          ['RX Errors', `${d.netq.rx_errors} (CRC ${d.netq.rx_crc_errors})`],
          ['TX Dropped / Errors', `${d.netq.tx_dropped} / ${d.netq.tx_errors}`],
          ['Inbound Errors', String(d.netq.in_errs)],
          ['Link Drops', `${d.netq.link_down} (${d.netq.link_changes} changes)`],
        ],
      };
    },
  },

  system: {
    label: 'System Load', icon: 'activity', color: 'indigo',
    tile: (d) => ({
      badge: `${d.cpu.processes} procs`,
      value: d.system.load.load1.toFixed(2),
      bar: {
        pct: Math.min(100, (d.system.load.load1 / Math.max(1, d.device.cores)) * 100),
        color: COLORS.indigo,
      },
    }),
    detail: (d) => ({
      title: 'System',
      name: 'System Load', icon: 'activity', color: 'indigo',
      badge: `${d.device.cores} cores`,
      big: d.system.load.load1.toFixed(2),
      status: statusWord(
        d.system.load.load1 / d.device.cores > 1 ? 'critical'
          : d.system.load.load1 / d.device.cores > 0.6 ? 'elevated' : 'normal',
        { normal: 'All systems nominal', elevated: 'System is busy', critical: 'Overloaded' }),
      chart: {
        lines: [{ key: 'load', color: 'indigo' }],
        fromZero: true,
        minSpan: 1,
        format: (x) => x.toFixed(2),
      },
      info: () => [
        ['Hostname', d.device.hostname],
        ['OS', d.device.os],
        ['Kernel', d.device.kernel],
        ['Architecture', d.device.arch],
        ['Uptime', fmtDuration(d.device.uptime)],
        ['Services / Processes', `${d.system.services} / ${d.system.processes}`],
        ['Load 1m / 5m / 15m', `${d.system.load.load1.toFixed(2)} • ${d.system.load.load5.toFixed(2)} • ${d.system.load.load15.toFixed(2)}`],
        ['Pressure cpu / io / mem',
          `${((d.system.pressure.cpu || {}).avg60 || 0).toFixed(1)} / ${((d.system.pressure.io || {}).avg60 || 0).toFixed(2)} / ${((d.system.pressure.memory || {}).avg60 || 0).toFixed(2)}`],
      ],
      processes: d.system.top,
    }),
  },
};

// power 已于 2026-09-14 合并进 battery（同一份数据源、详情页字段重复）
const TILE_ORDER = ['cpu', 'temp', 'memory', 'disk', 'io', 'traffic', 'netq', 'battery', 'system'];

/* ------------------------------------------------------------------ 状态 */
let DATA = null;
let failures = 0;
let refreshMs = 1000;
let currentDetail = null;
let tileRefs = {};
const chartCards = {};   // detail 内的图表实例

/* -------------------------------------------------------------- 首页渲染 */
function buildHome() {
  const grid = $('#tileGrid');
  grid.innerHTML = '';
  tileRefs = {};
  for (const id of TILE_ORDER) {
    const m = METRICS[id];
    const tile = h('button', 'tile');
    tile.type = 'button';
    tile.innerHTML = `
      <div class="row">
        <span class="icon c-${m.color}">${ICONS[m.icon]}</span>
        <span class="badge"></span>
      </div>
      <div class="name">${m.label}</div>
      <div class="value">—</div>
      <div class="bar"><i></i></div>`;
    tile.addEventListener('click', () => openDetail(id));
    grid.appendChild(tile);
    tileRefs[id] = {
      badge: $('.badge', tile),
      value: $('.value', tile),
      fill: $('.bar > i', tile),
    };
  }

  $('#btnSettings').innerHTML = ICONS.gear;
  $('#btnAlerts').innerHTML = ICONS.bell;
  $('#btnHistory').innerHTML = ICONS.chart;
  $('#btnExport').innerHTML = ICONS.folder;
  $('#btnRefresh').innerHTML = ICONS.refresh;
  $('#lblUptime').innerHTML = `${ICONS.clock.replace('width="22" height="22"', 'width="15" height="15"')}<span>Uptime</span>`;
  $('#lblServices').innerHTML = `${ICONS.layers.replace('width="22" height="22"', 'width="15" height="15"')}<span>Services</span>`;
  $('#lblIp').innerHTML = `${ICONS.globe.replace('width="22" height="22"', 'width="15" height="15"')}<span>IP</span>`;
}

function overallHealth(d) {
  const temp = d.thermal.soc ?? 0;
  const bad = [];
  const warn = [];
  if (temp >= d.thermal.critical) bad.push('Temp');
  else if (temp >= d.thermal.warning) warn.push('Temp');
  if (d.cpu.total >= 95) bad.push('CPU');
  else if (d.cpu.total >= 80) warn.push('CPU');
  if (d.memory.percent >= 90) bad.push('Memory');
  else if (d.memory.percent >= 70) warn.push('Memory');
  if (d.disk.root.percent >= 92) bad.push('Disk');
  else if (d.disk.root.percent >= 80) warn.push('Disk');
  if (d.battery.present && d.battery.capacity <= 20 && !d.battery.charging) bad.push('Battery');
  if (bad.length) return { cls: 'bad', text: `Issue: ${bad.join(', ')}` };
  if (warn.length) return { cls: 'warn', text: `Warning: ${warn.join(', ')}` };
  return { cls: '', text: 'Healthy' };
}

function updateHome() {
  const d = DATA;
  if (!d) return;

  $('#devName').textContent = d.device.hostname || 'device';
  const model = d.device.model || '';
  $('#devModel').textContent = /lg|joan/i.test(model) ? 'LG V30' : model;

  const hl = overallHealth(d);
  const badge = $('#devHealth');
  badge.className = `health ${hl.cls}`;
  badge.innerHTML = `${hl.cls ? ICONS.alert : ICONS.check}<span>${hl.text}</span>`;

  const conn = $('#devConn');
  conn.className = `conn${failures ? ' off' : ''}`;
  conn.innerHTML = `${ICONS.wifi.replace('width="22" height="22"', 'width="17" height="17"')}<span>${failures ? 'Reconnecting…' : 'Local Connection'}</span>`;

  $('#valUptime').textContent = fmtDuration(d.device.uptime);
  $('#valServices').textContent = String(d.device.services || 0);
  $('#valIp').textContent = d.device.ip || '—';

  for (const id of TILE_ORDER) {
    const ref = tileRefs[id];
    if (!ref) continue;
    // 每块磁贴单独兜底：任何一个指标算错（比如引用了不存在的函数）都只影响它自己，
    // 不会让后面的磁贴全部停在初始的"—"上（那种"静默半死"很难查）。
    try {
      const t = METRICS[id].tile(d);
      ref.badge.textContent = t.badge;
      ref.value.textContent = t.value;
      ref.fill.style.width = `${Math.max(0, Math.min(100, t.bar.pct))}%`;
      ref.fill.style.background = t.bar.color;
    } catch (err) {
      console.warn(`tile render failed: ${id}`, err);
      ref.value.textContent = '—';
    }
  }
}

/* -------------------------------------------------------------- 详情页 */
function openDetail(id) {
  if (!DATA) return;
  const m = METRICS[id];
  const spec = m.detail(DATA, DATA.series);

  const view = $('#detail');
  view.innerHTML = '';
  const bar = h('div', 'detail-bar');
  bar.innerHTML =
    `<button class="round" id="dGear">${ICONS.gear}</button>` +
    `<h2>${spec.title}</h2>` +
    `<button class="round" id="dClose">${ICONS.close}</button>`;
  view.appendChild(bar);

  const body = h('div', 'detail-body');
  const head = h('div', 'metric-head');
  head.innerHTML =
    `<div class="name"><span class="icon c-${spec.color}">${ICONS[spec.icon]}</span>${spec.name}</div>` +
    `<span class="pill-badge">${spec.badge}</span>`;
  body.appendChild(head);

  body.appendChild(h('p', 'big-value', spec.big));
  const statusEl = h('p', 'status-line', spec.status.text);
  body.appendChild(statusEl);
  const updatedEl = h('p', 'updated', `Updated: ${clockTime(DATA.now)}`);
  body.appendChild(updatedEl);

  // 主图表
  const chartCard = h('div', 'chart-card');
  chartCard.style.background = chartBg(spec.color);
  body.appendChild(chartCard);

  // 图例要紧跟主图 —— 放在第二张图后面会被隔开，读到图例时已经不知道它指哪张图了
  if (spec.legend) {
    const lg = h('div', 'chart-axis');
    lg.style.justifyContent = 'flex-start';
    lg.style.gap = '14px';
    lg.innerHTML = spec.legend.map((l) =>
      `<span style="display:inline-flex;align-items:center;gap:5px">
        <i style="width:8px;height:8px;border-radius:9px;background:${COLORS[l.color]};display:inline-block"></i>${l.text}</span>`
    ).join('');
    body.appendChild(lg);
  }

  // 第二张图（可选）：比如 Battery 页的电流。mA 和 W 差两个数量级，
  // 不能和功率挤在一张图里，所以单独一张矮图，排在图例之后。
  if (spec.miniChart) {
    body.appendChild(h('div', 'sub-title', spec.miniChart.title));
    const extraCard = h('div', 'chart-card');
    extraCard.style.background = chartBg(spec.miniChart.lines[0].color);
    body.appendChild(extraCard);
    chartCards.extra = createChart(extraCard, { height: 96 });
  }

  const infoCard = h('div', 'info-card');
  body.appendChild(infoCard);

  // CPU 各核心
  if (spec.cores) {
    body.appendChild(h('div', 'sub-title', 'CPU Cores'));
    const grid = h('div', 'grid cores');
    spec.cores.forEach((core) => {
      const card = h('div', 'core-card');
      card.innerHTML =
        `<div class="k">CPU${core.index} <span style="color:var(--muted);font-size:13px">${core.max_mhz ? (core.max_mhz / 1000).toFixed(1) + 'G' : ''}</span></div>` +
        `<div class="v" data-usage>—</div>`;
      const miniHost = h('div');
      miniHost.style.height = '34px';
      card.appendChild(miniHost);
      grid.appendChild(card);
      card._mini = createChart(miniHost, { height: 34, mini: true });
      // 只记**核心序号**，不缓存 core 对象本身：对象里带 usage，
      // 缓存下来就永远是打开页面那一刻的占用率（数字不动、小图却在动）。
      card.dataset.core = String(core.index);
    });
    body.appendChild(grid);
  }

  // 温度传感器分区
  if (spec.zones) {
    body.appendChild(h('div', 'sub-title', 'Thermal Zones'));
    const grid = h('div', 'grid');
    for (const z of spec.zones) {
      const card = h('div', 'core-card');
      card.innerHTML =
        `<div class="k" style="font-size:13px;color:var(--muted)">${z.type}</div>` +
        `<div class="v" data-temp>${z.celsius.toFixed(1)}°C</div>`;
      card._zone = z;
      grid.appendChild(card);
    }
    body.appendChild(grid);
  }

  // 进程 Top5
  if (spec.processes) {
    body.appendChild(h('div', 'sub-title', 'Top Processes'));
    const card = h('div', 'info-card');
    card.dataset.proc = '1';
    body.appendChild(card);
  }

  view.appendChild(body);
  chartCards.main = createChart(chartCard, { height: 168 });

  $('#dClose', view).addEventListener('click', closeDetail);
  $('#dGear', view).addEventListener('click', openSettings);

  currentDetail = { id, spec, view, body, statusEl, updatedEl, infoCard, chartCard };
  updateDetail();

  view.setAttribute('aria-hidden', 'false');
  if (!history.state || !history.state.detail) history.pushState({ detail: id }, '');
  requestAnimationFrame(() => {
    view.classList.add('open');
    $('#home').classList.add('pushed');
  });
}

function closeDetail(fromPop) {
  const view = $('#detail');
  view.classList.remove('open');
  $('#home').classList.remove('pushed');
  view.setAttribute('aria-hidden', 'true');
  currentDetail = null;
  chartCards.main = null;
  Object.keys(chartCards).forEach((k) => { if (k !== 'main') delete chartCards[k]; });
  if (!fromPop && history.state && history.state.detail) history.back();
}

function chartBg(color) {
  const hex = COLORS[color] || COLORS.blue;
  return `linear-gradient(180deg, ${hex}2B 0%, ${hex}16 52%, ${hex}0A 100%)`;
}

function updateDetail() {
  if (!currentDetail || !DATA) return;
  // 注意：这里**一律只用 fresh**（本次重算出来的），不要用 currentDetail.spec ——
  // 那是打开页面那一刻的快照，用它渲染就是"数字永不动、只有图在动"。
  const fresh = METRICS[currentDetail.id].detail(DATA, DATA.series);

  currentDetail.statusEl.textContent = fresh.status.text;
  currentDetail.statusEl.className =
    `status-line c-${fresh.status.level === 'normal' ? 'green' : fresh.status.level === 'elevated' ? 'yellow' : 'red'}`;
  // 带秒：HH:MM 一分钟才变一次，看不出"还在刷新"
  currentDetail.updatedEl.textContent = `Updated: ${clockSec(DATA.now)}`;

  $('.big-value', currentDetail.body).textContent = fresh.big;
  $('.metric-head .pill-badge', currentDetail.body).textContent = fresh.badge;

  const meta = { now: DATA.now, interval: DATA.interval || 1 };
  currentDetail.chartCard.style.background = chartBg(fresh.chart.lines[0].color);
  drawChart(chartCards.main, fresh.chart, DATA.series, meta);
  if (chartCards.extra && fresh.miniChart) {
    drawChart(chartCards.extra, fresh.miniChart, DATA.series, meta);
  }

  // 信息卡：阈值 + 5 分钟统计 + 指标专属行
  //   stats === false 的页面（电池 / 功率）不显示「最高 / 平均电量」，
  //   改用 averages() 给出的 5 分钟平均充放电电流与功率。
  const key = fresh.chart.lines[0].key;
  const values = (DATA.series[key] || []).map(Number);
  const rows = [];
  if (fresh.stats !== false && values.length) {
    rows.push(['Highest in Last 5 Minutes', fresh.chart.format(Math.max(...values))]);
    rows.push(['Average in Last 5 Minutes', fresh.chart.format(avg(values))]);
  }
  if (fresh.averages) rows.push(...fresh.averages(DATA.series));
  rows.push(...fresh.info());
  currentDetail.infoCard.innerHTML = rows.map(([k, v]) =>
    `<div class="row"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');

  // 核心小图 + 占用率：数值一律从**本次 fresh** 取，不读创建时缓存的对象
  currentDetail.body.querySelectorAll('.core-card[data-core]').forEach((card) => {
    if (card._mini) {
      const index = Number(card.dataset.core);
      const c = (fresh.cores || []).find((x) => x.index === index);
      if (!c) return;
      $('[data-usage]', card).textContent = `${c.usage.toFixed(0)}%`;
      const vals = DATA.series[`core${c.index}`] || [];
      card._mini.host.style.height = '34px';
      drawChart(card._mini, {
        lines: [{ key: `core${c.index}`, color: 'blue' }],
        domain: [0, 100],
        dashes: [],
        format: (x) => `${x.toFixed(0)}%`,
      }, { [`core${c.index}`]: vals }, meta);
    }
  });

  // 温度分区
  if (fresh.zones) {
    const zoneEls = currentDetail.body.querySelectorAll('[data-temp]');
    zoneEls.forEach((el, i) => {
      const z = fresh.zones[i];
      if (z) el.textContent = `${z.celsius.toFixed(1)}°C`;
    });
  }

  // 进程列表（同样要用 fresh：用 spec 会停在打开页面那一刻）
  if (fresh.processes) {
    const card = currentDetail.body.querySelector('[data-proc]');
    if (card) {
      card.innerHTML = fresh.processes.length
        ? fresh.processes.map((p) =>
            `<div class="row proc-row"><div class="k n">${p.name} <span style="opacity:.55">#${p.pid}</span></div><div class="v">${p.cpu.toFixed(1)}%</div></div>`
          ).join('')
        : '<div class="row"><div class="k">No active processes sampled</div><div class="v">—</div></div>';
    }
  }
}

/* ------------------------------------------------------------------ 弹层 */
function openSheet(title, build) {
  const sheet = $('#sheet');
  sheet.innerHTML = `<div class="grabber"></div><h3>${title}</h3>`;
  build(sheet);
  $('#sheetMask').classList.add('open');
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function closeSheet() {
  $('#sheet').classList.remove('open');
  $('#sheetMask').classList.remove('open');
}

function openSettings() {
  openSheet('Settings', (sheet) => {
    if (!DATA) return;
    const d = DATA;
    const seg = h('div', 'seg');
    [[1000, '1 s'], [2000, '2 s'], [5000, '5 s']].forEach(([ms, label]) => {
      const b = h('button', refreshMs === ms ? 'on' : '', label);
      b.addEventListener('click', () => {
        refreshMs = ms;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
      });
      seg.appendChild(b);
    });
    const lbl = h('p', '', 'Refresh interval');
    lbl.style.cssText = 'color:var(--muted);font-size:15px;margin:0 2px 8px';
    sheet.appendChild(lbl);
    sheet.appendChild(seg);

    const card = h('div', 'info-card');
    card.innerHTML = [
      ['Hostname', d.device.hostname],
      ['Model', d.device.model],
      ['OS', d.device.os],
      ['Kernel', d.device.kernel],
      ['Architecture', d.device.arch],
      ['Cores', `${d.device.cores}`],
      ['Address', location.origin + location.pathname],
      // 环形缓冲区容量 = 每根折线能画的时长。后端每秒采一点、保留最近 N 点，
      // 所以 N × interval 就是图表的历史窗口（当前 300 × 1s = 5 分钟）。
      ['History Window', `${(((DATA.interval || 1) * Math.max(...Object.values(d.history_len || { x: 0 })) / 60)).toFixed(1)} min · ${Math.max(...Object.values(d.history_len || { x: 0 }))} samples`],
    ].map(([k, v]) => `<div class="row"><div class="k">${k}</div><div class="v small">${v}</div></div>`).join('');
    sheet.appendChild(card);
  });
}

function openAlerts() {
  openSheet('Alerts', (sheet) => {
    const d = DATA;
    if (!d) return;
    const items = [];
    const push = (lvl, text) => items.push({ lvl, text });
    const t = d.thermal.soc ?? 0;
    if (t >= d.thermal.critical) push('critical', `SoC temp ${t.toFixed(0)}°C ≥ ${d.thermal.critical}°C`);
    else if (t >= d.thermal.warning) push('elevated', `SoC temp ${t.toFixed(0)}°C ≥ ${d.thermal.warning}°C`);
    if (d.cpu.total >= 95) push('critical', `CPU load ${d.cpu.total.toFixed(0)}%`);
    else if (d.cpu.total >= 80) push('elevated', `CPU load ${d.cpu.total.toFixed(0)}%`);
    if (d.memory.percent >= 90) push('critical', `Memory used ${d.memory.percent.toFixed(0)}%`);
    else if (d.memory.percent >= 70) push('elevated', `Memory used ${d.memory.percent.toFixed(0)}%`);
    if (d.disk.root.percent >= 92) push('critical', `Root used ${d.disk.root.percent.toFixed(0)}%`);
    else if (d.disk.root.percent >= 80) push('elevated', `Root used ${d.disk.root.percent.toFixed(0)}%`);
    if (d.battery.present && d.battery.capacity <= 20 && !d.battery.charging) push('critical', `Battery ${d.battery.capacity}%`);
    else if (d.battery.present && d.battery.capacity <= 40 && !d.battery.charging) push('elevated', `Battery ${d.battery.capacity}%`);
    if (d.battery.temp != null && d.battery.temp >= 45) push('elevated', `Battery temp ${d.battery.temp.toFixed(1)}°C`);

    if (!items.length) {
      sheet.appendChild(h('div', 'info-card',
        '<div class="row"><div class="k">All clear</div><div class="v">No threshold is currently breached</div></div>'));
      return;
    }
    const card = h('div', 'info-card');
    card.innerHTML = items.map((it) => {
      const c = it.lvl === 'critical' ? 'red' : 'yellow';
      return `<div class="row proc-row"><div class="k n"><span class="icon c-${c}" style="display:inline-flex;vertical-align:-4px;margin-right:6px">${ICONS.alert}</span>${it.text}</div></div>`;
    }).join('');
    sheet.appendChild(card);
  });
}

function openHistory() {
  openSheet('5-Minute Stats', (sheet) => {
    const d = DATA;
    if (!d) return;
    const card = h('div', 'info-card');
    // 第 4 个元素 = 是否取绝对值。充放电功率/电流只给量级，
    // 方向由详情页的文字标注（输入/输出），这里不带正负号。
    const rowsFor = [
      ['CPU Load', 'cpu', (x) => `${x.toFixed(0)}%`],
      ['Temperature', 'temp', (x) => `${x.toFixed(1)}°C`],
      ['Memory', 'mem', (x) => `${x.toFixed(0)}%`],
      ['Disk', 'disk', (x) => `${x.toFixed(1)}%`],
      ['Download', 'rx', (x) => fmtKBps(x)],
      ['Upload', 'tx', (x) => fmtKBps(x)],
      // 整机功耗（插电时 = 输入 − 充入电池，放电时 = 电池输出）；**不是** SoC/Core 功耗
      ['System Power', 'power', (x) => `${x.toFixed(2)} W`, true],
      // 电池端 V × I：放电时和整机基本相等，插电时可能小到接近 0
      ['Battery Power', 'batt_pow', (x) => `${x.toFixed(2)} W`, true],
      // 5 分钟电量最高/平均没有参考价值，改成充放电电流的量级
      ['Battery Current', 'batt_cur', (x) => `${x.toFixed(0)} mA`, true],
      ['Load 1m', 'load', (x) => x.toFixed(2)],
    ];
    card.innerHTML = rowsFor.map(([label, key, fmt, abs]) => {
      let v = (d.series[key] || []).map(Number);
      if (abs) v = v.map(Math.abs);
      const span = v.length > 1
        ? `${fmt(Math.min(...v))} – ${fmt(Math.max(...v))}`
        : '—';
      const mean = v.length ? (abs ? avgMag(v) : avg(v)) : null;
      return `<div class="row"><div class="k">${label}</div><div class="v">${span} <span style="color:var(--muted);font-weight:500">· avg ${mean === null ? '—' : fmt(mean)}</span></div></div>`;
    }).join('');
    sheet.appendChild(card);
  });
}

function exportJSON() {
  if (!DATA) return;
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `v30-telemetry-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ------------------------------------------------------------------ 轮询 */
let pollTimer = null;

function schedule() {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, refreshMs);
}

async function poll() {
  clearTimeout(pollTimer);
  try {
    const res = await fetch('api/state', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    DATA = json;
    failures = 0;
    $('#offline').classList.remove('show');
    updateHome();
    updateDetail();
  } catch (err) {
    failures++;
    if (failures >= 2) $('#offline').classList.add('show');
  } finally {
    schedule();
  }
}

/* ------------------------------------------------------------------ 启动 */
function boot() {
  buildHome();

  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnAlerts').addEventListener('click', openAlerts);
  $('#btnHistory').addEventListener('click', openHistory);
  $('#btnExport').addEventListener('click', exportJSON);
  $('#btnRefresh').addEventListener('click', poll);
  $('#sheetMask').addEventListener('click', closeSheet);

  window.addEventListener('resize', () => {
    if (currentDetail) updateDetail();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });
  history.replaceState({ v: 'home' }, '');
  window.addEventListener('popstate', () => { if (currentDetail) closeDetail(true); });

  poll();

  // 支持 #cpu / #temp / #system 这类深链，直接打开对应详情页。
  // power 已合并进 battery，旧链接做个转发免得失效。
  const LEGACY_DEEP = { power: 'battery' };
  const raw = (location.hash || '').replace('#', '');
  const deep = LEGACY_DEEP[raw] || raw;
  if (deep && METRICS[deep]) {
    const wait = setInterval(() => {
      if (DATA) { clearInterval(wait); openDetail(deep); }
    }, 120);
  }
}

document.addEventListener('DOMContentLoaded', boot);
