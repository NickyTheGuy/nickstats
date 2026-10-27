const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('React controls replace the native-select adapter and global touch interception', () => {
  assert.doesNotMatch(read('index.html'), /js\/dropdown\.js/);
  assert.equal(fs.existsSync(path.join(__dirname, '../js/dropdown.js')), false);
  for (const file of ['frontend/shared/components/forms/Dropdown.jsx', 'frontend/shared/components/forms/OptionDropdown.jsx']) {
    assert.doesNotMatch(read(file), /touchstart|touchend|\.click\(\)/);
  }
});

test('option dropdown uses shared buttons and skips disabled options during keyboard navigation', () => {
  const source = read('frontend/shared/components/forms/OptionDropdown.jsx');
  assert.match(source, /<Button/);
  assert.match(source, /button:not\(:disabled\)/);
  assert.match(source, /ArrowDown[\s\S]*ArrowUp[\s\S]*Home[\s\S]*End/);
  assert.match(source, /if \(options\.find[\s\S]*disabled\) return/);
});

test('dropdowns dismiss outside pointer presses and restore focus on Escape', () => {
  const source = read('frontend/shared/components/forms/Dropdown.jsx');
  assert.match(source, /addEventListener\('pointerdown', dismiss, true\)/);
  assert.match(source, /contains\(event\.target\)/);
  assert.match(source, /removeEventListener\('pointerdown', dismiss, true\)/);
  assert.match(source, /event\.key !== 'Escape'/);
  assert.match(source, /querySelector\('summary'\)\.focus\(\)/);
});
