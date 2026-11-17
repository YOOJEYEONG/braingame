// Real-time end-to-end play of a built site (production has no agent adapter, so this plays
// in real time): all three games, scoring, end, retry, quit, keyboard back, history and best
// after reload, then a mobile pass. Usage: bun tools/live-e2e.mjs [url] [screenshot dir]
import { chromium } from '../../exact/node_modules/playwright-core/index.mjs';

const url = (process.argv[2] ?? 'https://braingame-nine.vercel.app').replace(/\/$/, '');
const shots = process.argv[3] ?? '.exact/live';
const browser = await chromium.launch();
const failures = [];
const check = (name, ok, got) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got === undefined ? '' : `: ${got}`}`); if (!ok) failures.push(name); };
const txt = (p, id) => p.getByTestId(id).innerText();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The bar's Back as a person presses it: Exact draws it at the start of the visible <header>.
const barBack = (p) => p.locator('header[data-exact-bar]:visible').first().click({ position: { x: 24, y: 20 } });

async function playMath(p, wrongAt) {
  let correct = 0, wrong = 0, n = 0;
  while (await p.getByTestId('problem').count()) {
    const t = await txt(p, 'problem').catch(() => '');
    const m = t.match(/(\d+) ([+−×÷]) (\d+)/);
    if (!m) break;
    const [a, b] = [+m[1], +m[3]];
    const ans = { '+': a + b, '−': a - b, '×': a * b, '÷': a / b }[m[2]];
    const bad = wrongAt.includes(n);
    await p.getByTestId('answer').fill(String(bad ? ans + 1 : ans)).catch(() => {});
    await p.keyboard.press('Enter').catch(() => {});
    bad ? wrong++ : correct++; n++;
    if (n >= 12) break;
    await wait(150);
  }
  return { correct, wrong };
}

async function playStroop(p, wrongAt, answers) {
  let correct = 0, wrong = 0;
  const swatch = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="ink-"] circle')].map((c) => getComputedStyle(c).fill));
  for (let n = 0; n < answers; n++) {
    const ink = await p.getByTestId('word').evaluate((e) => getComputedStyle(e).color);
    const right = swatch.indexOf(ink);
    const pick = wrongAt.includes(n) ? (right + 1) % 4 : right;
    await p.getByTestId(`ink-${pick}`).click();
    pick === right ? correct++ : wrong++;
    await wait(120);
  }
  return { correct, wrong };
}

async function watchSequence(p) {
  const seen = [];
  let last = -1;
  while ((await txt(p, 'feedback')) === '순서를 잘 보세요.') {
    const lit = await p.evaluate(() => [...document.querySelectorAll('[data-testid^="tile-"]')].findIndex((t) => getComputedStyle(t).borderTopWidth === '3px'));
    if (lit !== last && lit >= 0) seen.push(lit);
    last = lit;
    await wait(30);
  }
  return seen;
}

async function run(viewport, label) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(url + '/');
  await p.getByTestId('root').waitFor();
  check(`${label} home starts empty`, await p.getByTestId('empty-history').isVisible());
  await p.screenshot({ path: `${shots}/${label}-home.png`, fullPage: true });

  if (label === 'desktop') {
    await p.goto(url + '/g/math');
    await p.getByTestId('start').waitFor();
    // Exact's web host draws the bar's Back on the focusable <header> (the authored button is its source).
    await p.keyboard.press('Tab');
    const focused = await p.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.textContent?.slice(0, 2)}`);
    check('keyboard: first Tab reaches the bar Back', focused === 'HEADER 목록', focused);
    await p.keyboard.press('Enter');
    await p.getByTestId('open-math').waitFor();
    check('keyboard: Enter on it returns home', new URL(p.url()).pathname === '/', p.url());

    // Math, normal: answers parsed from the screen, the 3rd and 6th deliberately wrong.
    await p.getByTestId('open-math').click();
    await p.getByTestId('start').click();
    const m = await playMath(p, [2, 5]);
    await p.screenshot({ path: `${shots}/${label}-math-play.png` });
    await p.getByTestId('final-score').waitFor({ timeout: 75000 });
    check('math: final score = correct answers', (await txt(p, 'final-score')) === String(m.correct), `${await txt(p, 'final-score')} vs ${m.correct}`);
    check('math: detail counts', (await txt(p, 'detail')).startsWith(`맞음 ${m.correct} · 틀림 ${m.wrong}`), await txt(p, 'detail'));
    check('math: first record note', (await txt(p, 'best-note')) === '이 난이도의 첫 기록이에요.');
    await p.screenshot({ path: `${shots}/${label}-math-result.png` });
    await p.getByTestId('retry').click();
    check('math: retry starts a fresh 60 s run', (await txt(p, 'time-left')) === '60초' && (await txt(p, 'correct')) === '맞음 0');
    await barBack(p);
    await p.getByTestId('start').waitFor();
    check('math: quit returns to the intro', new URL(p.url()).pathname === '/g/math', p.url());
    await barBack(p);
    check('math: quit run left no record', (await txt(p, 'history-0')) === `${m.correct}점` && (await p.getByTestId('history-1').count()) === 0);

    // Colour attention, hard (30 s): 10 answers by ink, two deliberately wrong.
    await p.getByTestId('open-stroop').click();
    await p.getByTestId('level-hard').click();
    await p.getByTestId('start').click();
    const s = await playStroop(p, [1, 4], 10);
    check('stroop: live counters', (await txt(p, 'correct')) === `맞음 ${s.correct}` && (await txt(p, 'wrong')) === `틀림 ${s.wrong}`);
    await p.screenshot({ path: `${shots}/${label}-stroop-play.png` });
    await p.getByTestId('final-score').waitFor({ timeout: 35000 });
    check('stroop: final score = correct − wrong', (await txt(p, 'final-score')) === String(s.correct - s.wrong), `${await txt(p, 'final-score')}`);
    await p.getByTestId('go-home').click();

    // Sequence memory, easy: repeat what flashes for two rounds, then miss twice.
    await p.getByTestId('open-seq').click();
    await p.getByTestId('level-easy').click();
    await p.getByTestId('start').click();
    for (const len of [3, 4]) {
      const seq = await watchSequence(p);
      check(`seq: watched ${len} flashes`, seq.length === len, seq.join(','));
      for (const t of seq) await p.getByTestId(`tile-${t}`).click();
    }
    check('seq: score after two rounds', (await txt(p, 'score')) === '기록 4');
    let seq = await watchSequence(p);
    await p.getByTestId(`tile-${(seq[0] + 1) % 9}`).click();
    check('seq: a miss costs a chance', (await txt(p, 'lives')) === '남은 기회 1');
    seq = await watchSequence(p);
    await p.getByTestId(`tile-${(seq[0] + 1) % 9}`).click();
    await p.getByTestId('final-score').waitFor();
    check('seq: ends after two misses with the longest full repeat', (await txt(p, 'final-score')) === '4');
    await p.screenshot({ path: `${shots}/${label}-seq-result.png` });
    await p.getByTestId('go-home').click();

    await p.reload();
    await p.getByTestId('history').waitFor();
    check('home after reload: three records, newest first', (await txt(p, 'history-0')) === '4개' && (await txt(p, 'history-2')) === `${m.correct}점`);
    check('home after reload: today count', (await txt(p, 'today')) === '오늘 3판을 했어요.');
    check('home after reload: best per level', (await txt(p, 'best-seq')).includes('쉬움 4개') && (await txt(p, 'best-math')).includes(`보통 ${m.correct}점`), await txt(p, 'best-math'));
    await p.screenshot({ path: `${shots}/${label}-home-after.png`, fullPage: true });
  } else {
    // Mobile: a touch run of colour attention, easy level, and the result screen.
    await p.getByTestId('open-stroop').tap();
    await p.getByTestId('level-easy').tap();
    await p.getByTestId('start').tap();
    const s = await playStroop(p, [0], 6);
    await p.screenshot({ path: `${shots}/${label}-stroop-play.png` });
    await p.getByTestId('final-score').waitFor({ timeout: 50000 });
    check('mobile stroop: final score = correct − wrong', (await txt(p, 'final-score')) === String(s.correct - s.wrong));
    await p.screenshot({ path: `${shots}/${label}-result.png` });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check('mobile: no horizontal overflow', !overflow);
  }
  check(`${label}: no page errors`, errors.length === 0, errors.join(' | ') || 'none');
  await ctx.close();
}

await import('node:fs').then((fs) => fs.mkdirSync(shots, { recursive: true }));
await Promise.all([run({ width: 1280, height: 900 }, 'desktop'), run({ width: 390, height: 844 }, 'mobile')]);
await browser.close();
console.log(failures.length ? `${failures.length} failed` : 'all passed');
process.exit(failures.length ? 1 : 0);
