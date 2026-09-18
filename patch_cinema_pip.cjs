const fs = require('fs');
let code = fs.readFileSync('src/pages/Cinema.tsx', 'utf8');

code = code.replace(
  /\{Object\.keys\(remoteStreams\)\.length > 0 && \(/g,
  `{(Object.keys(remoteStreams).length > 0 || (localStream && videoEnabled)) && (`
);

fs.writeFileSync('src/pages/Cinema.tsx', code);
