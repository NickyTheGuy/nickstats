const fs = require('node:fs');
const path = require('node:path');
// Normalize parameterized JSX identifiers for the layout's structural assertions.
module.exports = function profileTemplate(prefix = 'player') {
  return fs.readFileSync(path.join(__dirname, '../../frontend/profile-layout.jsx'), 'utf8')
    .replaceAll('${prefix}', prefix).replace(/id=\{`([^`]+)`\}/g, 'id="$1"').replaceAll('className=', 'class=')
    .replace(/\{\.\.\.\{\[prefix === "player" \? "data-player-profile-view" : "data-combo-profile-panel"\]: "([^"]+)"\}\}/g,
      `data-${prefix === 'player' ? 'player-profile-view' : 'combo-profile-panel'}="$1"`);
};
