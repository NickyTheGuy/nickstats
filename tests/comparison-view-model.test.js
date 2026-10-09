const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  const context = vm.createContext({ window: {}, localStorage: { getItem() { return null; }, setItem() {} },
    document: { getElementById() { return null; }, addEventListener() {}, removeEventListener() {},
      createElement() { throw new Error('A component view must not create DOM nodes'); } } });
  for (const file of ['stat-availability', 'scoreboard', 'profile', 'quick-comparison']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${file}.js`), 'utf8'), context);
  }
  let model;
  const controller = context.window.NickStatsQuickComparison.create({ prefix: 'session', onUpdate: value => { model = value; } });
  const input = { players: [
    { id: '1', label: 'Nick', rows: [{ map: 'de_dust2', kills: 10 }, { map: 'de_mirage', kills: 20 }] },
    { id: '2', label: 'Friend', rows: [{ map: 'de_dust2', kills: 5 }] }
  ], summarize: rows => ({ rounds: rows.length * 10, kills: rows.reduce((sum, row) => sum + row.kills, 0), deaths: rows.length * 5,
    assists: rows.length * 2, rating: 1.2, kast: 70, winRate: 50, damage: rows.length * 1000, kd: 2, adr: 100 }) };
  controller.render(input);
  return { controller, input, get model() { return model; } };
}

test('component view preserves rows, rating colors, map filters and stable sorting', () => {
  const app = setup();
  assert.deepEqual(Array.from(app.model.rows, row => row.id), ['1', '2']);
  assert.match(app.model.rows[0].cells.find(cell => cell.key === 'rating').className, /rating-good/);
  app.model.actions.sort(app.model.columns.find(column => column.key === 'player'));
  assert.deepEqual(Array.from(app.model.rows, row => row.id), ['2', '1']);
  app.model.actions.map('de_mirage');
  assert.match(app.model.meta, /0–1 qualifying matches/);
  assert.equal(app.model.rows.find(row => row.id === '1').cells.find(cell => cell.key === 'combat').text, '20-5-2');
});

test('component controls retain per-round counts and group/subgroup column alignment', () => {
  const app = setup();
  app.model.actions.valueMode('round');
  assert.equal(app.model.rows[0].cells.find(cell => cell.key === 'combat').text, '1.50-0.50-0.20');
  app.model.actions.toggle('combat');
  const heading = app.model.headings.find(heading => heading.group === 'combat');
  assert.equal(heading.columns.length, 5);
  assert.equal(heading.columns[0].label, 'K / round');
  assert.equal(heading.columns[0].group, 'combat');
  app.model.actions.cycle('combat');
  assert.equal(app.model.headings.find(heading => heading.group === 'combat').title, 'Damage');
  assert.equal(app.model.columns.length, app.model.rows[0].cells.length);
  app.model.actions.sections(['utility']);
  assert.deepEqual(Array.from(app.model.headings.filter(heading => heading.group), heading => heading.group), ['utility']);
  app.controller.destroy();
});
