const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// Remove the drag handle div
code = code.replace(
/\{\/\* Always-visible drag handle \*\/\}\s*<div[\s\S]*?className="h-6 flex items-center justify-center cursor-ns-resize[\s\S]*?<\/div>\s*<\/div>/,
""
);

// We need to be careful with the regex to not delete too much.
fs.writeFileSync('src/pages/Messages.tsx', code);
