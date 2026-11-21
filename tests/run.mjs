// Jot test suite. Usage: node tests/run.mjs [suite ...]
// Loads ../index.html in a phone-sized Chromium. Nothing here touches the network.
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The app's files: in /public in the old Netlify layout, at the top level on GitHub.
const APP = fs.existsSync(path.join(ROOT, 'public', 'index.html')) ? path.join(ROOT, 'public') : ROOT;
const ONLY = process.argv.slice(2);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };

async function launch() {
  const tries = [process.env.CHROME, undefined,
    ...fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux64/chrome`) : [],
    ...fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`) : []];
  for (const p of tries) {
    if (p === null) continue;
    if (p && !fs.existsSync(p)) continue;
    try { return await chromium.launch(p ? { executablePath: p } : {}); } catch (e) {}
  }
  throw new Error('No Chromium found. Set CHROME=/path/to/chrome');
}
const browser = await launch();

const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayOff = n => ymd(new Date(Date.now() + n * 864e5));
const ISLAND = 'body::after{content:"";position:fixed;top:11px;left:50%;margin-left:-62px;width:124px;height:36px;border-radius:20px;background:#000;z-index:999}';

// Open the app with saved data already in place. `insets` fakes the iPhone's notch/home-bar space.
async function open({ notes = [], kinds, prefs = {}, w = 390, h = 844, insets, init } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: w, height: h }, serviceWorkers: 'block' });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  if (init) await pg.addInitScript(init);
  let html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  if (insets) html = html.replaceAll('env(safe-area-inset-top)', insets[0]).replaceAll('env(safe-area-inset-bottom)', insets[1]);
  await pg.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'localhost') return r.abort();
    if (u.pathname === '/') return r.fulfill({ body: html, contentType: 'text/html' });
    const f = path.join(APP, u.pathname);
    if (!fs.existsSync(f)) return r.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' });
    return r.fulfill({ path: f });
  });
  await pg.goto('http://localhost/');
  await pg.evaluate(({ notes, kinds, prefs }) => {
    localStorage.clear();
    localStorage.setItem('jot:notes', JSON.stringify(notes));
    if (kinds) localStorage.setItem('jot:kinds', JSON.stringify(kinds));
    localStorage.setItem('jot:prefs', JSON.stringify(prefs));
  }, { notes, kinds, prefs });
  await pg.reload(); await pg.waitForTimeout(500);
  const q = (f, a) => pg.evaluate(f, a);
  const saved = () => pg.evaluate(() => JSON.parse(localStorage.getItem('jot:notes')));
  return { pg, ctx, errs, q, saved };
}
const KINDS = { shopping: [], todo: ['Errand', 'Home'], remember: [], question: [], idea: ['COACH', 'Ledger', 'Trading'] };
const today = ymd(new Date());

const SUITES = {
  // ------------------------------------------------------------------
  async basics() {
    const now = Date.now();
    const { pg, ctx, errs, q, saved } = await open({
      kinds: KINDS, prefs: { lastBackup: today },
      notes: [{ id: 'a1', text: 'Milk', type: 'shopping', done: false, ts: now }, { id: 'a2', text: 'Call mum', type: 'todo', done: false, ts: now }]
    });
    const vis = id => q(i => document.getElementById(i).classList.contains('on'), id);
    for (const id of ['edit', 'more', 'guide', 'vault', 'export']) ok(await pg.$('#back-' + id), 'Back button on ' + id);
    await pg.click('#h-more'); await pg.waitForTimeout(500);
    ok(await vis('more'), 'Settings opens');
    await pg.click('#back-more'); await pg.waitForTimeout(500);
    ok(!(await vis('more')), 'Back closes Settings');
    await pg.click('#h-more'); await pg.waitForTimeout(500);
    await pg.click('#sc-guide'); await pg.waitForTimeout(700);
    await pg.click('#back-guide'); await pg.waitForTimeout(700);
    ok(await vis('more'), 'Back from Guide returns to Settings');
    await pg.click('#open-export'); await pg.waitForTimeout(700);
    await pg.click('#back-export'); await pg.waitForTimeout(700);
    ok(await vis('more'), 'Back from Export returns to Settings');
    await pg.click('#back-more'); await pg.waitForTimeout(500);
    await pg.click('#h-lock'); await pg.waitForTimeout(500);
    ok(await vis('vault'), 'Locked opens');
    await pg.click('#back-vault'); await pg.waitForTimeout(500);
    ok(!(await vis('vault')), 'Back closes Locked');
    // subcategories
    await q(() => showLists('todo')); await pg.waitForTimeout(400);
    await pg.click('#kindbar [data-kf="Errand"]'); await pg.waitForTimeout(300);
    await pg.fill('#cap', 'Post parcel'); await pg.dispatchEvent('#cap', 'input'); await pg.click('#add'); await pg.waitForTimeout(400);
    let n = (await saved()).find(x => x.text === 'Post parcel');
    ok(n && JSON.stringify(n.kinds) === '["Errand"]', 'Adding inside To-do > Errand saves as Errand');
    await q(() => { pickedKind = 'Claude'; kindFilter = null; showLists('todo'); }); await pg.waitForTimeout(400);
    await pg.fill('#cap', 'Book dentist'); await pg.dispatchEvent('#cap', 'input'); await pg.click('#add'); await pg.waitForTimeout(400);
    ok(!(await saved()).some(x => x.text === 'Book dentist'), 'No subcategory picked: not added');
    ok(await pg.inputValue('#cap') === 'Book dentist', 'Typing is kept when blocked');
    await pg.click('#types [data-k="Home"]'); await pg.click('#add'); await pg.waitForTimeout(400);
    n = (await saved()).find(x => x.text === 'Book dentist');
    ok(n && JSON.stringify(n.kinds) === '["Home"]', 'After picking Home it adds to Home');
    await q(() => showLists('shopping')); await pg.waitForTimeout(300);
    await pg.fill('#cap', 'Eggs'); await pg.dispatchEvent('#cap', 'input'); await pg.click('#add'); await pg.waitForTimeout(400);
    ok((await saved()).some(x => x.text === 'Eggs' && !x.kinds), 'Category with no subcategories adds fine');
    ok((await saved()).some(x => x.id === 'a1') && (await saved()).some(x => x.id === 'a2'), 'Existing notes kept');
    ok(errs.length === 0, 'No JS errors ' + errs.join(' | '));
    await ctx.close();
  },
  // ------------------------------------------------------------------
  async look() {
    const now = Date.now();
    const seed = [
      { id: '1', text: 'Oat milk', type: 'shopping', done: false, ts: now },
      { id: '2', text: 'Chicken', type: 'shopping', done: true, ts: now - 1 },
      { id: '3', text: 'Post parcel', type: 'todo', tag: 'Errand', done: false, ts: now - 2 },   // old-style: tag only
      { id: '4', text: 'Passport renewal', type: 'remember', done: false, ts: now - 3, due: dayOff(5) },
      { id: '5', text: 'Pay council tax', type: 'todo', done: false, ts: now - 4, due: dayOff(-2) },
      { id: '6', text: 'Barcode scan', type: 'idea', tag: 'COACH', done: false, ts: now - 5 },
      { id: '7', text: 'Funding skew?', type: 'question', done: false, ts: now - 6, answer: '' },
      { id: '8', text: 'Old answered', type: 'question', done: false, ts: now - 7, answer: 'yes', answeredAt: now - 7 }];
    const { pg, ctx, errs, q, saved } = await open({ notes: seed, kinds: KINDS, prefs: { sound: true, haptic: true, lastBackup: today, typeName: { todo: 'Jobs' } } });
    ok(await q(() => document.querySelectorAll('#typegrid .tbtn .ico svg').length === 5), 'Home: 5 category buttons with icons');
    ok(await q(() => [...document.querySelectorAll('#typegrid .tbtn .lb')].map(x => x.textContent).join(',') === 'Shopping,Jobs,Remember,Idea,Question'), 'Renamed category kept');
    const un = await q(() => [...document.querySelectorAll('#sum-t .ur .tx')].map(x => x.textContent));
    ok(un[0] === 'Pay council tax' && un[1] === 'Passport renewal', 'Up next: overdue first, then soonest');
    ok(await q(() => document.querySelector('#d-badge').textContent === '1'), 'Dock badge shows overdue count');
    await pg.click('#hcap'); await pg.waitForTimeout(150);
    ok(await q(() => document.body.classList.contains('kbd')), 'Dock hides while typing');
    await pg.fill('#hcap', 'Milk'); await pg.dispatchEvent('#hcap', 'input');
    await pg.click('[data-home="shopping"]'); await pg.waitForTimeout(300);
    ok((await saved()).some(n => n.text === 'Milk' && n.type === 'shopping'), 'Home add works');
    await pg.fill('#hcap', 'Book MOT'); await pg.dispatchEvent('#hcap', 'input');
    await pg.click('[data-home="todo"]'); await pg.waitForTimeout(200);
    ok(await q(() => !!document.querySelector('#typegrid [data-kind="Errand"]')), 'Home asks for subcategory');
    await pg.click('#typegrid [data-kind="Home"]'); await pg.click('#typegrid [data-add]'); await pg.waitForTimeout(300);
    ok(JSON.stringify((await saved()).find(n => n.text === 'Book MOT').kinds) === '["Home"]', 'Home add with subcategory');
    await q(() => document.activeElement.blur()); await pg.waitForTimeout(150);
    await pg.click('#d-lists'); await pg.waitForTimeout(450);
    ok(await q(() => document.body.classList.contains('in-lists')), 'Dock: Lists opens lists');
    ok(await q(() => document.querySelectorAll('#list .gcard').length >= 4), 'Notes grouped into cards');
    ok(await q(() => document.querySelector('.row[data-id="3"] .k')?.textContent === 'Errand'), 'Old tag-only note shows its subcategory');
    ok(await q(() => !document.querySelector('.row[data-id="8"]')), 'Answered question kept out of All');
    ok(await q(() => getComputedStyle(document.querySelector('#types')).display === 'none'), 'Add bar compact when empty');
    await pg.click('.row[data-id="1"] .tick'); await pg.waitForTimeout(400);
    ok((await saved()).find(n => n.id === '1').done === true, 'Tick works');
    await q(() => { const r = document.querySelector('.row[data-id="6"]'); const R = r.getBoundingClientRect(); const y = R.top + R.height / 2;
      const T = x => new Touch({ identifier: 1, target: r, clientX: x, clientY: y });
      r.dispatchEvent(new TouchEvent('touchstart', { touches: [T(300)], bubbles: true, cancelable: true }));
      for (let x = 290; x >= 80; x -= 15) r.dispatchEvent(new TouchEvent('touchmove', { touches: [T(x)], bubbles: true, cancelable: true }));
      r.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [T(80)], bubbles: true, cancelable: true })); });
    await pg.waitForTimeout(700);
    ok(!(await q(() => !!document.querySelector('.row[data-id="6"]'))), 'Swipe to delete works');
    await pg.click('#d-search'); await pg.waitForTimeout(300);
    await pg.fill('#q', 'passport'); await pg.waitForTimeout(200);
    ok(await q(() => document.querySelectorAll('#list .row').length === 1), 'Search finds things');
    await q(() => document.activeElement.blur());
    await pg.click('#d-write'); await pg.waitForTimeout(500);
    ok(await q(() => !document.body.classList.contains('in-lists')), 'Dock: Write goes home');
    await pg.click('#h-more'); await pg.waitForTimeout(500);
    ok(await q(() => document.querySelectorAll('.catcard.open').length === 0 && document.querySelectorAll('.cathead').length === 5), 'Settings: categories folded');
    await pg.click('[data-co="idea"]'); await pg.waitForTimeout(200);
    await pg.fill('[data-sn="idea"]', 'Jot'); await pg.click('[data-sa="idea"]'); await pg.waitForTimeout(300);
    ok(await q(() => JSON.parse(localStorage.getItem('jot:kinds')).idea.includes('Jot')), 'Adding a subcategory works');
    await pg.click('#back-more'); await pg.waitForTimeout(400);
    const ms = await q(() => { for (let i = 0; i < 600; i++) notes.push({ id: 'z' + i, type: ['shopping', 'todo', 'remember', 'idea'][i % 4], text: 'Item ' + i, done: false, ts: Date.now() - i, kinds: null, tag: null, pinned: false });
      showLists('all'); const t = performance.now(); for (let i = 0; i < 10; i++) render(); return (performance.now() - t) / 10; });
    ok(ms < 80, 'Lists redraw with 600 notes: ' + ms.toFixed(1) + ' ms (limit 80)');
    const kept = await saved();
    ok(kept.some(n => n.id === '3' && n.tag === 'Errand') && kept.some(n => n.id === '8' && n.answer === 'yes'), 'Old saved notes untouched');
    ok(errs.length === 0, 'No JS errors ' + errs.join(' | '));
    await ctx.close();
  },
  // ------------------------------------------------------------------
  async sounds() {
    const init = () => { window.__made = 0; const C = window.AudioContext; window.AudioContext = class extends C { constructor() { super(); window.__made++; } }; };
    let { pg, ctx, errs, q } = await open({ init, prefs: { sound: true, haptic: true, lastBackup: today }, notes: [{ id: '1', text: 'Eggs', type: 'shopping', done: false, ts: 1 }] });
    const res = await q(() => { const o = {}; for (const k of ['tap', 'select', 'add', 'tick', 'untick', 'remove', 'open', 'close', 'error', 'done']) { try { SFX[k](); o[k] = 'ok'; } catch (e) { o[k] = e.message; } } return o; });
    ok(Object.values(res).every(v => v === 'ok'), 'All 10 sounds play without errors');
    const lv = await q(async () => {
      const out = {};
      for (const k of ['add', 'tick', 'remove', 'open', 'done', 'error', 'tap']) {
        const oc = new OfflineAudioContext(1, 44100, 44100); const save = actx; actx = oc; oc.resume = () => {}; noiseBuf = null; SFX[k](); actx = save;
        const d = (await oc.startRendering()).getChannelData(0); let pk = 0; for (const x of d) pk = Math.max(pk, Math.abs(x)); out[k] = pk;
      }
      noiseBuf = null; return out; });
    ok(Object.values(lv).every(p => p > 0.005 && p < 0.5), 'Every sound audible, none clipping');
    ok(errs.length === 0, 'No JS errors');
    await ctx.close();
    ({ pg, ctx, errs, q } = await open({ init, prefs: { sound: false, haptic: false, lastBackup: today }, notes: [{ id: '1', text: 'Eggs', type: 'shopping', done: false, ts: 1 }] }));
    await q(() => { SFX.add(); SFX.tick(); SFX.done(); });
    ok(await q(() => window.__made === 0), 'Sound off = completely silent');
    await ctx.close();
  },
  // ------------------------------------------------------------------
  async fit() {
    const notes = [{ id: 'a', text: 'Pay council tax', type: 'todo', done: false, ts: 1, due: dayOff(-3) }, { id: 'b', text: 'Passport', type: 'remember', done: false, ts: 2, due: dayOff(9) }];
    for (const [name, w, h, ins] of [['iPhone SE', 375, 667, ['20px', '0px']], ['iPhone mini', 375, 812, ['47px', '34px']], ['iPhone 13/14', 390, 844, ['47px', '34px']], ['Pro Max', 430, 932, ['47px', '34px']]]) {
      const { ctx, q, errs } = await open({ notes, w, h, insets: ins, prefs: { lastBackup: today } });
      const r = await q(() => ({ sum: document.getElementById('summary').getBoundingClientRect().bottom, dock: document.getElementById('dock').getBoundingClientRect().top, wide: document.documentElement.scrollWidth <= innerWidth, tall: document.documentElement.scrollHeight <= innerHeight + 1 }));
      ok(r.sum <= r.dock && r.wide && errs.length === 0, name + ': home fits, Up next clear of the bottom bar, no sideways scroll');
      await ctx.close();
    }
  },
  // ------------------------------------------------------------------
  async categories() {
    const now = Date.now();
    const base = [{ id: 'a', text: 'Milk', type: 'shopping', done: false, ts: now }, { id: 'b', text: 'Call mum', type: 'todo', done: false, ts: now - 1 }];
    let o = await open({ notes: base, kinds: KINDS, prefs: { lastBackup: today } });
    const { pg, q, saved } = o;
    const addCat = async (name, icon, base) => {
      await pg.click('#h-more'); await pg.waitForTimeout(400);
      await q(() => document.getElementById('nc-open').click()); await pg.waitForTimeout(150);
      await pg.fill('#nc-name', name); await pg.dispatchEvent('#nc-name', 'input');
      if (icon) await q(i => document.querySelector('[data-ic="' + i + '"]').click(), icon);
      if (base) await q(b => document.querySelector('[data-nb="' + b + '"]').click(), base);
      await q(() => document.getElementById('nc-make').click()); await pg.waitForTimeout(300);
      await q(() => document.getElementById('back-more').click()); await pg.waitForTimeout(450);
    };
    await addCat('Work', 'work');
    const work = await q(() => (JSON.parse(localStorage.getItem('jot:prefs')).customTypes || []).find(c => c.name === 'Work'));
    ok(work && work.icon === 'work' && work.base === 'dated', 'Settings: "Work" category created');
    ok(await q(() => document.querySelectorAll('#typegrid .tbtn').length === 6 && !!document.querySelector('[data-home^="u"] .ico svg')), 'Home shows 6 buttons, Work with its icon');
    await pg.fill('#hcap', 'Email the boss tomorrow'); await pg.dispatchEvent('#hcap', 'input');
    await q(id => document.querySelector('[data-home="' + id + '"]').click(), work.id); await pg.waitForTimeout(300);
    let n = (await saved()).find(x => x.text.startsWith('Email the boss'));
    ok(n && n.type === work.id && !!n.due, 'Adding to Work works, and it understood "tomorrow"');
    await q(() => document.activeElement.blur());
    await q(id => showLists(id), work.id); await pg.waitForTimeout(400);
    ok(await q(() => document.getElementById('lt-h').textContent === 'Work' && document.querySelectorAll('#list .row').length === 1), 'Work has its own list page');
    ok(await q(id => !!document.querySelector('#tabs [data-tab="' + id + '"]'), work.id), 'Work appears in the tabs');
    await q(id => document.querySelector('.row .tick').click()); await pg.waitForTimeout(300);
    ok((await saved()).find(x => x.text.startsWith('Email the boss')).done === true, 'Work items tick off');
    // subcategory on a custom category is required
    await q(() => document.getElementById('d-write').click()); await pg.waitForTimeout(400);
    await pg.click('#h-more'); await pg.waitForTimeout(400);
    await q(id => { document.querySelector('[data-sn="' + id + '"]').value = 'Clients'; document.querySelector('[data-sa="' + id + '"]').click(); }, work.id); await pg.waitForTimeout(200);
    await q(() => document.getElementById('back-more').click()); await pg.waitForTimeout(450);
    await pg.fill('#hcap', 'Send invoice'); await pg.dispatchEvent('#hcap', 'input');
    await q(id => document.querySelector('[data-home="' + id + '"]').click(), work.id); await pg.waitForTimeout(200);
    n = (await saved()).find(x => x.text === 'Send invoice');
    ok(n && JSON.stringify(n.kinds) === '["Clients"]', 'Work with one subcategory: new notes go straight into it');
    await q(() => document.activeElement.blur());
    // survives a restart
    await pg.reload(); await pg.waitForTimeout(500);
    ok(await q(id => !!document.querySelector('[data-home="' + id + '"]'), work.id), 'Work is still there after reopening the app');
    // backup + restore onto a fresh phone brings it back
    const backup = await q(() => backupText());
    await o.ctx.close();
    o = await open({ notes: [], prefs: { lastBackup: today } });
    await o.q(() => document.getElementById('h-more').click()); await o.pg.waitForTimeout(400);
    const fs2 = (await import('fs')).default; const tmp = '/tmp/jot-test-backup.json'; fs2.writeFileSync(tmp, backup);
    o.pg.once('filechooser', fc => fc.setFiles(tmp));
    await o.q(() => document.getElementById('rs').click()); await o.pg.waitForTimeout(500);
    await o.q(() => document.getElementById('dlg-yes').click()); await o.pg.waitForTimeout(500);
    ok(await o.q(id => !!TYPES[id] && notes.some(n => n.type === id), work.id), 'Restoring a backup brings Work and its notes back');
    await o.ctx.close();
    // up to five of your own; home still fits with ten buttons
    o = await open({ notes: base, kinds: KINDS, prefs: { lastBackup: today, customTypes: ['Work', 'Gym', 'Uni', 'Car', 'Trip'].map((nm, i) => ({ id: 'u' + i, name: nm, c: '#9aa7e8', icon: 'folder', base: i % 2 ? 'list' : 'dated' })) } });
    ok(await o.q(() => document.querySelectorAll('#typegrid .tbtn').length === 10 && document.getElementById('typegrid').classList.contains('many')), '10 categories show on home');
    await o.q(() => document.getElementById('h-more').click()); await o.pg.waitForTimeout(400);
    ok(await o.q(() => !document.getElementById('nc-open') && document.getElementById('cat-new').textContent.includes('limit')), 'Sixth category of your own is refused');
    ok(await o.q(() => TYPES.u1.dated === false && TYPES.u0.dated === true), '"Simple tick list" has no dates, the other kind does');
    await o.ctx.close();
    for (const [nm, w, h, ins] of [['iPhone SE', 375, 667, ['20px', '0px']], ['iPhone 13/14', 390, 844, ['47px', '34px']]]) {
      const f = await open({ w, h, insets: ins, notes: base, prefs: { lastBackup: today, customTypes: ['Work', 'Gym', 'Uni', 'Car', 'Trip'].map((x, i) => ({ id: 'u' + i, name: x, c: '#9aa7e8', icon: 'folder', base: 'dated' })) } });
      const r = await f.q(() => ({ sum: document.getElementById('summary').getBoundingClientRect().bottom, dock: document.getElementById('dock').getBoundingClientRect().top, wide: document.documentElement.scrollWidth <= innerWidth }));
      ok(r.wide && (nm === 'iPhone SE' || r.sum <= r.dock), nm + ' with 10 categories: no sideways scroll' + (nm === 'iPhone SE' ? ' (page scrolls a little)' : ', Up next clear of the bottom bar'));
      await f.ctx.close();
    }
    // delete moves notes to To-do
    o = await open({ notes: [...base, { id: 'w1', text: 'Timesheet', type: 'u0', done: false, ts: 5 }], prefs: { lastBackup: today, customTypes: [{ id: 'u0', name: 'Work', c: '#9aa7e8', icon: 'work', base: 'dated' }] } });
    await o.q(() => document.getElementById('h-more').click()); await o.pg.waitForTimeout(400);
    await o.q(() => document.querySelector('[data-co="u0"]').click()); await o.pg.waitForTimeout(200);
    await o.q(() => document.querySelector('[data-cdel="u0"]').click()); await o.pg.waitForTimeout(300);
    await o.q(() => document.getElementById('dlg-yes').click()); await o.pg.waitForTimeout(400);
    const after = await o.saved();
    ok(after.find(x => x.id === 'w1').type === 'todo' && !(await o.q(() => !!TYPES.u0)), 'Deleting Work moves its notes to To-do, nothing lost');
    ok(after.some(x => x.id === 'a') && after.some(x => x.id === 'b'), 'Other notes untouched');
    ok(o.errs.length === 0, 'No JS errors ' + o.errs.join(' | '));
    await o.ctx.close();
  },
  // ------------------------------------------------------------------
  async locked() {
    const now = Date.now();
    const base = [{ id: 'a', text: 'Milk', type: 'shopping', done: false, ts: now }];
    const o = await open({ notes: base, prefs: { lastBackup: today } });
    const { pg, q } = o;
    const pin = async code => { for (const d of code) { await q(x => document.querySelector('#v-pinwrap [data-d="' + x + '"]').click(), d); await pg.waitForTimeout(40); } await pg.waitForTimeout(1600); };
    await pg.click('#h-lock'); await pg.waitForTimeout(500);
    ok(await q(() => document.querySelector('.vstep').textContent === 'Step 1 of 2'), 'First time: "Step 1 of 2, choose a code"');
    await pin('1234');
    ok(await q(() => document.querySelector('.vstep').textContent === 'Step 2 of 2' && document.querySelector('.pintitle').textContent.includes('same code')), 'Then "Step 2 of 2, type the same code again"');
    await pin('1234');
    ok(await q(() => !!vaultKey && !!document.getElementById('v-settings')), 'Code set and unlocked, with a settings button');
    await q(() => lockVault()); await pg.waitForTimeout(200);
    await pin('1234');
    ok(await q(() => !!vaultKey), 'The code you set unlocks it (the bug you hit)');
    // settings: categories + subcategories
    await q(() => document.getElementById('v-settings').click()); await pg.waitForTimeout(200);
    ok(await q(() => document.getElementById('v-h').textContent === 'Locked settings'), 'Locked section has its own settings');
    await pg.fill('#v-catname', 'Bank'); await q(() => document.getElementById('v-catadd').click()); await pg.waitForTimeout(300);
    await q(() => { const i = document.querySelector('[data-vsn]'); i.value = 'Personal'; document.querySelector('[data-vsa]').click(); }); await pg.waitForTimeout(300);
    ok(await q(() => vaultCats.length === 1 && vaultCats[0].name === 'Bank' && vaultCats[0].subs[0] === 'Personal'), 'Category "Bank" with subcategory "Personal" created');
    await q(() => document.getElementById('back-vault').click()); await pg.waitForTimeout(200);
    ok(await q(() => vaultView === 'list'), 'Back from settings returns to the list');
    await q(() => document.getElementById('v-add').click()); await pg.waitForTimeout(200);
    await pg.fill('#v-label', 'Monzo PIN'); await pg.fill('#v-secret', '4321');
    await q(() => document.querySelector('[data-ec]:not([data-ec=""])').click()); await pg.waitForTimeout(100);
    await q(() => document.getElementById('v-save').click()); await pg.waitForTimeout(300);
    ok(await q(() => vaultEditing !== null), 'Category with subcategories: must pick one before saving');
    await q(() => document.querySelector('[data-esb="Personal"]').click()); await pg.waitForTimeout(100);
    await q(() => document.getElementById('v-save').click()); await pg.waitForTimeout(400);
    ok(await q(() => vaultItems.length === 1 && vaultItems[0].sub === 'Personal'), 'Saved into Bank > Personal');
    await q(() => document.querySelector('[data-vf]:not([data-vf=""])').click()); await pg.waitForTimeout(150);
    ok(await q(() => document.querySelectorAll('#v-body .vcard').length === 1 && !document.querySelector('#v-body .vtag')), 'Inside Bank: shows it as a card, no repeated Bank tag');
    ok(await q(() => document.querySelector('.vc-sec').textContent === '4321'), 'The secret shows in full, no dots');
    await q(() => { vaultFilter = null; renderVault(); }); await pg.waitForTimeout(100);
    ok(await q(() => { const f = document.querySelector('.vfold'); return !!f && f.textContent.includes('Bank') && f.querySelector('.vf-n').textContent === '1'; }), 'Front page shows categories as folders with a count');
    await q(() => document.querySelector('.vfold').click()); await pg.waitForTimeout(150);
    ok(await q(() => vaultFilter !== null && document.querySelectorAll('.vcard').length === 1), 'Tapping a folder opens it, every code visible');
    await q(() => { vaultView = 'settings'; renderVault(); }); await pg.waitForTimeout(100);
    await q(() => document.querySelector('[data-vl="big"]').click()); await pg.waitForTimeout(150);
    await q(() => document.getElementById('back-vault').click()); await pg.waitForTimeout(150);
    ok(await q(() => document.querySelector('.vb-sec')?.textContent === '4321' && JSON.parse(localStorage.getItem('jot:prefs')).vaultLayout === 'big'), 'Settings switch to "Big codes, one per row" works and is remembered');
    ok(!/4321|Monzo/.test(await q(() => localStorage.getItem('jot:prefs'))), 'Only the view choice is saved in settings, never a code');
    await q(() => { vaultLayout = 'grid'; prefs.vaultLayout = 'grid'; renderVault(); });
    await q(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__clip = t; } } }));
    await q(() => document.querySelector('.vc-copy').click()); await pg.waitForTimeout(200);
    ok(await q(() => window.__clip === '4321'), 'Tapping a card copies its code');
    const raw = await q(() => localStorage.getItem('jot:vault'));
    ok(!/Monzo|Bank|Personal|4321/.test(raw), 'Nothing readable is stored — names and categories are scrambled too');
    // wrong code, then right
    await q(() => lockVault()); await pg.waitForTimeout(150);
    await pin('9999');
    ok(await q(() => !vaultKey), 'Wrong code is refused');
    await pin('1234');
    ok(await q(() => vaultItems.length === 1 && vaultCats.length === 1), 'Right code: items and categories come back');
    // change code
    await q(() => { document.getElementById('v-settings').click(); }); await pg.waitForTimeout(150);
    await q(() => document.getElementById('v-newcode').click()); await pg.waitForTimeout(150);
    await pin('5678'); await pin('5678');
    await q(() => lockVault()); await pg.waitForTimeout(150);
    await pin('1234');
    ok(await q(() => !vaultKey), 'After changing the code, the old one no longer works');
    await pin('5678');
    ok(await q(() => vaultItems.length === 1 && vaultItems[0].secret === '4321'), 'New code works, nothing lost');
    // Face ID (a fake Face ID in the test browser)
    const cdp = await pg.context().newCDPSession(pg);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
    await q(() => { vaultView = 'settings'; renderVault(); }); await pg.waitForTimeout(150);
    await q(() => { const t = document.getElementById('v-biotog'); t.checked = true; t.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(400);
    ok(await q(() => vaultView === 'bioon'), 'Turning on Face ID asks for the code first');
    await pin('5678');
    await q(() => document.getElementById('v-biogo').click()); await pg.waitForTimeout(1500);
    ok(await q(() => { const m = JSON.parse(localStorage.getItem('jot:vault')); return !!(m.bio && m.bio.cred && m.bio.pin); }), 'Face ID switched on');
    ok(!/5678/.test(await q(() => localStorage.getItem('jot:vault'))), 'The code is not stored readable for Face ID either');
    await q(() => lockVault()); await q(() => closeSheet('vault')); await pg.waitForTimeout(400);
    await pg.click('#h-lock'); await pg.waitForTimeout(2000);
    ok(await q(() => !!vaultKey && vaultItems.length === 1), 'Opening the locked section unlocks with Face ID, no code typed');
    await q(() => lockVault()); await pg.waitForTimeout(150);
    ok(await q(() => !!document.getElementById('v-face')), 'Locked screen has an "Unlock with Face ID" button');
    await q(() => document.getElementById('v-face').click()); await pg.waitForTimeout(1500);
    ok(await q(() => !!vaultKey), 'The Face ID button works too');
    await q(() => { vaultView = 'settings'; renderVault(); });
    await q(() => { const t = document.getElementById('v-biotog'); t.checked = false; t.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(200);
    ok(await q(() => !JSON.parse(localStorage.getItem('jot:vault')).bio), 'Face ID can be switched off');
    // forgot your code
    await q(() => lockVault()); await pg.waitForTimeout(150);
    await q(() => document.getElementById('v-forgot').click()); await pg.waitForTimeout(150);
    ok(await q(() => document.getElementById('v-body').textContent.includes('1 locked item will be deleted')), 'Forgot code: says exactly what would be lost');
    await q(() => document.getElementById('v-erase').click()); await pg.waitForTimeout(300);
    await q(() => document.getElementById('dlg-yes').click()); await pg.waitForTimeout(400);
    ok(await q(() => !localStorage.getItem('jot:vault') && document.querySelector('.vstep').textContent === 'Step 1 of 2'), 'Erase and start again works');
    ok((await o.saved()).some(n => n.id === 'a'), 'Normal notes untouched by erasing');
    // a locked section made by an older version still opens
    await q(async () => { await createVault('2468'); vaultItems = [{ id: 'old1', label: 'Gym wifi', user: '', secret: 'pw', note: '' }]; await saveVault();
      const m = JSON.parse(localStorage.getItem('jot:vault')); delete m.cats; localStorage.setItem('jot:vault', JSON.stringify(m)); lockVault(); });
    await pg.waitForTimeout(200); await pin('2468');
    ok(await q(() => vaultItems.length === 1 && vaultItems[0].label === 'Gym wifi' && vaultCats.length === 0), 'Locked notes from an older version open fine');
    ok(o.errs.length === 0, 'No JS errors ' + o.errs.join(' | '));
    await o.ctx.close();
  },
  // ------------------------------------------------------------------
  async claude() {
    const now = Date.now();
    const notes = [
      { id: 'c1', text: 'Barcode scan', type: 'idea', kinds: ['COACH'], done: false, ts: now, notes: 'Use the camera' },
      { id: 'c2', text: 'Weekly review', type: 'idea', tag: 'COACH', done: false, ts: now - 1 },          // old-style tag
      { id: 'c3', text: 'Old COACH idea', type: 'idea', kinds: ['COACH'], done: false, ts: now - 2, applied: now - 99999 },
      { id: 'l1', text: 'Split bills', type: 'idea', kinds: ['Ledger'], done: false, ts: now - 3 },
      { id: 'j1', text: 'Widget', type: 'idea', kinds: ['Jot'], done: false, ts: now - 4 },
      { id: 't1', text: 'Buy milk', type: 'todo', kinds: ['Errand'], done: false, ts: now - 5 }];
    const kinds = { ...KINDS, idea: ['COACH', 'Ledger', 'Jot'] };
    const clip = () => { window.__clip = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__clip = t; } } }); };
    let o = await open({ init: clip, notes, kinds, prefs: { lastBackup: today } });
    await o.q(() => showLists('idea')); await o.pg.waitForTimeout(300);
    ok(await o.q(() => !document.getElementById('send-claude')), 'No Send button when no subcategory is picked');
    await o.pg.click('#kindbar [data-kf="COACH"]'); await o.pg.waitForTimeout(300);
    ok(await o.q(() => document.getElementById('send-claude')?.textContent.includes('Send 2 COACH ideas')), 'Button shows "Send 2 COACH ideas to Claude"');
    await o.pg.click('#send-claude'); await o.pg.waitForTimeout(400);
    const c = await o.q(() => window.__clip || '');
    ok(c.startsWith('Ideas for COACH') && c.includes('1. Barcode scan') && c.includes('Extra: Use the camera') && c.includes('2. Weekly review'), 'Copied message lists the COACH ideas with their notes');
    ok(!c.includes('Old COACH idea') && !c.includes('Split bills') && !c.includes('Widget'), 'Already-applied and other subcategories left out');
    let s = await o.saved(); const by = id => s.find(n => n.id === id);
    ok(by('c1').applied && by('c2').applied, 'Sent COACH ideas are marked applied');
    ok(!by('l1').applied && !by('j1').applied && !by('t1').done, 'Ledger, Jot and to-dos untouched');
    ok(by('c3').applied === now - 99999, 'Older applied date kept');
    ok(await o.q(() => !document.getElementById('send-claude')), 'Button gone once nothing is left to send');
    await o.q(() => document.getElementById('toast-b').click()); await o.pg.waitForTimeout(300);
    s = await o.saved();
    ok(!s.find(n => n.id === 'c1').applied && !s.find(n => n.id === 'c2').applied && s.find(n => n.id === 'c3').applied, 'Undo un-applies just the ones sent');
    ok(o.errs.length === 0, 'No JS errors ' + o.errs.join(' | '));
    await o.ctx.close();
    // copy blocked: nothing is marked, export sheet opens instead
    const noClip = () => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('blocked'); } } }); };
    o = await open({ init: noClip, notes, kinds, prefs: { lastBackup: today } });
    await o.q(() => { showLists('idea'); }); await o.pg.waitForTimeout(300);
    await o.pg.click('#kindbar [data-kf="Ledger"]'); await o.pg.waitForTimeout(300);
    await o.pg.click('#send-claude'); await o.pg.waitForTimeout(600);
    ok(!(await o.saved()).find(n => n.id === 'l1').applied, 'If copying fails, nothing is marked applied');
    ok(await o.q(() => document.getElementById('export').classList.contains('on')), 'If copying fails, the Export page opens to copy by hand');
    ok(o.errs.length === 0, 'No JS errors ' + o.errs.join(' | '));
    await o.ctx.close();
  },
  // ------------------------------------------------------------------
  async sweep() {   // fixes from the Nov 2026 bug sweep
    const now = Date.now();
    const notes = [
      { id: '1', text: 'Oat milk', type: 'shopping', done: false, ts: now },
      { id: '2', text: 'Post parcel', type: 'todo', kinds: ['Errand'], done: false, ts: now - 1 },
      { id: '3', text: 'Old idea', type: 'idea', kinds: ['COACH'], done: false, ts: now - 2, applied: now - 5 },
      { id: '4', text: 'Answered', type: 'question', done: false, ts: now - 3, answer: 'yes', answeredAt: now - 3 },
      { id: '5', text: 'Bins', type: 'todo', kinds: ['Home'], done: false, ts: now - 4, due: dayOff(-1), repeat: 'weekly' }];  // odd repeat value on purpose
    const prefs = { lastBackup: dayOff(-10), bkAsked: '9999-12-31', customTypes: [{ id: 'uw', name: 'Work', c: '#9aa7e8', icon: 'work', base: 'dated' }] };
    let o = await open({ notes, kinds: KINDS, prefs, w: 375, h: 667, insets: ['20px', '0px'] });
    const r = await o.q(() => ({ sum: document.getElementById('summary').getBoundingClientRect().bottom, dock: document.getElementById('dock').getBoundingClientRect().top, nag: document.getElementById('h-backup').classList.contains('on') }));
    ok(r.nag && r.sum <= r.dock, 'iPhone SE with a backup warning and 6 categories: Up next clear of the bottom bar');
    await o.q(() => toast('Hello', 'Undo', () => {}, 9000)); await o.pg.waitForTimeout(500);
    ok(await o.q(() => document.getElementById('toast').getBoundingClientRect().bottom <= document.getElementById('dock').getBoundingClientRect().top + 1), 'Pop-up messages sit above the bottom bar, not on it');
    await o.q(() => { hideToast(); paintMore(); });
    ok(await o.q(() => document.querySelector('#stats .stat b').textContent === '3'), 'Settings "Open" counts the same way as the lists (applied/answered not counted)');
    await o.q(() => closeSheet('more'));
    await o.pg.fill('#hcap', 'call mum tomorrow'); await o.pg.dispatchEvent('#hcap', 'input');
    ok(await o.q(() => document.getElementById('hund-t').textContent.includes('Work')), 'Date hint names Work too, not just To-do or Remember');
    await o.q(() => { document.getElementById('hcap').value = ''; document.activeElement.blur(); showLists('all'); });
    await o.pg.waitForTimeout(300);
    ok(await o.q(() => !document.getElementById('list').innerText.includes('undefined') && document.getElementById('list').innerText.includes('Repeats')), 'An odd repeat value shows "Repeats", never "undefined"');
    await o.q(() => { tab = 'uw'; render(); }); await o.pg.waitForTimeout(400);
    ok(await o.q(() => { const t = document.querySelector('#tabs .seg.on'); const r = t.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'The selected tab scrolls into view');
    // edit sheet
    await o.q(() => { tab = 'all'; render(); document.querySelector('[data-open="2"]').click(); }); await o.pg.waitForTimeout(400);
    ok(await o.q(() => document.querySelector('#e-kindwrap .lab').textContent === 'Subcategory'), 'Edit page says "Subcategory", not "Kind of idea"');
    await o.q(() => document.querySelector('[data-et="idea"]').click()); await o.pg.waitForTimeout(100);
    await o.q(() => document.getElementById('e-save').click()); await o.pg.waitForTimeout(200);
    ok((await o.saved()).find(n => n.id === '2').type === 'todo', 'Moving a note into Ideas without picking a subcategory is blocked');
    await o.q(() => document.querySelector('[data-ek="Ledger"]').click());
    await o.q(() => document.getElementById('e-save').click()); await o.pg.waitForTimeout(300);
    const moved = (await o.saved()).find(n => n.id === '2');
    ok(moved.type === 'idea' && JSON.stringify(moved.kinds) === '["Ledger"]', 'After picking one it moves, and the old "Errand" label is dropped');
    // duplicate names
    await o.q(() => { paintMore(); openSheet('more'); document.querySelector('[data-co="uw"]').click(); });
    await o.q(() => { const i = document.querySelector('[data-tn="uw"]'); i.value = 'Shopping'; i.dispatchEvent(new Event('change')); }); await o.pg.waitForTimeout(200);
    ok(await o.q(() => typeName('uw') === 'Work'), 'Renaming a category to a name you already use is blocked');
    ok(o.errs.length === 0, 'No JS errors ' + o.errs.join(' | '));
    await o.ctx.close();
    // locked: long secrets shrink to fit
    o = await open({ notes: [], prefs: { lastBackup: today } });
    await o.q(async () => { await createVault('1234'); vaultItems = [{ id: 'a', label: 'Door', secret: '2580' }, { id: 'b', label: 'Wifi', secret: 'a-very-long-wifi-password-that-goes-on-and-on-123' }]; await saveVault(); openSheet('vault'); renderVault(); });
    await o.pg.waitForTimeout(400);
    ok(await o.q(() => { const s = [...document.querySelectorAll('.vc-sec')]; return s[0].className === 'vc-sec' && s[1].classList.contains('xl') && s[1].getBoundingClientRect().height < 120; }), 'Long secrets shrink to fit the card; short codes stay big');
    ok(await o.q(() => document.querySelector('.vc-edit').getBoundingClientRect().width >= 40), 'Edit pencil is a full-size tap target');
    await o.ctx.close();
  },
  // ------------------------------------------------------------------
  async notify() {
    if (!fs.existsSync(path.join(ROOT, 'netlify/lib/core.mjs'))) { console.log('  (skipped: the notification helper is not in this folder)'); return; }
    const http = (await import('http')).default;
    const { handleApi, tick } = await import(path.join(ROOT, 'netlify/lib/core.mjs'));
    // a pretend Netlify store and a pretend push service
    const mem = new Map();
    const store = {
      get: async (k) => mem.has(k) ? JSON.parse(mem.get(k)) : null,
      setJSON: async (k, v) => { mem.set(k, JSON.stringify(v)); },
      delete: async (k) => { mem.delete(k); },
      list: async ({ prefix }) => ({ blobs: [...mem.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) })
    };
    const sends = []; let goneNext = false;
    const send = async (sub, payload) => { if (goneNext) { goneNext = false; return 'gone'; } sends.push({ sub, payload }); return 'ok'; };
    const generate = () => ({ publicKey: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', privateKey: 'priv' });
    let clock = Date.now(); const now = () => clock;
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://localhost');
      if (u.pathname.startsWith('/api/push/')) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const r = await handleApi(new Request(u.href, { method: req.method, headers: req.headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }), { store, generate, send, now });
        res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); return;
      }
      const f = path.join(APP, u.pathname === '/' ? 'index.html' : u.pathname);
      if (!f.startsWith(APP) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(8765, r));
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
    await ctx.grantPermissions(['notifications'], { origin: 'http://localhost:8765' });
    await ctx.addInitScript(() => {
      // Headless Chrome has no real push service here; stand in for it.
      if (!window.PushManager) return;
      let sub = null;
      const make = (opts) => ({ endpoint: 'https://push.example/abc', options: opts, toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'BPhone', auth: 'secret' } }; }, unsubscribe: async () => { sub = null; return true; } });
      PushManager.prototype.getSubscription = async function () { return sub; };
      PushManager.prototype.subscribe = async function (opts) { sub = make(opts); return sub; };
    });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const q = (f, a) => pg.evaluate(f, a);
    const t0 = new Date(); t0.setDate(t0.getDate() + 1);
    const due = ymd(t0);
    const t1 = new Date(t0); t1.setDate(t1.getDate() + 1); const due2 = ymd(t1);
    await pg.goto('http://localhost:8765/');
    await q(([due, due2, today]) => { localStorage.clear();
      localStorage.setItem('jot:notes', JSON.stringify([
        { id: 'r1', text: 'Call the dentist', type: 'todo', done: false, ts: 1, due, dueTime: '18:00', remind: 0 },
        { id: 'r2', text: 'Passport', type: 'remember', done: false, ts: 2, due: due2, remind: 1440 },
        { id: 'r3', text: 'No reminder on this', type: 'todo', done: false, ts: 3, due, remind: null },
        { id: 'r4', text: 'Already done', type: 'todo', done: true, ts: 4, due, dueTime: '10:00', remind: 0 }]));
      localStorage.setItem('jot:prefs', JSON.stringify({ lastBackup: today })); }, [due, due2, today]);
    await pg.reload(); await pg.waitForTimeout(800);
    await q(() => navigator.serviceWorker.ready);
    // Settings shows it off, then turn it on
    await q(() => { paintMore(); openSheet('more'); }); await pg.waitForTimeout(300);
    ok(await q(() => document.getElementById('push-state').textContent.startsWith('Off')), 'Settings: Notifications switch, off to start');
    await q(() => { const t = document.getElementById('t-push'); t.checked = true; t.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(1500);
    ok(await q(() => document.getElementById('t-push').checked && document.getElementById('push-state').textContent.startsWith('On')), 'Turning it on works');
    const dev = await q(() => localStorage.getItem('jot:device'));
    let doc = JSON.parse(mem.get('dev/' + JSON.parse(dev)));
    ok(doc && doc.sub && doc.sub.endpoint === 'https://push.example/abc', 'The helper got this phone\'s push address');
    ok(doc.reminders.length === 2 && doc.reminders.map(r => r.id).sort().join() === 'r1,r2', 'Only notes with "Remind me" set and not ticked off are sent (2 of 4)');
    ok(!JSON.stringify(doc).includes('dentist') && !JSON.stringify(doc).includes('Passport'), 'The helper never gets the words of a note');
    const exp = new Date(t0); exp.setHours(18, 0, 0, 0);
    ok(doc.reminders.find(r => r.id === 'r1').at === exp.getTime(), 'Buzz time is exactly right (6pm tomorrow, local time)');
    const exp2 = new Date(t1); exp2.setHours(9, 0, 0, 0); exp2.setDate(exp2.getDate() - 1);
    ok(doc.reminders.find(r => r.id === 'r2').at === exp2.getTime(), '"1 day before" works (9am the day before, for a note with no time)');
    // edits flow through
    await q(() => closeSheet('more'));
    await q(() => { notes.find(n => n.id === 'r1').done = true; lsSet(K.notes, notes); render(); }); await pg.waitForTimeout(2200);
    doc = JSON.parse(mem.get('dev/' + JSON.parse(dev)));
    ok(doc.reminders.length === 1 && doc.reminders[0].id === 'r2', 'Ticking a note off removes its buzz from the helper');
    await q(() => { notes.find(n => n.id === 'r1').done = false; lsSet(K.notes, notes); render(); }); await pg.waitForTimeout(2200);
    // the helper's minute check
    clock = exp.getTime() - 30000; ok(await tick({ store, generate, send, now }) === 0, 'Helper: nothing sent before it is due');
    clock = exp.getTime() + 20000; ok(await tick({ store, generate, send, now }) === 1 && sends[sends.length - 1].payload.id === 'r1', 'Helper: sends it once the time comes');
    clock = exp.getTime() + 80000; ok(await tick({ store, generate, send, now }) === 0, 'Helper: never sends the same reminder twice');
    // the phone receives it: background part shows the note's words
    const cdp = await ctx.newCDPSession(pg);
    const regs = []; cdp.on('ServiceWorker.workerRegistrationUpdated', e => regs.push(...e.registrations));
    await cdp.send('ServiceWorker.enable'); await pg.waitForTimeout(500);
    const reg = regs.find(r => r.scopeURL.startsWith('http://localhost:8765'));
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: 'http://localhost:8765', registrationId: reg.registrationId, data: JSON.stringify(sends[sends.length - 1].payload) });
    await pg.waitForTimeout(800);
    const shown = await q(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => ({ title: n.title, body: n.body, id: n.data && n.data.id })));
    ok(shown.some(n => n.title === 'Call the dentist' && n.body.startsWith('To-do') && n.id === 'r1'), 'Phone shows the note itself as the notification ("Call the dentist")');
    await cdp.send('ServiceWorker.deliverPushMessage', { origin: 'http://localhost:8765', registrationId: reg.registrationId, data: JSON.stringify({ kind: 'reminder', id: 'deleted-note' }) });
    await pg.waitForTimeout(600);
    ok((await q(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map(n => n.title))).includes('Jot reminder'), 'A buzz for a deleted note still shows something (iPhone requires it)');
    // test button
    await q(() => { paintMore(); openSheet('more'); document.getElementById('push-test').click(); }); await pg.waitForTimeout(500);
    ok(sends[sends.length - 1].payload.kind === 'test', 'Settings "Send a test notification" works');
    // tapping a notification opens the note
    await pg.goto('http://localhost:8765/?note=r2'); await pg.waitForTimeout(1200);
    ok(await q(() => document.getElementById('edit').classList.contains('on') && document.getElementById('e-text').value === 'Passport' && !location.search), 'Tapping a notification opens that note');
    ok(await q(() => document.getElementById('e-pushnote').textContent.startsWith('Jot will buzz you')), 'Edit page says when it will buzz');
    await q(() => closeSheet('edit'));
    // phone turned notifications off in iPhone Settings -> helper forgets it
    goneNext = true; clock = exp2.getTime() + 10000; await tick({ store, generate, send, now });
    ok(!mem.has('dev/' + JSON.parse(dev)), 'If the phone stops accepting buzzes, the helper forgets it');
    // switching off
    await q(() => { paintMore(); openSheet('more'); const t = document.getElementById('t-push'); t.checked = false; t.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(800);
    ok(await q(() => !document.getElementById('t-push').checked && JSON.parse(localStorage.getItem('jot:prefs')).push === false), 'Switching off works');
    ok(errs.length === 0, 'No JS errors ' + errs.join(' | '));
    await ctx.close(); server.close();
    // helper input checks
    const bad = await handleApi(new Request('http://x/api/push/sync', { method: 'POST', body: JSON.stringify({ device: '../etc', reminders: [] }) }), { store, generate, send, now });
    ok(bad.status === 400, 'Helper refuses a malformed phone id');
    const key1 = await (await handleApi(new Request('http://x/api/push/key'), { store, generate, send, now })).json();
    const key2 = await (await handleApi(new Request('http://x/api/push/key'), { store, generate: () => ({ publicKey: 'other', privateKey: 'x' }), send, now })).json();
    ok(key1.key === key2.key, 'Helper keeps the same keys once made');
  },
  // ------------------------------------------------------------------
  async hours() {
    const init = () => {
      window.__clip = null;
      window.ClipboardItem = class { constructor(o) { this.o = o; } };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        write: async (items) => { const o = items[0].o; window.__clip = { html: await o['text/html'].text(), text: await o['text/plain'].text() }; },
        writeText: async (t) => { window.__clip = { text: t }; } } });
    };
    let o = await open({ init, notes: [{ id: 'n1', text: 'Milk', type: 'shopping', done: false, ts: 1 }], prefs: { lastBackup: today } });
    const { pg, q } = o;
    const yday = dayOff(-1);
    ok(await q(() => !document.getElementById('todaywork').classList.contains('on')), 'No jobs yet: home has no "Today\'s work"');
    await q(() => document.getElementById('d-hours').click()); await pg.waitForTimeout(400);
    ok(await q(() => document.getElementById('hours').classList.contains('on') && !!document.getElementById('hr-addjob')), 'Bottom bar "Hours" opens Hours, asking for a first job');
    const addJob = async (name, kind, rate, start, end, extra) => {
      await q(() => document.getElementById('hr-addjob').click()); await pg.waitForTimeout(150);
      await pg.fill('#jb-name', name); if (kind === 'self') await q(() => document.querySelector('[data-kind="self"]').click());
      await pg.fill('#jb-rate', rate); await pg.fill('#jb-start', start); await pg.fill('#jb-end', end);
      if (extra) await q(extra);
      await q(() => document.getElementById('jb-save').click()); await pg.waitForTimeout(200);
    };
    await addJob('Diamond Home Support', 'employed', '15', '09:00', '13:00');
    await addJob('Job 2', 'employed', '13.45', '17:30', '20:30', () => { document.getElementById('jb-email').value = 'boss@example.co.uk'; });
    ok(await q(() => jobs.length === 2 && jobs[0].kind === 'employed' && jobs[0].rate === 15 && jobs[1].rate === 13.45 && !jobs[0].showMoney && !jobs[0].showPay), 'Two jobs added: employed, rates saved, £ and payment off by default');
    await q(() => closeSheet('hours')); await pg.waitForTimeout(400);
    ok(await q(() => !document.getElementById('todaywork').classList.contains('on') && !document.querySelector('#home .tw-row') && !document.getElementById('home').classList.contains('haswork')), 'Home is notes only: no work on it');
    ok(await q(() => document.getElementById('d-hdot').classList.contains('on')), 'Hours button shows a dot while today isn\'t logged');
    await q(() => document.getElementById('d-hours').click()); await pg.waitForTimeout(500);
    ok(await q(() => { const r = document.getElementById('hours').getBoundingClientRect(); return r.top === 0 && Math.abs(r.height - innerHeight) < 2; }), 'Hours is a full screen, not a pop-up');
    ok(await q(() => { const d = document.getElementById('dock').getBoundingClientRect(); const el = document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2); return !!el && !!el.closest('#dock'); }), 'Bottom menu shows on top of Hours');
    ok(await q(() => document.getElementById('d-hours').classList.contains('on') && !document.getElementById('d-write').classList.contains('on')), 'Hours button is lit while on Hours');
    ok(await q(() => getComputedStyle(document.querySelector('#hours .grab .bar')).display === 'none' && !!document.getElementById('back-hours') && getComputedStyle(document.getElementById('s-hours')).display === 'none'), 'No drag handle or dimmed backdrop; Back button there');
    ok(await q(() => document.querySelectorAll('#hr-today .tw-row').length === 2 && document.querySelector('#hr-today .tw-g span').textContent === 'Usual 9:00–13:00 · 4h · £60.00'), 'Hours opens with "Today": each job\'s usual hours and pay');
    await q(() => document.querySelector('[data-twlog]').click()); await pg.waitForTimeout(300);
    ok(await q(t => shifts.length === 1 && shifts[0].date === t && shifts[0].start === '09:00' && document.querySelector('#hr-today .tw-row.done') !== null, today), '"Log it" saves today\'s usual shift with the right date');
    await q(() => document.getElementById('toast-b').click()); await pg.waitForTimeout(200);
    ok(await q(() => shifts.length === 0 && document.querySelectorAll('#hr-today [data-twlog]').length === 2), 'Undo removes it');
    await q(() => document.querySelector('[data-twlog]').click()); await pg.waitForTimeout(300);
    ok(await q(() => document.getElementById('d-hdot').classList.contains('on')), 'Dot stays while the other job isn\'t logged');
    await q(() => document.querySelector('[data-twlog]').click()); await pg.waitForTimeout(300);
    ok(await q(() => !document.getElementById('d-hdot').classList.contains('on')), 'Dot goes once every job is logged today');
    await q(() => { shifts = shifts.filter(s => s.job === jobs[0].id); saveHours(); paintTodayWork(); renderHours(); });
    await q(() => { hoursWeek = -1; renderHours(); });
    ok(await q(() => !document.getElementById('hr-today')), 'Last week: no "Today" section');
    await q(() => { hoursWeek = 0; renderHours(); });
    await q(() => document.getElementById('d-write').click()); await pg.waitForTimeout(400);
    ok(await q(() => !document.getElementById('hours').classList.contains('on') && document.getElementById('d-write').classList.contains('on') && !document.body.classList.contains('in-lists')), 'Write in the bottom menu leaves Hours for home');
    await q(() => document.getElementById('d-hours').click()); await pg.waitForTimeout(400);
    await q(() => document.getElementById('d-lists').click()); await pg.waitForTimeout(400);
    ok(await q(() => !document.getElementById('hours').classList.contains('on') && document.body.classList.contains('in-lists') && document.getElementById('d-lists').classList.contains('on')), 'Lists in the bottom menu leaves Hours for Lists');
    await q(() => document.getElementById('d-hours').click()); await pg.waitForTimeout(400);
    ok(await q(() => document.getElementById('hours').classList.contains('on') && document.getElementById('d-hours').classList.contains('on') && !document.getElementById('d-lists').classList.contains('on')), 'Hours opens from Lists too');
    await q(() => document.getElementById('back-hours').click()); await pg.waitForTimeout(400);
    ok(await q(() => !document.getElementById('hours').classList.contains('on') && document.body.classList.contains('in-lists') && document.getElementById('d-lists').classList.contains('on')), 'Back from Hours returns to where you were');
    await q(() => { showHome(); openHours(); }); await pg.waitForTimeout(400);
    // log by hand: yesterday, 9:00–13:30, 15 min break
    await q(() => openHours()); await pg.waitForTimeout(300);
    await q(() => document.getElementById('hr-log').click()); await pg.waitForTimeout(150);
    await q(y => document.querySelector('[data-lgday="' + y + '"]').click(), yday);
    await pg.fill('#lg-end', '13:30'); await q(() => document.getElementById('lg-end').dispatchEvent(new Event('input')));
    await q(() => document.querySelector('[data-lgbrk="15"]').click()); await pg.waitForTimeout(100);
    ok(await q(() => document.getElementById('lg-total').textContent.includes('4h 15m') && document.getElementById('lg-total').textContent.includes('£63.75')), 'Live total: 4h 15m = £63.75');
    await q(() => document.getElementById('lg-save').click()); await pg.waitForTimeout(200);
    ok(await q(y => shifts.some(s => s.date === y && s.end === '13:30' && s.brk === 15), yday), 'Shift saved for yesterday');
    // mistakes are caught
    await q(() => document.getElementById('hr-log').click()); await pg.waitForTimeout(150);
    await pg.fill('#lg-end', '09:00'); await q(() => document.getElementById('lg-end').dispatchEvent(new Event('input')));
    await q(() => document.getElementById('lg-save').click()); await pg.waitForTimeout(150);
    ok(await q(() => hoursView === 'log' && shifts.length === 2), 'Same start and finish is refused');
    await pg.fill('#lg-start', '22:00'); await pg.fill('#lg-end', '02:00'); await q(() => document.getElementById('lg-end').dispatchEvent(new Event('input')));
    ok(await q(() => document.getElementById('lg-total').textContent.includes('4h') && document.getElementById('lg-total').textContent.includes('past midnight')), 'A shift past midnight counts correctly (22:00–02:00 = 4h)');
    await q(() => { hoursGo('main'); });
    // week strip
    ok(await q(t => { const b = document.querySelector('[data-wkday="' + t + '"] b'); return b && b.textContent === '4'; }, today), 'This week shows today\'s 4 hours');
    // tabs: Week / To send / Sent / Jobs
    ok(await q(() => hoursTab === 'week' && document.querySelectorAll('.ht-tabs button').length === 4 && document.querySelectorAll('.hw-day').length === 7), 'Hours opens on the Week tab with a 7-day chart');
    ok(await q(() => document.querySelector('.ht-tabs [data-htab="send"] i').textContent === '2'), '"To send" tab shows how many shifts are waiting (2)');
    ok(await q(t => { const c = document.querySelector('[data-wkday="' + t + '"] .hw-col i'); return c && c.style.height === '48px'; }, today), 'Bar height matches hours (4h of an 8h day = half height)');
    ok(await q(() => !document.querySelector('.hr-row') && !document.getElementById('hr-me') && !document.getElementById('hr-addjob')), 'Week tab is tidy: no shift list, no job settings');
    await q(() => document.querySelector('[data-gosend]').click()); await pg.waitForTimeout(150);
    ok(await q(() => hoursTab === 'send' && document.querySelectorAll('.hr-row').length === 2 && /Make timesheet/.test(document.getElementById('hr-body').textContent)), 'Tapping a job opens "To send" with its shifts');
    await q(() => document.querySelector('[data-htab="sent"]').click()); await pg.waitForTimeout(150);
    ok(await q(() => /Nothing sent yet/.test(document.getElementById('hr-body').textContent)), 'Sent tab, empty: says nothing sent yet');
    await q(() => document.querySelector('[data-htab="jobs"]').click()); await pg.waitForTimeout(150);
    ok(await q(() => document.querySelectorAll('.hr-job').length === 2 && !!document.getElementById('hr-me')), 'Jobs tab lists jobs and Your details');
    await q(() => document.querySelector('[data-job]').click()); await pg.waitForTimeout(150);
    await q(() => document.getElementById('back-hours').click()); await pg.waitForTimeout(150);
    ok(await q(() => hoursView === 'main' && hoursTab === 'jobs'), 'Back from a job returns to the Jobs tab');
    await q(() => { closeSheet('hours'); openHours(); }); await pg.waitForTimeout(300);
    ok(await q(() => hoursTab === 'week'), 'Opening Hours again starts on Week');
    // complete without a name: asks for your details first
    await q(() => document.querySelector('[data-complete]').click()); await pg.waitForTimeout(200);
    ok(await q(() => hoursView === 'me'), 'Making a timesheet asks for your name first');
    await pg.fill('#me-name', 'Bailey Walsh'); await pg.fill('#me-bank', 'B Walsh\n00-00-00 12345678');
    await q(() => document.getElementById('me-save').click()); await pg.waitForTimeout(150);
    await q(() => document.querySelector('[data-complete]').click()); await pg.waitForTimeout(300);
    let sh = await q(() => sheets[sheets.length - 1]);
    ok(sh.no === 'TS-0001' && sh.kind === 'employed' && sh.rows.length === 2 && sh.mins === 495, 'Complete makes timesheet TS-0001 with both shifts (8h 15m)');
    ok(await q(() => unsentOf(jobs[0].id).length === 0), 'Those shifts are now marked as sent');
    let html = await q(() => sheetHTML(sheets[sheets.length - 1])), text = await q(() => sheetText(sheets[sheets.length - 1]));
    ok(html.includes('TIMESHEET') && html.includes('Bailey Walsh') && html.includes('Diamond Home Support') && html.includes('8.25'), 'Timesheet has title, your name, employer and total 8.25 hours');
    ok(!/£|15\.00|per hour|12345678|Payment/.test(html) && !/£|15\.00|per hour|12345678|Payment/.test(text), 'Employed + switches off: no money, no rate, no bank details — in the email version and the plain one');
    ok(!/class=/.test(html) && !/<style/.test(html), 'Email version is all inline styles (pastes cleanly into Mail/Gmail/Outlook)');
    ok(text.includes('Total hours: 8.25') && text.includes('Submitted by Bailey Walsh'), 'Plain-text version reads correctly');
    // copy for email
    await q(() => document.getElementById('sh-copy').click()); await pg.waitForTimeout(300);
    ok(await q(() => window.__clip && window.__clip.html.includes('TIMESHEET') && window.__clip.text.includes('TIMESHEET TS-0001')), 'Copy for email puts both the formatted and plain version on the clipboard');
    ok(await q(() => sheetSubject(sheets[0]).startsWith('Timesheet TS-0001 — Bailey Walsh — ')), 'Email subject line is ready');
    // sent shifts are locked
    await q(() => logEdit(sheets[0].shiftIds[0])); await pg.waitForTimeout(150);
    ok(await q(() => !document.getElementById('lg-save') && document.getElementById('hr-body').textContent.includes('Already sent on TS-0001')), 'A sent shift can\'t be changed by accident');
    await q(() => hoursGo('main'));
    // £ on, payment on, for Job 2
    await q(() => { jobs[1].showMoney = true; jobs[1].showPay = true; saveHours();
      shifts.push({ id: 'x1', job: jobs[1].id, date: today(), start: '17:30', end: '20:30', brk: 0, sent: null }); saveHours(); renderHours(); });
    await q(id => document.querySelector('[data-complete="' + id + '"]').click(), await q(() => jobs[1].id)); await pg.waitForTimeout(300);
    html = await q(() => sheetHTML(sheets[sheets.length - 1]));
    ok(html.includes('TS-0002') && html.includes('£40.35') && html.includes('Total pay (before tax)') && !html.includes('13.45') && !html.includes('per hour'), '£ switched on: pay and total pay shown, rate still never shown');
    ok(html.includes('12345678'), 'Payment switched on: bank details shown');
    // self-employed invoice
    await q(() => { jobs.push({ id: 'se', name: 'Side job', c: '#8fbf9a', kind: 'self', rate: 20, start: '', end: '', brk: 0, to: 'Acme Ltd', toAddr: '1 High St\nInverness', work: 'Cleaning', email: '', staff: '' });
      shifts.push({ id: 's1', job: 'se', date: today(), start: '10:00', end: '12:20', brk: 0, sent: null }); saveHours(); hoursGo('main'); });
    await q(() => document.querySelector('[data-complete="se"]').click()); await pg.waitForTimeout(300);
    sh = await q(() => sheets[sheets.length - 1]); html = await q(() => sheetHTML(sheets[sheets.length - 1]));
    ok(sh.no === 'INV-0001' && html.includes('INVOICE') && html.includes('Acme Ltd') && html.includes('£20.00 per hour') && html.includes('Total due') && html.includes('Due '), 'Self-employed: full invoice INV-0001 with rate, total due and due date');
    ok(html.includes('2:20') && html.includes('£46.67') && !html.includes('2.33'), '20-minute shifts switch the sheet to h:mm so nothing looks off (2:20 = £46.67)');
    // delete a sheet: shifts go back, number reused
    await q(() => unsend(sheets[sheets.length - 1].id)); await pg.waitForTimeout(150);
    ok(await q(() => unsentOf('se').length === 1 && !sheets.some(x => x.no === 'INV-0001') && Number(prefs.invNo) === 0), 'Deleting a sheet puts its shifts back and frees its number');
    // backup + restore onto a fresh phone
    const backup = await q(() => backupText());
    ok(o.errs.length === 0, 'No JS errors ' + o.errs.join(' | '));
    await o.ctx.close();
    o = await open({ notes: [], prefs: { lastBackup: today } });
    const fs2 = (await import('fs')).default; const tmp = '/tmp/jot-hours-backup.json'; fs2.writeFileSync(tmp, backup);
    await o.q(() => document.getElementById('h-more').click()); await o.pg.waitForTimeout(400);
    o.pg.once('filechooser', fc => fc.setFiles(tmp));
    await o.q(() => document.getElementById('rs').click()); await o.pg.waitForTimeout(500);
    await o.q(() => document.getElementById('dlg-yes').click()); await o.pg.waitForTimeout(500);
    ok(await o.q(() => jobs.length === 3 && shifts.length === 4 && sheets.length === 2 && prefs.me.name === 'Bailey Walsh' && Number(prefs.tsNo) === 2), 'Backup and restore bring back jobs, shifts, sent sheets, your details and numbering');
    ok(o.errs.length === 0, 'No JS errors after restore ' + o.errs.join(' | '));
    await o.ctx.close();
    // home still fits with two jobs
    const two = [{ id: 'a', name: 'Diamond Home Support', c: '#7fb4e0', kind: 'employed', rate: 15, start: '09:00', end: '13:00', brk: 0 }, { id: 'b', name: 'Job 2', c: '#e0a458', kind: 'employed', rate: 13.45, start: '17:30', end: '20:30', brk: 0 }];
    for (const [name, w, h, ins] of [['iPhone SE', 375, 667, ['20px', '0px']], ['iPhone mini', 375, 812, ['47px', '34px']], ['iPhone 13/14', 390, 844, ['47px', '34px']], ['Pro Max', 430, 932, ['47px', '34px']]]) {
      const f = await open({ w, h, insets: ins, notes: [{ id: 'a', text: 'Pay council tax', type: 'todo', done: false, ts: 1, due: dayOff(-3) }], prefs: { lastBackup: today } });
      await f.q(j => { localStorage.setItem('jot:jobs', JSON.stringify(j)); }, two); await f.pg.reload(); await f.pg.waitForTimeout(500);
      const r = await f.q(() => ({ rows: document.querySelectorAll('#home .tbtn').length >= 5 && !document.getElementById('home').classList.contains('haswork') ? 2 : 0, ups: document.querySelectorAll('#sum-t .ur').length, sum: document.getElementById('summary').getBoundingClientRect().bottom, dock: document.getElementById('dock').getBoundingClientRect().top, wide: document.documentElement.scrollWidth <= innerWidth }));
      ok(r.rows === 2 && r.ups >= 1 && r.wide && (name === 'iPhone SE' || r.sum <= r.dock), name + ' with 2 jobs: big buttons stay, no work on home' + (name === 'iPhone SE' ? ' (scrolls a little on the smallest phone)' : ', Up next clear of the bottom bar'));
      await f.ctx.close();
    }
  },
  // ------------------------------------------------------------------
  async moved() {   // Jot moved to a new web address (GitHub Pages, in a sub-folder, plain files only)
    const http = (await import('http')).default;
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
    const misses = [];
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://localhost');
      if (!u.pathname.startsWith('/jot/')) { misses.push(u.pathname); res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>404</h1>'); return; }
      const rel = u.pathname.slice(5) || 'index.html';
      const f = path.join(APP, rel);
      if (!fs.existsSync(f)) { misses.push(u.pathname); res.writeHead(404, { 'content-type': 'text/html' }); res.end('<h1>404</h1>'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
    });
    await new Promise(r => server.listen(8766, r));
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const q = (f, a) => pg.evaluate(f, a);
    await pg.goto('http://localhost:8766/jot/');
    // what a restored backup from the old address looks like: a locked section with Face ID made elsewhere
    await q(async () => { localStorage.clear(); localStorage.setItem('jot:notes', JSON.stringify([{ id: 'n', text: 'Milk', type: 'shopping', done: false, ts: 1 }]));
      localStorage.setItem('jot:prefs', JSON.stringify({ lastBackup: '2099-01-01' })); });
    await pg.reload(); await pg.waitForTimeout(800);
    ok(await q(() => document.querySelectorAll('#typegrid .tbtn').length === 5 && !!navigator.serviceWorker), 'Jot opens fine from a sub-folder (/jot/)');
    await q(() => navigator.serviceWorker.ready); await pg.waitForTimeout(300);
    ok(!misses.filter(m => m !== '/favicon.ico').some(m => /icon|manifest|sw\.js|index/.test(m)), 'Every app file loads from the new address (no missing icons, manifest or background part)');
    await q(async () => { await createVault('1234'); vaultItems = [{ id: 'a', label: 'Door', secret: '2580' }]; await saveVault();
      const m = JSON.parse(localStorage.getItem('jot:vault')); m.bio = { cred: 'AAAA', salt: 'AAAA', pin: { iv: 'AAAA', ct: 'AAAA' } }; localStorage.setItem('jot:vault', JSON.stringify(m)); lockVault(); });
    await q(() => document.getElementById('h-lock').click()); await pg.waitForTimeout(400);
    ok(await q(() => !JSON.parse(localStorage.getItem('jot:vault')).bio && !document.getElementById('v-face') && document.getElementById('v-body').textContent.includes('Face ID needs turning on again')), 'Old Face ID from before the move is switched off, with a clear note');
    for (const d of '1234') { await q(x => document.querySelector('#v-pinwrap [data-d="' + x + '"]').click(), d); await pg.waitForTimeout(40); }
    await pg.waitForTimeout(1600);
    ok(await q(() => !!vaultKey && vaultItems.length === 1 && vaultItems[0].secret === '2580'), 'Code still unlocks, and the locked items came across intact');
    // set Face ID up again here
    const cdp = await ctx.newCDPSession(pg); await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });
    await q(() => { vaultView = 'settings'; renderVault(); const t = document.getElementById('v-biotog'); t.checked = true; t.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(400);
    for (const d of '1234') { await q(x => document.querySelector('#v-pinwrap [data-d="' + x + '"]').click(), d); await pg.waitForTimeout(40); }
    await pg.waitForTimeout(1600);
    await q(() => document.getElementById('v-biogo').click()); await pg.waitForTimeout(1500);
    ok(await q(() => { const b = JSON.parse(localStorage.getItem('jot:vault')).bio; return !!b && b.host === location.host; }), 'Face ID set up again, tied to the new address');
    await q(() => { lockVault(); closeSheet('vault'); }); await pg.waitForTimeout(400);
    await q(() => document.getElementById('h-lock').click()); await pg.waitForTimeout(2000);
    ok(await q(() => !!vaultKey && !document.getElementById('v-body').textContent.includes('needs turning on again')), 'Face ID unlocks on the new address, note gone');
    await q(() => { lockVault(); closeSheet('vault'); }); await pg.waitForTimeout(300);
    // notifications: no helper here
    await q(() => { paintMore(); openSheet('more'); }); await pg.waitForTimeout(800);
    ok(await q(() => document.getElementById('push-state').textContent.startsWith('Not available here')), 'Settings says notifications aren\'t available here (plain-files host), instead of failing');
    await q(() => { const t = document.getElementById('t-push'); t.checked = true; t.dispatchEvent(new Event('change')); }); await pg.waitForTimeout(400);
    ok(await q(() => !document.getElementById('t-push').checked && JSON.parse(localStorage.getItem('jot:prefs')).push !== true), 'Tapping it explains instead of turning on something that can\'t work');
    ok(await q(() => { closeSheet('more'); notes.push({ id: 'r', text: 'Dentist', type: 'todo', done: false, ts: 2, due: '2099-01-02', dueTime: '10:00', remind: 0 }); lsSet(K.notes, notes); openEdit('r');
      return !document.getElementById('e-pushnote').classList.contains('on') && document.getElementById('e-phone-t').textContent === 'Remind me on my phone'; }), 'Edit page offers the Calendar route, no promise of a buzz');
    ok(errs.length === 0, 'No JS errors ' + errs.join(' | '));
    await ctx.close(); server.close();
  },
  // ------------------------------------------------------------------
  async backup() {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: 'n' + i, text: 'Note ' + i, type: 'todo', done: false, ts: i }));
    // share sheet available, user saves
    const shareOK = () => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = d; }; };
    let o = await open({ init: shareOK, notes: many, prefs: { lastBackup: dayOff(-9) } });
    ok(await o.q(() => document.getElementById('h-backup').classList.contains('warn')), '9 days since backup: amber warning on home');
    await o.pg.click('#h-more'); await o.pg.waitForTimeout(400);
    ok(await o.q(() => document.getElementById('bk-note').textContent.includes('9 days ago')), 'Settings shows "Last backup 9 days ago"');
    await o.q(() => document.getElementById('bk').click()); await o.pg.waitForTimeout(300);
    const sh = await o.q(async () => { const f = window.__shared && window.__shared.files && window.__shared.files[0]; if (!f) return null; const d = JSON.parse(await f.text()); return { name: f.name, notes: d.notes.length, jot: d.__jot }; });
    ok(sh && sh.name === 'jot-backup.json' && sh.notes === 8 && sh.jot === 5, 'Backup goes to the share sheet as jot-backup.json with every note');
    ok(await o.q(() => JSON.parse(localStorage.getItem('jot:prefs')).lastBackup === (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()), 'Saving marks today as backed up');
    ok(await o.q(() => !document.getElementById('h-backup').classList.contains('on')), 'Warning clears after backing up');
    ok(o.errs.length === 0, 'No JS errors ' + o.errs.join(' | '));
    await o.ctx.close();
    // user closes the share sheet without saving
    const shareCancel = () => { navigator.canShare = () => true; navigator.share = async () => { const e = new Error('x'); e.name = 'AbortError'; throw e; }; };
    o = await open({ init: shareCancel, notes: many, prefs: { lastBackup: dayOff(-20) } });
    ok(await o.q(() => document.getElementById('h-backup').classList.contains('red')), '20 days since backup: red warning');
    await o.pg.click('#h-backup'); await o.pg.waitForTimeout(300);
    ok(await o.q(d => JSON.parse(localStorage.getItem('jot:prefs')).lastBackup === d, dayOff(-20)), 'Closing the share sheet does not count as a backup');
    await o.ctx.close();
    // no share sheet (older phone / desktop): falls back to a download
    const noShare = () => { delete Navigator.prototype.share; delete Navigator.prototype.canShare; };
    o = await open({ init: noShare, notes: many });
    ok(await o.q(() => document.getElementById('h-backup').classList.contains('red')), 'Never backed up: red warning');
    const dl = o.pg.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await o.pg.click('#h-more'); await o.pg.waitForTimeout(400); await o.q(() => document.getElementById('bk').click());
    const d = await dl;
    ok(d && d.suggestedFilename() === 'jot-backup.json', 'Without a share sheet it downloads jot-backup.json');
    // restore round trip still works
    const file = d ? await d.path() : null;
    if (file) {
      await o.q(() => { notes = []; lsSet(K.notes, notes); render(); });
      o.pg.once('filechooser', fc => fc.setFiles(file));
      await o.q(() => document.getElementById('rs').click()); await o.pg.waitForTimeout(500);
      await o.pg.click('#dlg-yes').catch(() => {}); await o.pg.waitForTimeout(400);
      ok((await o.saved()).length === 8, 'Restoring that backup brings every note back');
    } else ok(false, 'Restoring that backup brings every note back');
    ok(o.errs.length === 0, 'No JS errors ' + o.errs.join(' | '));
    await o.ctx.close();
  },

  // ------------------------------------------------------------------
  async sync() {
    // A pretend GitHub for the private jot-sync repo. The app talks to
    // api.github.com; everything else is served from localhost as usual.
    const gh = { pack: null, sha: 'sha-1', puts: [], failAuth: false };
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64');
    const unb64 = s => JSON.parse(Buffer.from(s, 'base64').toString('utf8'));
    async function openSync({ notes = [], prefs = {}, remote = null, token = 'test-token' } = {}) {
      gh.pack = remote; gh.sha = 'sha-1'; gh.puts = []; gh.failAuth = false;
      const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
      const pg = await ctx.newPage();
      const errs = []; pg.on('pageerror', e => errs.push(e.message));
      const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
      await pg.route('**/*', r => {
        const u = new URL(r.request().url());
        if (u.hostname === 'api.github.com') {
          if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, accept' }, body: '' });
          if (gh.failAuth) return r.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"message":"Bad credentials"}' });
          if (r.request().method() === 'GET') {
            if (!gh.pack) return r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"message":"Not Found"}' });
            return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ sha: gh.sha, content: b64(gh.pack) }) });
          }
          if (r.request().method() === 'PUT') {
            const body = JSON.parse(r.request().postData());
            gh.puts.push({ auth: r.request().headers().authorization, body });
            if (body.sha && body.sha !== gh.sha) return r.fulfill({ status: 409, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"message":"conflict"}' });
            gh.pack = unb64(body.content); gh.sha = 'sha-' + (gh.puts.length + 1);
            return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ content: { sha: gh.sha } }) });
          }
          return r.fulfill({ status: 405, body: '' });
        }
        if (u.hostname !== 'localhost') return r.abort();
        if (u.pathname === '/') return r.fulfill({ body: html, contentType: 'text/html' });
        const f = path.join(APP, u.pathname);
        if (!fs.existsSync(f)) return r.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' });
        return r.fulfill({ path: f });
      });
      await pg.addInitScript(({ notes, prefs, token }) => {
        localStorage.clear();
        localStorage.setItem('jot:notes', JSON.stringify(notes));
        localStorage.setItem('jot:kinds', JSON.stringify({ shopping: [], todo: [], remember: [], question: [], idea: [] }));
        localStorage.setItem('jot:prefs', JSON.stringify(prefs));
        if (token) localStorage.setItem('jot:sync-token', JSON.stringify(token));
      }, { notes, prefs, token });
      await pg.goto('http://localhost/');
      await pg.waitForTimeout(500);
      const q = (f, a) => pg.evaluate(f, a);
      const saved = () => pg.evaluate(() => JSON.parse(localStorage.getItem('jot:notes')));
      return { pg, ctx, errs, q, saved };
    }
    const now = Date.now();
    const local1 = { id: 'a1', text: 'Milk', type: 'shopping', done: false, ts: now };
    const museNote = { id: 'm1', text: 'Buy oat milk — from Muse', type: 'shopping', done: false, ts: now - 1000 };
    const remotePack = { __jotSync: 1, version: 5, updatedAt: new Date().toISOString(), updatedBy: 'muse', notes: [museNote], kinds: {}, tags: [], again: {}, custom: {} };

    // Off by default: Settings shows the sync section, switched off.
    let o = await openSync({ notes: [local1], prefs: { lastBackup: today } });
    await o.pg.click('#h-more'); await o.pg.waitForTimeout(400);
    ok(await o.q(() => !!document.getElementById('t-sync')), 'Settings has a Sync with Muse switch');
    ok(await o.q(() => !document.getElementById('t-sync').checked), 'Sync is off by default');
    ok(await o.q(() => document.getElementById('sync-state').textContent.indexOf('Off') === 0), 'Status says Off');
    ok(await o.q(() => document.getElementById('sync-setup').style.display === 'none'), 'Token box hidden while off');
    ok(o.errs.length === 0, 'No JS errors with sync off ' + o.errs.join(' | '));
    await o.ctx.close();

    // On, with a remote note from Muse: opening the app pulls it in and
    // pushes this phone's note up, merged — nothing lost either way.
    o = await openSync({ notes: [local1], prefs: { lastBackup: today, syncEnabled: true }, remote: remotePack });
    await o.pg.waitForTimeout(3500);   // auto-sync on open (2s) + round trip
    let got = await o.saved();
    ok(got.some(x => x.id === 'm1'), 'A note Muse added appears in Jot after opening');
    ok(got.some(x => x.id === 'a1'), 'This phone’s note is still there after the merge');
    ok(gh.puts.length >= 1, 'The merged copy was pushed back to the private repo');
    const lastPut = gh.puts.length ? unb64(gh.puts[gh.puts.length - 1].body.content) : null;
    ok(lastPut && lastPut.__jotSync === 1 && lastPut.notes.some(x => x.id === 'm1') && lastPut.notes.some(x => x.id === 'a1'), 'Pushed file has both notes');
    ok(lastPut && !('vault' in lastPut) && !('jobs' in lastPut), 'Synced file has no vault and no hours');
    ok(gh.puts.every(p => p.auth === 'Bearer test-token'), 'Every sync call carries the token, nothing else');
    ok(gh.puts.every(p => JSON.stringify(p.body).indexOf('test-token') < 0 || JSON.stringify(p.body.content || '').indexOf('test-token') < 0), 'The token is never written into the synced file');
    ok(await o.q(() => document.getElementById('sync-state').textContent.indexOf('Last synced') === 0), 'Status shows Last synced');
    ok(o.errs.length === 0, 'No JS errors after auto-sync ' + o.errs.join(' | '));

    // A note added on the phone reaches the repo on Sync now.
    await o.q(() => { addText('todo', 'Call dentist'); });
    await o.q(() => window.__jotSync.now({ manual: true }));
    await o.pg.waitForTimeout(600);
    ok(gh.pack.notes.some(x => x.text === 'Call dentist'), 'A note added on the phone is in the repo after Sync now');

    // Deleting on the phone deletes in the repo — but only because the
    // remote copy had not changed it.
    await o.q(() => { notes = notes.filter(n => n.id !== 'a1'); lsSet(K.notes, notes); render(); });
    await o.q(() => window.__jotSync.now({ manual: true }));
    await o.pg.waitForTimeout(600);
    ok(!gh.pack.notes.some(x => x.id === 'a1'), 'A note deleted on the phone is gone from the repo too');
    ok(gh.pack.notes.some(x => x.id === 'm1'), 'Deleting one note does not take the others with it');

    // Merge rules, as pure function checks (no network).
    // Changed on one side only: that side wins.
    const merged = (await o.q(() => {
      const h = n => { let x = 5381; const s = JSON.stringify(n); for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(36); };
      const loc = { __jotSync: 1, version: 2, notes: [{ id: 'x1', text: 'One edited here', type: 'todo', done: false, ts: 100, upd: 500 }, { id: 'x2', text: 'Two', type: 'todo', done: false, ts: 200 }], kinds: {}, tags: [], again: {}, custom: {} };
      const rem = { __jotSync: 1, version: 3, notes: [{ id: 'x1', text: 'One', type: 'todo', done: false, ts: 100 }, { id: 'x2', text: 'Two edited there', type: 'todo', done: false, ts: 200, upd: 600 }], kinds: {}, tags: [], again: {}, custom: {} };
      const sn = { notes: { x1: h({ id: 'x1', text: 'One', type: 'todo', done: false, ts: 100 }), x2: h({ id: 'x2', text: 'Two', type: 'todo', done: false, ts: 200 }) }, kinds: '', tags: '', again: '', custom: '' };
      return window.__jotSync.merge(loc, rem, sn);
    }));
    ok(merged.pack.notes.find(n => n.id === 'x1').text === 'One edited here', 'Note changed only on the phone keeps the phone copy');
    ok(merged.pack.notes.find(n => n.id === 'x2').text === 'Two edited there', 'Note changed only remotely keeps the remote copy');
    const both = (await o.q(() => {
      const loc = { __jotSync: 1, version: 2, notes: [{ id: 'x1', text: 'Older edit', type: 'todo', done: false, ts: 100, upd: 500 }], kinds: {}, tags: [], again: {}, custom: {} };
      const rem = { __jotSync: 1, version: 3, notes: [{ id: 'x1', text: 'Newer edit', type: 'todo', done: false, ts: 100, upd: 900 }], kinds: {}, tags: [], again: {}, custom: {} };
      const sn = { notes: {}, kinds: '', tags: '', again: '', custom: '' };
      // snapshot with the original hash, so both sides count as changed
      const h = n => { let x = 5381; const s = JSON.stringify(n); for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(36); };
      sn.notes = { x1: h({ id: 'x1', text: 'Original', type: 'todo', done: false, ts: 100 }) };
      return window.__jotSync.merge(loc, rem, sn);
    }));
    ok(both.pack.notes[0].text === 'Newer edit', 'Same note changed both ways keeps the newer copy');
    ok(both.conflicts.length === 1, 'Both-ways change is reported as a conflict, not hidden');

    // A bad token fails cleanly and says so in Settings.
    await o.q(() => { localStorage.setItem('jot:sync-token', JSON.stringify('wrong-token')); });
    gh.failAuth = true;
    const res = await o.q(() => window.__jotSync.now({ manual: true }));
    ok(res && res.ok === false && res.reason === 'auth', 'A rejected token returns auth, not a crash');
    ok(await o.q(() => document.getElementById('sync-state').textContent.indexOf('did not accept the token') >= 0), 'Settings says the token was not accepted');
    ok((await o.saved()).some(x => x.id === 'm1'), 'A failed sync never wipes local notes');
    ok(o.errs.length === 0, 'No JS errors after a failed sync ' + o.errs.join(' | '));
    await o.ctx.close();

    // The token is never in a backup file.
    o = await openSync({ notes: [local1], prefs: { lastBackup: today, syncEnabled: true }, remote: remotePack });
    ok(await o.q(() => backupText().indexOf('test-token') < 0), 'Backup file never contains the token');
    ok(await o.q(() => backupText().indexOf('jot:sync-token') < 0), 'Backup file never mentions the token key');
    await o.ctx.close();
  }
};

for (const [name, fn] of Object.entries(SUITES)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  console.log('\n' + name);
  try { await fn(); } catch (e) { fail++; console.log('  FAIL suite crashed: ' + e.message.split('\n')[0]); }
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
