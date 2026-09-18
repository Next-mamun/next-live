const fs = require('fs');
const lines = fs.readFileSync('src/pages/Settings.tsx', 'utf-8').split('\n');

const startIndex = lines.findIndex(line => line.includes('<div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick={() => window.open(\'/child-safety\', \'_blank\')'));
const endIndex = lines.findIndex((line, i) => i > startIndex && line.includes('</Section>'));

const correctBlock = `                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick={() => window.open('/child-safety', '_blank')}>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg flex items-center gap-2"><Shield className="w-5 h-5 text-red-500" /> Child Safety Policy</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Read our Zero Tolerance policy on CSAE.</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-400" />
                </div>
              </Section>`;

const newLines = [
  ...lines.slice(0, startIndex),
  correctBlock,
  ...lines.slice(endIndex + 1)
];

fs.writeFileSync('src/pages/Settings.tsx', newLines.join('\n'));
console.log('Fixed block manually');
