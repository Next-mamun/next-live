const fs = require('fs');
const lines = fs.readFileSync('src/pages/Settings.tsx', 'utf-8').split('\n');

const legalTabEndIndex = lines.findIndex(line => line.includes('          {/* System Info */}'));

const savedTabBlock = `
          {activeTab === 'saved' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Saved Content</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">View content you've saved offline.</p>
              <SavedContentList />
            </div>
          )}
`;

const newLines = [
  ...lines.slice(0, legalTabEndIndex),
  savedTabBlock,
  ...lines.slice(legalTabEndIndex)
];

fs.writeFileSync('src/pages/Settings.tsx', newLines.join('\n'));
console.log('Added saved block manually');
