const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

const brokenStr = `onClick={() => window.open('/child-safety', '_blank')}
          {activeTab === 'saved' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Saved Content</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">View content you've saved offline.</p>
              <SavedContentList />
            </div>
          )}>`;

code = code.replace(brokenStr, "onClick={() => window.open('/child-safety', '_blank')}>");

fs.writeFileSync('src/pages/Settings.tsx', code);
console.log('Fixed syntax in Settings');
