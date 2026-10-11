const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(prefix = 'session') {
  const context = vm.createContext({ window: {}, localStorage: { getItem() { return null; }, setItem() {} },
    document: { getElementById() { return null; }, addEventListener() {}, removeEventListener() {},
      createElement() { throw new Error('A component view must not create DOM nodes'); } } });
  for (const file of ['stat-availability', 'scoreboard', 'profile', 'quick-comparison']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../js/${file}.js`), 'utf8'), context);
  }
  let model;
  const controller = context.window.NickStatsQuickComparison.create({ prefix, onUpdate: value => { model = value; } });
  const input = { players: [
    { id: '1', label: 'Nick', rows: [{ map: 'de_dust2', kills: 10 }, { map: 'de_mirage', kills: 20 }] },
    { id: '2', label: 'Friend', rows: [{ map: 'de_dust2', kills: 5 }] }
  ], summarize: rows => ({ rounds: rows.length * 10, kills: rows.reduce((sum, row) => sum + row.kills, 0), deaths: rows.length * 5,
    assists: rows.length * 2, rating: 1.2, kast: 70, winRate: 50, damage: rows.length * 1000, kd: 2, adr: 100 }) };
  controller.render(input);
  return { controller, input, context, get model() { return model; } };
}

for (const prefix of ['player', 'combo', 'session']) {
test(`${prefix} component view preserves rows, rating colors, map filters and stable sorting`, () => {
  const app = setup(prefix);
  assert.deepEqual(Array.from(app.model.rows, row => row.id), ['1', '2']);
  assert.match(app.model.rows[0].cells.find(cell => cell.key === 'rating').className, /rating-good/);
  app.model.actions.sort(app.model.columns.find(column => column.key === 'player'));
  assert.deepEqual(Array.from(app.model.rows, row => row.id), ['2', '1']);
  app.model.actions.map('de_mirage');
  assert.match(app.model.meta, /0–1 qualifying matches/);
  assert.equal(app.model.rows.find(row => row.id === '1').cells.find(cell => cell.key === 'combat').text, '20-5-2');
});

test(`${prefix} component controls retain per-round counts and group/subgroup column alignment`, () => {
  const app = setup(prefix);
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

}

test('Player comparison retains per-profile summarizers when maps change', () => {
  const app = setup('player'), calls = [];
  app.input.players[0].summarize = (rows, map) => {
    calls.push({ count: rows.length, map });
    return { ...app.input.summarize(rows), rating: map === 'de_mirage' ? 1.8 : 1.1 };
  };
  app.controller.render(app.input);
  app.model.actions.map('de_mirage');
  assert.deepEqual(calls, [{ count: 2, map: 'ALL' }, { count: 1, map: 'de_mirage' }]);
  assert.equal(app.model.rows.find(row => row.id === '1').cells.find(cell => cell.key === 'rating').text, '1.80');
});

test('Group reset clears map and value controls before rebuilding a selection', () => {
  const app = setup('combo');
  app.model.actions.map('de_mirage');
  app.model.actions.valueMode('round');
  app.controller.reset();
  app.controller.render(app.input);
  assert.equal(app.model.map, 'ALL');
  assert.equal(app.model.valueMode, 'totals');
  assert.equal(app.model.rows.find(row => row.id === '1').cells.find(cell => cell.key === 'combat').text, '30-10-4');
});

test('controlled stat models do not mutate React state or inherit another view settings', () => {
  const app = setup('player');
  const state = Object.freeze({ map: 'de_mirage', valueMode: 'round', perGrenadeUtility: false, sort: null,
    expandedGroups: Object.freeze({ combat: true }), sectionSubgroups: Object.freeze({}), visibleSections: new Set(['overview']) });
  const model = app.context.window.NickStatsQuickComparison.model(app.input, state);
  assert.equal(model.map, 'de_mirage');
  assert.equal(model.valueMode, 'round');
  assert.equal(model.rows.find(row => row.id === '1').cells.find(cell => cell.key === 'combat-k').text, '2.00');
  assert.equal(model.actions, undefined, 'React supplies events separately from stat computation');
  const missing = app.context.window.NickStatsQuickComparison.model({ ...app.input, players: [] }, state);
  assert.equal(missing.map, 'ALL');
  assert.equal(state.map, 'de_mirage', 'missing maps do not mutate reducer snapshots');
  assert.equal(state.expandedGroups.combat, true);
});
