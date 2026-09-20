/**
 * v30 Monitor 前端端到端验证（用本机 Edge + playwright-core）
 *
 * 关键点：这里的滚动测试发的是**真实输入事件**（滚轮 / 触摸手势），
 * 而不是 window.scrollTo()。之前的教训是 scrollTo 能成功但用户手动滚不动，
 * 只看 scrollTo 会得出完全错误的结论。
 *
 * 页面资源全部用 page.route 从磁盘喂进去，不依赖任何本地 HTTP 服务
 * （沙箱里 node 的网络 namespace 和 python/curl 是隔开的，起 mock 连不通）。
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STATIC = path.join(ROOT, 'static');
// 数据源的优先级：STATE 环境变量 > 本机真机快照（不在仓库里）> 随仓库分发的脱敏样例
const STATE_LOCAL = path.join(ROOT, '.workbuddy', 'state.json');
const STATE = process.env.STATE
  ? path.resolve(process.env.STATE)
  : (fs.existsSync(STATE_LOCAL) ? STATE_LOCAL : path.join(HERE, 'state.sample.json'));
const OUT = path.join(HERE, 'shots');
const BIG = path.join(HERE, '.tmp');

fs.mkdirSync(path.join(BIG, 'home'), { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
process.env.HOME = path.join(BIG, 'home');
process.env.TMPDIR = BIG;
process.env.XDG_RUNTIME_DIR = BIG;

const ORIGIN = 'http://v30-monitor.test';
const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.js': 'application/javascript; charset=utf-8', '.json': 'application/json' };

/**
 * advance = true 时，每次 /api/state 都把 now 往前推一个采样间隔、所有序列左移一格，
 * 模拟真机"每秒采一个新点" —— 只有这样才能复现"选中的点被新数据冲掉/弹回最新"。
 */
let apiHits = 0;   // /api/state 被请求了多少次（用来证明"期间确实有新数据"）

async function routeAll(page, { advance = false } = {}) {
  let state = advance ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : null;
  let tick = 0;
  // 服务刚重启时每个序列只有几个点，钉住的样本几秒后就滚出窗口了（那是正确行为，
  // 但测不出"不回弹"）。这里把历史回填到 120 点，让用例与设备运行时长无关。
  if (advance && state) {
    const series = {};
    for (const [k, arr] of Object.entries(state.series || {})) {
      if (!Array.isArray(arr) || !arr.length) { series[k] = arr; continue; }
      const pad = [];
      while (arr.length + pad.length < 120) pad.push(arr[0]);
      series[k] = pad.concat(arr);
    }
    state.series = series;
  }
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/state') {
      apiHits++;
      if (advance) {
        const iv = state.interval || 1;
        state.now = state.now + iv;
        const series = {};
        for (const [k, arr] of Object.entries(state.series || {})) {
          if (!Array.isArray(arr) || !arr.length) { series[k] = arr; continue; }
          const next = arr.slice(1);
          const last = Number(arr[arr.length - 1]) || 0;
          next.push(last + ((tick * 13) % 7) - 3);
          series[k] = next;
        }
        state.series = series;
        // 逐核占用率来自 d.cpu.cores（不是 series），也要动起来，
        // 否则测不出"数字是打开页面那一刻的快照"这个 bug。
        // 用「tick 的确定性函数」而不是"在原值上抖动"：后者会被 clamp(0..100) 反复截断，
        // 8 个核还会收敛成同一个值，两次读数撞上同一拍就成了间歇性假失败。
        if (Array.isArray(state.cpu?.cores)) {
          state.cpu.cores = state.cpu.cores.map((c, i) => ({
            ...c,
            usage: (tick * 17 + i * 11) % 61,
          }));
        }
        tick++;
      }
      return route.fulfill({ status: 200, contentType: MIME['.json'],
                             body: advance ? JSON.stringify(state) : fs.readFileSync(STATE, 'utf8') });
    }
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\//, '');
    const full = path.join(STATIC, rel);
    if (!fs.existsSync(full)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200,
                           contentType: MIME[path.extname(full)] || 'application/octet-stream',
                           body: fs.readFileSync(full) });
  });
}

// 读页面上算好的状态快照
const probe = () => ({
  scrollY: window.scrollY,
  htmlScrollH: document.documentElement.scrollHeight,
  htmlClientH: document.documentElement.clientHeight,
  innerW: window.innerWidth,
  clientW: document.documentElement.clientWidth,
  bodyOverflowY: getComputedStyle(document.body).overflowY,
  appOverflowX: getComputedStyle(document.getElementById('app')).overflowX,
  detailCls: document.getElementById('detail').className,
  homeCls: document.getElementById('home').className,
});

const browser = await chromium.launch({
  executablePath: process.env.EDGE || '/opt/microsoft/msedge/msedge',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
         '--disable-crash-reporter', '--no-first-run', '--disable-extensions'],
});
console.log('Edge version =', browser.version(), '\n');

/* ---------- 1. 手机视口：真实滚轮 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
                                         hasTouch: true, isMobile: true,
                                         deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await routeAll(page);
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 8000 });
  await page.waitForTimeout(600);

  // Traffic 磁贴：大字 = 上下行合计（不带箭头），右上角灰字分两行显示上/下行
  const traffic = await page.evaluate(() => {
    const tile = Array.from(document.querySelectorAll('.tile'))
      .find((t) => t.querySelector('.name').textContent === 'Traffic');
    if (!tile) return null;
    const badge = tile.querySelector('.badge');
    const value = tile.querySelector('.value');
    // 单行高度：同字体样式的探针元素
    const cs = getComputedStyle(badge);
    const p = document.createElement('span');
    p.textContent = 'X';
    p.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;' +
      `font-size:${cs.fontSize};font-family:${cs.fontFamily};font-weight:${cs.fontWeight};letter-spacing:${cs.letterSpacing}`;
    document.body.appendChild(p);
    const oneLine = p.getBoundingClientRect().height;
    p.remove();
    return {
      badgeText: badge.textContent,
      badgeH: Math.round(badge.getBoundingClientRect().height),
      oneLine: Math.round(oneLine),
      valueText: value.textContent.trim(),
      badgeRight: Math.round(badge.getBoundingClientRect().right),
      tileInnerRight: Math.round(tile.getBoundingClientRect().right - 16),
    };
  });
  check('Traffic 大字是合计（不含箭头）',
        !!traffic && !/[↑↓]/.test(traffic.valueText) && /^[\d.]+\s(B|KB|MB)\/s$/.test(traffic.valueText),
        traffic && traffic.valueText);
  check('Traffic 灰字单行且把上下行分开显示',
        !!traffic
        && traffic.badgeText.includes('↑') && traffic.badgeText.includes('↓')
        && !traffic.badgeText.includes('\n')          // 单行
        && traffic.badgeH <= traffic.oneLine * 1.5,   // 渲染出来也是单行
        JSON.stringify(traffic && traffic.badgeText));
  check('Traffic 灰字不超出磁贴',
        !!traffic && traffic.badgeRight <= traffic.tileInnerRight + 1,
        traffic && `右边 ${traffic.badgeRight} <= ${traffic.tileInnerRight}`);

  const base = await page.evaluate(probe);
  console.log('  视口 390x844 | scrollH=%d clientH=%d', base.htmlScrollH, base.htmlClientH);

  check('body 不是滚动容器（overflowY=visible）', base.bodyOverflowY === 'visible', base.bodyOverflowY);
  check('#app overflowX=clip', base.appOverflowX === 'clip', base.appOverflowX);
  check('页面内容高于视口（有得滚）', base.htmlScrollH > base.htmlClientH,
        `${base.htmlScrollH} > ${base.htmlClientH}`);

  // 滚轮落在「设备卡 / 磁贴」区域（用户反馈滚不动的位置）
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  const afterWheel = await page.evaluate(() => window.scrollY);
  check('鼠标滚轮（落在内容区）能滚动', afterWheel > 0, `scrollY=${afterWheel}`);

  // 再滚回顶部后测触摸手势。
  // 注意：CDP 的 Input.synthesizeScrollGesture({gestureSourceType:'touch'}) 在本机
  // Edge 152 上是坏的——在**普通对照页面**上也返回 scrollY=0。所以改用逐帧
  // dispatchTouchEvent 合成真实触摸序列（该方法在对照页上验证过确实能滚）。
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const cdp = await ctx.newCDPSession(page);
  const TX = 195;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: TX, y: 600 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent',
      { type: 'touchMove', touchPoints: [{ x: TX, y: 600 - i * 30 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);
  const afterTouch = await page.evaluate(() => window.scrollY);
  check('触屏拖动（落在内容区）能滚动', afterTouch > 0, `scrollY=${afterTouch}`);

  // 滚动条是否可见：可见时 clientWidth 会小于 innerWidth
  const sb = await page.evaluate(() => ({ i: window.innerWidth, c: document.documentElement.clientWidth }));
  check('视口滚动条已隐藏', sb.i - sb.c === 0, `innerWidth-clientWidth=${sb.i - sb.c}`);

  // 界面文案统一英文：正文 + 所有 title/placeholder 属性都不该出现 CJK
  const cjk = await page.evaluate(() => {
    const hits = [];
    const re = /[一-鿿]+/g;
    const scan = (s) => { const m = (s || '').match(re); if (m) hits.push(...m); };
    scan(document.body.innerText);
    document.querySelectorAll('[title],[placeholder],[aria-label]').forEach((el) => {
      scan(el.getAttribute('title')); scan(el.getAttribute('placeholder')); scan(el.getAttribute('aria-label'));
    });
    return [...new Set(hits)].slice(0, 12);
  });
  check('首页文案全英文（无中英混排）', cjk.length === 0, cjk.join(' / '));

  // 滚回顶部截首屏 + 滚到底截末屏
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'pw-phone-top.png') });
  await page.evaluate(() => window.scrollTo(0, 99999));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'pw-phone-bottom.png') });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  /* ---------- 2. 详情页开合（真实点击） ---------- */
  await page.click('.tile');
  await page.waitForTimeout(700);
  const openState = await page.evaluate(probe);
  check('点磁贴后详情页打开', openState.detailCls.includes('open'),
        `detail="${openState.detailCls}" home="${openState.homeCls}"`);
  await page.screenshot({ path: path.join(OUT, 'pw-detail-open.png') });

  await page.click('#dClose');
  await page.waitForTimeout(800);
  const closedState = await page.evaluate(probe);
  check('关闭后详情页收起', !closedState.detailCls.includes('open'),
        `detail="${closedState.detailCls}" home="${closedState.homeCls}"`);

  const geom = await page.evaluate(() => {
    const d = document.getElementById('detail').getBoundingClientRect();
    const a = document.getElementById('app').getBoundingClientRect();
    return { dLeft: Math.round(d.left), aRight: Math.round(a.right),
             scrollW: document.documentElement.scrollWidth,
             clientW: document.documentElement.clientWidth };
  });
  check('关闭后详情页完全移出屏外', geom.dLeft >= geom.aRight, `detail.left=${geom.dLeft} app.right=${geom.aRight}`);
  check('无横向溢出', geom.scrollW <= geom.clientW, `${geom.scrollW} <= ${geom.clientW}`);
  await page.screenshot({ path: path.join(OUT, 'pw-phone-after-close.png') });

  // 关闭后仍应能滚动
  await page.mouse.move(195, 500);
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(400);
  const afterCloseScroll = await page.evaluate(() => window.scrollY);
  check('返回首页后仍能滚动', afterCloseScroll > 0, `scrollY=${afterCloseScroll}`);

  await ctx.close();
}

/* ---------- 3. 桌面视口 ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await routeAll(page);
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 8000 });
  await page.waitForTimeout(600);

  await page.mouse.move(720, 500);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  const y = await page.evaluate(() => window.scrollY);
  check('桌面 1440x900 滚轮能滚动', y > 0, `scrollY=${y}`);

  const sb = await page.evaluate(() => ({ i: window.innerWidth, c: document.documentElement.clientWidth }));
  check('桌面视口滚动条已隐藏', sb.i - sb.c === 0, `innerWidth-clientWidth=${sb.i - sb.c}`);

  // 桌面下开合详情页，确认没有残留竖条（原始 bug）
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.click('.tile');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'pw-desktop-detail.png') });
  await page.click('#dClose');
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, 'pw-desktop-after-close.png') });
  const g = await page.evaluate(() => {
    const d = document.getElementById('detail').getBoundingClientRect();
    return { left: Math.round(d.left), scrollW: document.documentElement.scrollWidth,
             clientW: document.documentElement.clientWidth };
  });
  check('桌面关闭后无残留 / 无横向溢出', g.scrollW <= g.clientW && g.left >= 1440,
        `detail.left=${g.left} scrollW=${g.scrollW}`);

  // 5 分钟统计面板（整机 / 电池端两行，且都不带正负号）
  await page.click('#btnHistory');
  await page.waitForTimeout(600);
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#sheet .row')).map((r) => ({
      k: r.querySelector('.k')?.textContent.trim(),
      v: r.querySelector('.v')?.textContent.trim(),
    })));
  await page.screenshot({ path: path.join(OUT, 'pw-stats-sheet.png') });
  const power = rows.find((r) => r.k === 'System Power');
  // 只查正负号（U+2212 减号 / ASCII 加号），范围分隔符是 U+2013 短破折号，不算
  const hasSign = (s) => /[+\u2212]/.test(s) || /(^|\s)-\d/.test(s);
  check('统计面板有 System Power 行且不带正负号',
        !!power && !hasSign(power.v), power ? power.v : '(缺)');
  const battPow = rows.find((r) => r.k === 'Battery Power');
  check('统计面板有 Battery Power 行且不带正负号',
        !!battPow && !hasSign(battPow.v), battPow ? battPow.v : '(缺)');
  const cur = rows.find((r) => r.k === 'Battery Current');
  check('统计面板有 Battery Current 行', !!cur, cur ? cur.v : '(缺)');

  await ctx.close();
}

/* ---------- 4. 图表选点：钉住后不回弹（数据持续推进 + 真实触摸点按） ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
                                         hasTouch: true, isMobile: true,
                                         deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await routeAll(page, { advance: true });
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 8000 });
  await page.waitForTimeout(600);

  const cdp = await ctx.newCDPSession(page);
  const tap = async (x, y) => {
    await cdp.send('Input.dispatchTouchEvent',
      { type: 'touchStart', touchPoints: [{ x, y }] });
    await page.waitForTimeout(40);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  const snap = () => page.evaluate(() => {
    const t = document.querySelector('.chart-tip');
    const card = document.querySelector('.chart-card');
    return {
      time: t?.querySelector('span')?.textContent.trim() || '',
      value: t?.querySelector('b')?.textContent.trim() || '',
      pinned: !!t?.classList.contains('pinned'),
      liveBtn: !!t?.querySelector('.tip-live'),
      updated: document.querySelector('.updated')?.textContent.trim() || '',
      // 气泡的水平位置 —— 比文字更可靠：HH:MM 在同一分钟内不会变
      left: parseFloat(t?.style.left || '0'),
      cardW: card?.getBoundingClientRect().width || 0,
    };
  });

  await page.click('.tile');                    // 打开第一个详情（CPU），主图表可交互
  await page.waitForTimeout(900);
  const box = await page.locator('.chart-card .chart-svg').first().boundingBox();
  const tapX = box.x + box.width * 0.35;
  const tapY = box.y + box.height / 2;

  const before = await snap();
  const hits0 = apiHits;
  await tap(tapX, tapY);
  await page.waitForTimeout(250);
  const pinned1 = await snap();
  check('点选图表后进入钉住状态', pinned1.pinned && pinned1.liveBtn,
        `pinned=${pinned1.pinned} live=${pinned1.liveBtn}`);
  check('钉住的是更早的样本，不是最新点',
        pinned1.time !== before.time && pinned1.left < pinned1.cardW * 0.6,
        `选中 ${pinned1.time} @${pinned1.left.toFixed(0)}px / 最新 ${before.time} @${before.left.toFixed(0)}px`);

  // 关键：等 3 秒（3 次轮询、数据已滚动）后，选中的点必须还在原地
  await page.waitForTimeout(3000);
  const pinned2 = await snap();
  // 注意：钉住的样本会随新数据进来自然地往左漂（真机 n=300 时约 1 px/s，
  // 本快照只有 62 点所以漂得明显）。判据是「时刻 + 数值不变、且不跳回最右端」，
  // 不是「像素一格不动」。
  check('新数据进来后选中的点不回弹',
        pinned2.time === pinned1.time && pinned2.value === pinned1.value &&
        Math.abs(pinned2.left - pinned1.left) <= pinned2.cardW * 0.1 &&
        pinned2.left < pinned2.cardW * 0.6,
        `${pinned1.time} ${pinned1.value} @${pinned1.left.toFixed(0)} -> ` +
        `${pinned2.time} ${pinned2.value} @${pinned2.left.toFixed(0)}`);
  check('期间确实有新数据到达（页面在刷新）', apiHits - hits0 >= 2,
        `${apiHits - hits0} 次 /api/state`);

  // 手指抬起 = pointerleave，不应该解除钉住（这是原来"点一下就弹回"的根因）
  check('手指抬起后仍然保持钉住', pinned2.pinned, `pinned=${pinned2.pinned}`);

  await page.screenshot({ path: path.join(OUT, 'pw-chart-pinned.png') });

  // 点 Live 按钮 → 回到实时
  const btn = await page.locator('.chart-tip .tip-live').boundingBox();
  await tap(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.waitForTimeout(400);
  const live = await snap();
  check('点 Live 后回到实时（不再钉住）', !live.pinned && !live.liveBtn,
        `pinned=${live.pinned} time=${live.time}`);
  check('回到实时后气泡回到最右端', live.left > live.cardW * 0.85,
        `left=${live.left.toFixed(0)} / 卡宽 ${live.cardW.toFixed(0)}`);
  await page.screenshot({ path: path.join(OUT, 'pw-chart-live.png') });

  // 逐核占用率必须跟着刷新走。以前把打开页面那一刻的 core 对象缓存到 card._core 上，
  // 于是小图在动、百分比数字永远不动。
  const usages = () => page.evaluate(() => Array.from(
    document.querySelectorAll('.core-card[data-core] [data-usage]')).map((e) => e.textContent.trim()));
  const u0 = await usages();
  await page.waitForTimeout(2500);
  const u1 = await usages();
  check('CPU 详情页有逐核占用率', u0.length > 0, u0.join(' '));
  check('逐核占用率随刷新更新（不是打开时的快照）', u0.length > 0 && u1.join() !== u0.join(),
        `${u0.join(' ')} -> ${u1.join(' ')}`);

  await ctx.close();
}

/* ---------- 5. 新增监测项（存储 I/O / 链路质量 / WiFi / 充电 / Zram / IIO 温度） ---------- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
                                         hasTouch: true, isMobile: true,
                                         deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await routeAll(page);
  await page.goto(ORIGIN + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 8000 });
  await page.waitForTimeout(500);

  const tileNames = () => page.evaluate(() =>
    Array.from(document.querySelectorAll('.tile .name')).map((e) => e.textContent.trim()));
  const names = await tileNames();
  check('首页 9 块磁贴（Power Draw 已合并进 Battery）',
        names.length === 9 && !names.includes('Power Draw'), names.join(' / '));
  check('首页有 Storage I/O 与 Link Quality',
        names.includes('Storage I/O') && names.includes('Link Quality'), names.join(' / '));

  const rows = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#detail .info-card .row')).map((r) => ({
      k: r.querySelector('.k')?.textContent.trim(),
      v: r.querySelector('.v')?.textContent.trim(),
    })));
  const zoneText = () => page.evaluate(() => Array.from(
    document.querySelectorAll('#detail .core-card')).map((e) => e.textContent.trim()).join(' | '));

  const openTile = async (idx) => {
    await page.locator('.tile').nth(idx).click();
    await page.waitForTimeout(650);
    const title = await page.evaluate(() =>
      document.querySelector('#detail .detail-bar h2')?.textContent.trim() || '');
    return title;
  };
  const closeTile = async () => {
    await page.click('#dClose');
    await page.waitForTimeout(650);
  };
  const findRow = (list, key) => list.find((r) => r.k === key);

  // 4=io, 5=traffic, 6=netq, 7=battery, 1=temp, 2=memory（见 TILE_ORDER）
  const ioTitle = await openTile(4);
  const ioRows = await rows();
  check('Storage I/O 详情页能打开', ioTitle === 'Storage I/O', ioTitle);
  check('Storage I/O 有设备名与繁忙度',
        /THGAF4G9N4LBAIRB/.test(findRow(ioRows, 'Device')?.v || '') && !!findRow(ioRows, 'Busy'),
        `${findRow(ioRows, 'Device')?.v} · busy=${findRow(ioRows, 'Busy')?.v}`);
  await page.screenshot({ path: path.join(OUT, 'pw-detail-io.png') });
  await closeTile();

  const trTitle = await openTile(5);
  const trRows = await rows();
  check('Traffic 详情页带 WiFi 链路信息',
        trTitle === 'Traffic' && (findRow(trRows, 'Wi-Fi Network')?.v || '') !== '' &&
        !!findRow(trRows, 'Signal'),
        `${findRow(trRows, 'Wi-Fi Network')?.v} · ${findRow(trRows, 'Signal')?.v}`);
  await closeTile();

  const nqTitle = await openTile(6);
  const nqRows = await rows();
  check('Network Quality 详情页能打开',
        nqTitle === 'Network Quality' && !!findRow(nqRows, 'TCP Connections'),
        `${nqTitle} · conn=${findRow(nqRows, 'TCP Connections')?.v}`);
  await page.screenshot({ path: path.join(OUT, 'pw-detail-netq.png') });
  await closeTile();

  const batTitle = await openTile(7);
  const batRows = await rows();
  check('Battery 详情页带充电详情',
        batTitle === 'Battery' && !!findRow(batRows, 'Charger') && !!findRow(batRows, 'Charging Mode'),
        `${findRow(batRows, 'Charger')?.v} · ${findRow(batRows, 'Charging Mode')?.v}`);
  // 详情页应该有两张图：功率 + 电流
  const charts = await page.evaluate(() => document.querySelectorAll('#detail .chart-card').length);
  check('Battery 详情页有功率 + 电流两张图', charts === 2, `chart-card=${charts}`);
  // 整机功耗的**不变量**（不要断言某个特定状态 —— 设备插电/充电/放电来回变）：
  //   整机 = max(0, 输入 − 充入电池) + 电池放出
  // 三种情形都成立：纯放电（无输入）、插电充电（电池 > 0）、插电但电池不动（电池 ≈ 0）。
  const numW = (s) => {
    const m = String(s || '').match(/(-?\d+(?:\.\d+)?)\s*W/);
    return m ? parseFloat(m[1]) : null;
  };
  const sysV = numW(findRow(batRows, 'System Power')?.v);
  const battV = numW(findRow(batRows, 'Battery Power')?.v);
  const inV = numW(findRow(batRows, 'Input')?.v) ?? 0;
  const expect = Math.max(0, inV - Math.max(0, battV ?? 0)) + Math.max(0, -(battV ?? 0));
  check('整机功耗 = max(0, 输入 − 充入电池) + 电池放出',
        sysV != null && Math.abs(sysV - expect) < 0.06,
        `system=${sysV} expected=${expect.toFixed(2)} (input=${inV} battery=${battV})`);

  // 充电时才有：效率 = 充进电池的 / 输入总功率，其余是系统 + 充电回路损耗
  const eff = findRow(batRows, 'Charging Efficiency');
  const effPct = eff ? parseFloat(eff.v) : null;
  check('充电时给出充电效率（0~100%）',
        !eff || (effPct > 10 && effPct < 100), eff ? eff.v : '(当前未在充电，跳过)');
  check('Battery 详情页标出了功率来源与输入',
        !!findRow(batRows, 'Power Source') && !!findRow(batRows, 'Input'),
        `${findRow(batRows, 'Power Source')?.v} · ${findRow(batRows, 'Input')?.v}`);

  // 功率图是双线：整机 + 电池端
  const dual = await page.evaluate(() => {
    const svg = document.querySelector('#detail .chart-card .chart-svg');
    const strokes = [...svg.querySelectorAll('path[stroke]')].map((p) => p.getAttribute('stroke'));
    const legend = [...document.querySelectorAll('#detail .chart-axis[style*="flex-start"] span')]
      .map((e) => e.textContent.trim());
    return { paths: strokes.length, uniq: [...new Set(strokes)], legend };
  });
  check('功率图同时画了整机与电池端两条线',
        dual.paths === 2 && dual.uniq.length === 2,
        `${dual.paths} 条 · ${dual.uniq.join(' / ')}`);
  check('图例区分 System / Battery',
        dual.legend.join('/') === 'System/Battery', dual.legend.join(' / '));
  // 图例必须在第二张图**之前**，否则读到图例时已经看不出它指哪张图
  const order = await page.evaluate(() => {
    const kids = [...document.querySelector('#detail .detail-body').children];
    const isLegend = (e) => e.classList.contains('chart-axis') &&
      (e.getAttribute('style') || '').includes('flex-start');
    return {
      legend: kids.findIndex(isLegend),
      charts: kids.map((e, i) => (e.classList.contains('chart-card') ? i : -1)).filter((i) => i >= 0),
    };
  });
  check('图例紧跟主图（排在第二张图之前）',
        order.legend > 0 && order.charts.length === 2 && order.legend < order.charts[1],
        `legend@${order.legend} charts@${order.charts.join(',')}`);

  // 气泡要同时给出两根线的值（hover 触发）
  const svgBox = await page.locator('#detail .chart-card .chart-svg').first().boundingBox();
  await page.mouse.move(svgBox.x + svgBox.width * 0.5, svgBox.y + svgBox.height * 0.5);
  await page.waitForTimeout(250);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('#detail .chart-tip');
    const c = document.querySelector('#detail .chart-card');
    return {
      rows: t.querySelectorAll('b').length,
      texts: [...t.querySelectorAll('b')].map((b) => b.textContent.trim()),
      tipTop: t.getBoundingClientRect().top,
      cardTop: c.getBoundingClientRect().top,
    };
  });
  check('气泡同时给出两根线的值', tip.rows === 2, tip.texts.join(' / '));
  check('气泡没被图表卡顶边裁掉',
        tip.tipTop >= tip.cardTop - 1,
        `tip.top=${tip.tipTop.toFixed(0)} card.top=${tip.cardTop.toFixed(0)}`);
  await page.screenshot({ path: path.join(OUT, 'pw-detail-battery.png') });
  await closeTile();

  await openTile(1);
  const zones = await zoneText();
  check('Temperature 详情页有 IIO 的 skin / chg 温度点',
        /skin/i.test(zones) && /chg/i.test(zones), zones.slice(0, 120));
  await closeTile();

  await openTile(2);
  const memRows = await rows();
  check('Memory 详情页有 Zram 压缩信息',
        !!findRow(memRows, 'Zram Compressed') && !!findRow(memRows, 'Zram Saved'),
        `${findRow(memRows, 'Zram Compressed')?.v}`);
  await page.screenshot({ path: path.join(OUT, 'pw-detail-memory.png') });
  await closeTile();

  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log('  -', f.name, f.detail || '');
  process.exitCode = 1;
}
