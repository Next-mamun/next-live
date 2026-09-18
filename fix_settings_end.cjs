const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

const trailingBlock = `          {activeTab === 'saved' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Saved Content</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">View content you've saved offline.</p>
              <SavedContentList />
            </div>
          )}`;

if (code.endsWith(trailingBlock + '\n')) {
  code = code.replace(trailingBlock + '\n', '');
} else if (code.endsWith(trailingBlock)) {
  code = code.replace(trailingBlock, '');
} else if (code.includes('export default Settings;\n' + trailingBlock)) {
  code = code.replace('export default Settings;\n' + trailingBlock, 'export default Settings;');
} else {
  // Try regex
  code = code.replace(/          \{activeTab === 'saved'[\s\S]*?<\/[dD]iv>\n          \}\)\n*$/, '');
}

fs.writeFileSync('src/pages/Settings.tsx', code);
console.log('Fixed trailing block');
