const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
code = code.replace("app.get('/*', (req, res) => {", "app.use((req, res) => {");
fs.writeFileSync('server.ts', code);
