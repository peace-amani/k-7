'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dotenvDir = path.join(root, 'node_modules', 'dotenv');
if (fs.existsSync(dotenvDir)) {
  const idx = path.join(dotenvDir, 'index.js');
  const main = path.join(dotenvDir, 'lib', 'main.js');
  if (!fs.existsSync(idx) && fs.existsSync(main)) {
    fs.writeFileSync(idx, "'use strict';\nmodule.exports = require('./lib/main.js');\n");
  }
}
