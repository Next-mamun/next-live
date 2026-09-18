const fs = require('fs');
let code = fs.readFileSync('src/pages/Cinema.tsx', 'utf8');

code = code.replace(
  /min-h-\[calc\(100vh-60px\)\]/g,
  `flex-1 h-full w-full`
);

code = code.replace(
  /h-\[calc\(100vh-60px\)\]/g,
  `flex-1 h-full w-full`
);

fs.writeFileSync('src/pages/Cinema.tsx', code);
