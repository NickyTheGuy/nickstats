const fs = require('node:fs');
const path = require('node:path');

// Inspect the stylesheet source in entry order, regardless of file boundaries
// or whitespace chosen by the formatter.
module.exports = function styles() {
  const root = path.join(__dirname, '../../frontend/styles');
  const entry = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
  return [...entry.matchAll(/@import ['"](.+?)['"]/g)]
    .map(([, file]) => fs.readFileSync(path.join(root, file), 'utf8'))
    .join('\n')
    .replace(/'/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')');
};
