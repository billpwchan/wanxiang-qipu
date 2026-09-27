// 回归测试：用官方卡面渲染模拟 iPad 画面 → eye OCR → brain 回放 → 检查每一步建议。
// node copilot/test/run.mjs            完整流程（macOS：Chrome 截图 + Apple Vision OCR，会重写 frames.jsonl）
// node copilot/test/run.mjs --replay   只回放已提交的 frames.jsonl（任何系统可跑，CI 用这个）
import { execFileSync } from 'node:child_process';
import { readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const REPLAY = process.argv.includes('--replay') || process.platform !== 'darwin';
if (!REPLAY) {
  const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const TMP = mkdtempSync(join(tmpdir(), 'wx-copilot-'));
  const pages = readdirSync(HERE).filter((f) => /^0\d.*\.html$/.test(f)).sort();
  const shot = (f) => join(TMP, f.replace('.html', '.png'));
  for (const f of pages) execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=2360,1640', '--screenshot=' + shot(f), 'file://' + join(HERE, f)], { stdio: 'ignore' });
  const ocr = execFileSync(join(ROOT, 'copilot/bin/eye'), ['ocr', '--words', join(ROOT, 'copilot/words.txt'), ...pages.map(shot)], { encoding: 'utf8' });
  // src 只留文件名：frames.jsonl 会提交进仓库，不带本机临时路径
  const frames = ocr.trim().split('\n').map((l) => { const f = JSON.parse(l); if (f.src) f.src = f.src.split('/').pop(); return JSON.stringify(f); });
  writeFileSync(join(HERE, 'frames.jsonl'), frames.join('\n') + '\n');
}
const out = execFileSync('node', [join(ROOT, 'copilot/brain.mjs'), 'replay', join(HERE, 'frames.jsonl'), '--no-voice'], { encoding: 'utf8' }).trim().split('\n');
// [画面, 首选, 这一行还必须包含的文字]。路线与买法来自 site/dist/data/plan.js（v5）。
const expect = [
  ['lord', '嬴律', '禁=三分之地'],            // 禁三分 → 网站首推大河开团射，姜导/嬴律/白歌里只有嬴律能打
  ['shop', '弈星', '路线=大河开团射'],        // 开团射开局买法：干将莫邪 → 弈星 → 苏烈
  ['shop', '弈星', '路线=钟馗韩信'],          // 手牌出现狂铁 → 推断为韩信线；韩信线开局：狂铁 → 弈星
  ['talent', '战术模组'],
  ['shop', /亚连|安琪拉|朵莉亚/],
  ['auction', '朵莉亚'],                      // 韩信线第一次拍卖：钟馗 ≤5、朵莉亚 ≤4
  ['shop', '韩信'],
  ['shop', '韩信', '商店=雅典娜'],            // 小卡面上被截断的「典娜」也认成雅典娜
];
let fail = 0;
if (out.length !== expect.length) { fail++; console.log(`FAIL 帧数 ${out.length} ≠ ${expect.length}`); }
out.forEach((line, i) => {
  const [screen, pick, must] = expect[i] || [];
  const ok = line.startsWith(`[${screen}]`) && (!must || line.includes(must)) && (pick instanceof RegExp ? pick.test(line.split('→')[1]) : line.split('→')[1]?.trim().startsWith(pick));
  if (!ok) fail++;
  console.log(ok ? 'PASS' : 'FAIL', line.slice(0, 150));
});
process.exit(fail ? 1 : 0);
