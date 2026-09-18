const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

// Replace the messed up block
const regex = /<div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick=\{\(\) => window\.open\('\/child-safety', '_blank'\)\}[\s\S]*?\{activeTab === 'saved' && \([\s\S]*?<\/>\)\}>/g;

// Wait, the easiest way is to just replace the specific broken part.
code = code.replace(
  /onClick=\{\(\) => window\.open\('\/child-safety', '_blank'\)\}\s*\{activeTab === 'saved' && \([\s\S]*?<\/>\n\s*\}\)          \}>/,
  "onClick={() => window.open('/child-safety', '_blank')}>"
);

// Ah, wait. Let's just find the exact string.
code = code.replace("onClick={() => window.open('/child-safety', '_blank')}\n          {activeTab === 'saved' && (\n            <div className=\"animate-in fade-in slide-in-from-bottom-4 duration-300\">\n              <h2 className=\"text-3xl font-black mb-2 text-gray-900 dark:text-white\">Saved Content</h2>\n              <p className=\"text-gray-500 dark:text-gray-400 font-medium mb-8\">View content you've saved offline.</p>\n              <SavedContentList />\n            </div>\n          )}>", "onClick={() => window.open('/child-safety', '_blank')}>");

fs.writeFileSync('src/pages/Settings.tsx', code);
console.log('Fixed syntax in Settings');
