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
test(`${prefix} scales raw composite counters across thousands separators and keeps rates unchanged`, () => {
  const app = setup(prefix);
  for (const locale of ['en-US', 'de-DE', 'fr-FR', 'ar-EG']) {
    app.context.window.NickStatsProfile = { ...app.context.window.NickStatsProfile,
      integer: value => Math.round(Number(value) || 0).toLocaleString(locale) };
    for (const [kills, deaths] of [[1125,1036], [970,1012], [999,999], [1000,1], [0,0]]) {
      const stats = { __schema: 'nickstats.match/27', rounds: 2000, timed_rounds: 2000,
        kills, deaths, assists: 1001, mid_kills: kills, mid_deaths: deaths,
        kill_time_samples: 10, kill_time_total_ms: 250000,
        death_time_samples: 10, death_time_total_ms: 300000,
        trade_kills: kills, traded_deaths: deaths, trade_attempts:2000, attempted_tradeable_deaths:2000,
        clawback_kills: kills, bozo_deaths: deaths,
        enemy_alive_5_kills: kills, enemy_alive_5_deaths: deaths, enemy_alive_1_kills: deaths,
        unfair_kills: kills, unfair_deaths: deaths,
        blinded_kills: kills, deaths_while_blind: deaths,
        moving_kills: kills, moving_killer_deaths: deaths, running_kills: deaths, airborne_kills: 1001,
        bomb_plants: kills, bomb_defuses: deaths,
        he_damage: kills, fire_damage: deaths, he_grenades_thrown: 1001,
        opening_kills: kills, opening_deaths: deaths, openingAttemptRate: 40,
        clutch_1v1: kills, clutch_attempt_1v1: 2000 };
      const input = { players: [{ id:'1', label:'Sample', rows:Array.from({length:4}, () => ({schema:'nickstats.match/27'})) }],
        summarize: () => stats };
      const render = (mode, expandedGroups = {}) => app.context.window.NickStatsQuickComparison.model(input, {
        map:'ALL', valueMode:mode, expandedGroups, sectionSubgroups:{},
        visibleSections:new Set(['overview','opening','trades','rounds','roundState','context','movement','utility'])
      });
      const text = (model, key) => model.rows[0].cells.find(cell => cell.key === key)?.text;
      const localizedPair = `${kills.toLocaleString(locale)}-${deaths.toLocaleString(locale)}`;
      assert.equal(text(render('totals', {timing:true}), 'timing-mid'), localizedPair);
      for (const mode of ['round','match']) {
        const denominator = mode === 'round' ? 2000 : 4;
        const rate = value => (value / denominator).toFixed(2);
        const pair = `${rate(kills)}-${rate(deaths)}`;
        const collapsed = render(mode);
        for (const key of ['trades','round-state','kill-context']) assert.equal(text(collapsed,key), pair, `${locale} ${mode} ${key}`);
        assert.equal(text(collapsed,'combat'), `${pair}-${rate(1001)}`);
        assert.equal(text(collapsed,'objectives'), `${rate(kills)}/${rate(deaths)}`);
        assert.equal(text(collapsed,'kill-stage-summary'), `${rate(kills)}/${rate(deaths)}`);
        assert.equal(text(collapsed,'movement'), `${rate(kills)}/${rate(deaths)}/${rate(1001)}`);
        assert.equal(text(collapsed,'utility'), `${rate(kills+deaths)} dmg · ${rate(1001)} thrown`);
        assert.equal(text(collapsed,'opening'), `${pair} · 40.0%`);
        assert.equal(text(collapsed,'clutches'), `${rate(kills)}/${rate(2000)} · ${(100*kills/2000).toFixed(1)}%`);
        assert.equal(text(collapsed,'timing'), '25.0s/30.0s');
        const expanded = render(mode,{timing:true,roundState:true,killStage:true,killContext:true,movement:true});
        for (const key of ['timing-mid','context-clawback-bozo','enemy-alive-5','context-enemy-blind','movement-moving']) {
          assert.equal(text(expanded,key),pair,`${locale} ${mode} ${key}`);
        }
        assert.equal(text(expanded,'timing-kill'),'25.0s');
        assert.equal(text(expanded,'timing-death'),'30.0s');
        const results = render(mode,{trades:true,clutches:true});
        assert.equal(text(results,'trade-kills'),`${rate(kills)} (${(100*kills/2000).toFixed(1)}%)`);
        assert.equal(text(results,'traded-deaths'),`${rate(deaths)} (${(100*deaths/2000).toFixed(1)}%)`);
        assert.equal(text(results,'clutch-1'),`${rate(kills)}/${rate(2000)} · ${(100*kills/2000).toFixed(1)}%`);
      }
      stats.timed_rounds = 0;
      assert.equal(text(render('round',{timing:true}),'timing-mid'),'—');
      stats.rounds = 0;
      assert.equal(text(render('round'),'combat'),'—');
    }
  }
});
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
