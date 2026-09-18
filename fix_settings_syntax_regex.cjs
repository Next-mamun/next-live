const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

const regex = /<div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick=\{\(\) => window\.open\('\/child-safety', '_blank'\)\}[\s\S]*?>/g;
code = code.replace(regex, `<div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick={() => window.open('/child-safety', '_blank')}>`);

fs.writeFileSync('src/pages/Settings.tsx', code);
console.log('Fixed syntax using regex');
