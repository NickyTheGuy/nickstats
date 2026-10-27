const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('HTML is a static app shell and all interactive elements are owned by React', () => {
  assert.doesNotMatch(read('index.html'), /<(?:button|input|select|dialog|details)\b/);
  assert.ok(read('index.html').indexOf('./assets/ui/nickstats-ui.js') < read('index.html').indexOf('./js/navigation.js'));
  for (const file of ['players', 'groups', 'profile', 'quick-comparison', 'scoreboard', 'navigation']) {
    assert.doesNotMatch(read(`js/${file}.js`), /createElement|replaceChildren|innerHTML|textContent\s*=/);
  }
});

test('Player and Group profile layouts share stable, labeled section panels without DOM cloning', async () => {
  const { sectionTabs } = await import('../frontend/state/section-tabs.mjs');
  for (const prefix of ['player', 'combo']) {
    const source = require('./helpers/profile-template')(prefix);
    const panels = [...source.matchAll(/id="([^"]+)" role="tabpanel" aria-labelledby=\{`([^`]+)`\}/g)];
    assert.equal(panels.length, 12);
    for (const [key, , config] of sectionTabs(prefix).options) {
      const props = config.tabProps;
      const panel = panels.find(([, id]) => id === props['aria-controls']);
      assert.ok(panel, key); assert.equal(panel[2], props.id);
    }
  }
  assert.doesNotMatch(read('js/profile.js'), /cloneNode/);
});
