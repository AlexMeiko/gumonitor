/**
 * Traffic 磁贴灰字（单行）宽度实测：注入最坏情况的速率值，看真实代码路径下
 * 灰字有多宽 / 会不会撑坏网格。
 *   node probe-badge.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STATIC = path.join(ROOT, 'static');
const STATE_LOCAL = path.join(ROOT, '.workbuddy', 'state.json');
const STATE_PATH = fs.existsSync(STATE_LOCAL) ? STATE_LOCAL : path.join(HERE, 'state.sample.json');
const BIG = path.join(HERE, '.tmp');
fs.mkdirSync(path.join(BIG, 'home'), { recursive: true });
process.env.HOME = path.join(BIG, 'home');
process.env.TMPDIR = BIG;
process.env.XDG_RUNTIME_DIR = BIG;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.js': 'application/javascript; charset=utf-8', '.json': 'application/json' };

const B = 1024, M = 1048576;
// name, rx_rate, tx_rate（字节/秒）
const CASES = [
  ['常见  上传K / 下载M ', 3.4 * M, 12 * B],
  ['最坏  两边都 4 位   ', 1023 * B, 1023 * B],
  ['最坏  4位K + 9.9M  ', 9.9 * M, 1023 * B],
  ['很小  B 级          ', 500, 999],
  ['待机  0 速率        ', 0, 0],
  ['大流量 12M + 1.2M   ', 12 * M, 1.2 * M],
];

const RAW = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

const browser = await chromium.launch({
  executablePath: process.env.EDGE || '/opt/microsoft/msedge/msedge', headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
         '--disable-crash-reporter', '--no-first-run', '--disable-extensions'],
});

for (const w of [320, 360, 390, 412, 480, 492]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  let rx = null, tx = null;
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/state') {
      const s = { ...RAW };
      if (rx != null) s.network = { ...s.network, rx_rate: rx, tx_rate: tx };
      return route.fulfill({ status: 200, contentType: MIME['.json'], body: JSON.stringify(s) });
    }
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\//, '');
    const full = path.join(STATIC, rel);
    if (!fs.existsSync(full)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(full)] || 'application/octet-stream',
                           body: fs.readFileSync(full) });
  });
  await page.goto('http://v30-monitor.test/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 8000 });
  await page.waitForTimeout(300);

  // 基线预算：清空灰字后的磁贴宽度
  const budget = await page.evaluate(() => {
    const tile = document.querySelectorAll('.tile')[4];
    const row = tile.querySelector('.row');
    const icon = row.querySelector('.icon');
    const b = row.querySelector('.badge');
    const saved = b.textContent;
    b.textContent = '';
    void tile.offsetHeight;
    const avail = Math.round(row.clientWidth - icon.getBoundingClientRect().width -
                             (parseFloat(getComputedStyle(row).gap) || 0));
    b.textContent = saved;
    return avail;
  });

  console.log(`\n===== 视口 ${w}  灰字预算 ${budget}px =====`);
  for (const [name, r, t] of CASES) {
    rx = r; tx = t;
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(700);   // 等下一轮 poll 把新速率刷进来
    const m = await page.evaluate(() => {
      const tile = Array.from(document.querySelectorAll('.tile'))
        .find((x) => x.querySelector('.name').textContent === 'Traffic');
      const b = tile.querySelector('.badge');
      const grid = document.getElementById('tileGrid');
      return {
        text: b.textContent,
        w: Math.round(b.getBoundingClientRect().width),
        clipped: b.scrollWidth > b.clientWidth + 1,
        gridOverflow: grid.scrollWidth > grid.clientWidth,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        tileH: Math.round(tile.getBoundingClientRect().height),
        value: tile.querySelector('.value').textContent.trim(),
      };
    });
    const ok = m.w <= budget && !m.gridOverflow && !m.pageOverflow;
    console.log(`  ${ok ? '✓' : '✗'} ${String(m.w).padStart(4)}px(预算${budget})` +
                ` 裁切=${m.clipped} 网格溢出=${m.gridOverflow} 磁贴高=${m.tileH}` +
                ` | 大字"${m.value}" 灰字"${m.text}"${name ? '  ← ' + name : ''}`);
  }
  await ctx.close();
}
await browser.close();
