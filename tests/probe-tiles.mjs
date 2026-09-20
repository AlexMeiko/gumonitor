/**
 * 基线：列出所有磁贴的右上角灰字在各视口下的宽度 vs 可用宽度，
 * 看现有设计是不是本来就已经溢出（决定 Traffic 该按什么标准来写）。
 *   node probe-tiles.mjs
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STATIC = path.join(ROOT, 'static');
const STATE_LOCAL = path.join(ROOT, '.workbuddy', 'state.json');
const STATE = fs.existsSync(STATE_LOCAL) ? STATE_LOCAL : path.join(HERE, 'state.sample.json');
const BIG = path.join(HERE, '.tmp');
fs.mkdirSync(path.join(BIG, 'home'), { recursive: true });
process.env.HOME = path.join(BIG, 'home');
process.env.TMPDIR = BIG;
process.env.XDG_RUNTIME_DIR = BIG;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
               '.js': 'application/javascript; charset=utf-8', '.json': 'application/json' };

const browser = await chromium.launch({
  executablePath: process.env.EDGE || '/opt/microsoft/msedge/msedge', headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
         '--disable-crash-reporter', '--no-first-run', '--disable-extensions'],
});

for (const w of [320, 360, 390, 412, 492]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.pathname === '/api/state') {
      return route.fulfill({ status: 200, contentType: MIME['.json'], body: fs.readFileSync(STATE, 'utf8') });
    }
    const rel = u.pathname === '/' ? 'index.html' : u.pathname.replace(/^\//, '');
    const full = path.join(STATIC, rel);
    if (!fs.existsSync(full)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(full)] || 'application/octet-stream',
                           body: fs.readFileSync(full) });
  });
  await page.goto('http://v30-monitor.test/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('.tile').length > 0, { timeout: 8000 });
  await page.waitForTimeout(400);

  const rows = await page.evaluate(() => {
    const grid = document.getElementById('tileGrid');
    const tiles = Array.from(document.querySelectorAll('.tile'));
    // 全部清空灰字 → 自然宽度
    const saved = tiles.map((t) => t.querySelector('.badge').textContent);
    tiles.forEach((t) => { t.querySelector('.badge').textContent = ''; });
    void grid.offsetHeight;
    const budget = tiles.map((t) => {
      const row = t.querySelector('.row');
      const icon = row.querySelector('.icon');
      const gap = parseFloat(getComputedStyle(row).gap) || 0;
      return Math.round(row.clientWidth - icon.getBoundingClientRect().width - gap);
    });
    const naturalTileW = Math.round(tiles[0].getBoundingClientRect().width);
    // 还原并逐一量
    const out = [];
    tiles.forEach((t, i) => {
      const b = t.querySelector('.badge');
      b.textContent = saved[i];
      void t.offsetHeight;
      out.push({
        name: t.querySelector('.name').textContent,
        text: saved[i],
        w: Math.round(b.getBoundingClientRect().width),
        over: b.getBoundingClientRect().right > t.getBoundingClientRect().right - 16 + 0.5,
      });
    });
    return { naturalTileW, budget: budget[0], out,
             gridOverflow: grid.scrollWidth > grid.clientWidth,
             pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });

  console.log(`\n===== 视口 ${w}  自然磁贴宽 ${rows.naturalTileW}px  灰字预算 ${rows.budget}px` +
              `  网格溢出=${rows.gridOverflow} 页面溢出=${rows.pageOverflow} =====`);
  for (const r of rows.out) {
    const fit = r.w <= rows.budget && !r.over;
    console.log(`    ${fit ? '✓' : '✗'} ${String(r.w).padStart(4)}px  ${r.name.padEnd(14)} "${r.text}"`);
  }
  await ctx.close();
}
await browser.close();
