// Real-browser check: corrupted localStorage must not break the app or invent records.
// Run: bun ../exact/node_modules/.bin/... see README (bun tools/storage-check.mjs [url])
import { chromium } from '../../exact/node_modules/playwright-core/index.mjs';
const url = process.argv[2] ?? 'http://127.0.0.1:8765/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url + 'g/math');
await page.getByText('어려움', { exact: true }).click();
await page.waitForTimeout(300);
const keys = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
console.log('keys after choosing a level:', JSON.stringify(keys));
const levelKey = Object.keys(keys).find((k) => keys[k].includes('hard'));
if (!levelKey) throw new Error('no persisted level key found');
const prefix = levelKey.slice(0, levelKey.lastIndexOf('level'));
const set = (o) => page.evaluate((o) => { for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); }, o);
const read = () => page.evaluate(() => document.body.innerText);
const valid = 'math|easy|7|1763000000000';
for (const [name, store] of [
  ['garbage', { [prefix + 'level']: '{{oops', [prefix + 'history']: 'not json', [prefix + 'bests']: '"x"' }],
  ['wrong types', { [prefix + 'level']: '42', [prefix + 'history']: '{"a":1}', [prefix + 'bests']: '[1,2]' }],
  ['mixed history', { [prefix + 'level']: '"weird"', [prefix + 'history']: JSON.stringify(['junk', 'math|easy|-3|1', 'chess|easy|5|1', valid]), [prefix + 'bests']: '[7,0,0,0,0,0,0,0,999999]' }],
]) {
  await set(store);
  await page.goto(url);
  await page.waitForTimeout(500);
  const text = await read();
  const rows = (text.match(/빠른 셈\s*\n?\s*(쉬움|보통|어려움)\s*\n?\s*\d+점/g) ?? []).length;
  console.log(`${name}: home shown=${text.includes('게임 고르기')} emptyHistory=${text.includes('아직 기록이 없어요.')} historyRows=${rows}`);
  console.log('  ' + text.split('\n').filter((l) => l.includes('최고 기록') || /\d+점/.test(l)).join(' | '));
}
console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
