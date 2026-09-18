const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

// Add "Child Safety Policy" under Legal
const legalSectionRegex = /(<Section title="Legal">[\s\S]*?)<\/Section>/;
const childSafetyLink = `
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick={() => window.open('/child-safety', '_blank')}>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg flex items-center gap-2"><Shield className="w-5 h-5 text-red-500" /> Child Safety Policy</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Read our Zero Tolerance policy on CSAE.</p>
                  </div>
                  <ChevronRight size={20} className="text-gray-400" />
                </div>
`;
code = code.replace(legalSectionRegex, (match, p1) => {
  return p1 + childSafetyLink + "</Section>";
});

// Add "Saved Content" tab
const settingsTabsRegex = /\{ id: 'legal', icon: <FileText size=\{20\} \/>, label: 'Legal & Support', keywords: \['privacy policy', 'terms', 'conditions', 'contact us', 'help'\] \},/;
code = code.replace(settingsTabsRegex, `{ id: 'legal', icon: <FileText size={20} />, label: 'Legal & Support', keywords: ['privacy policy', 'terms', 'conditions', 'contact us', 'help'] },
    { id: 'saved', icon: <Download size={20} />, label: 'Saved Content', keywords: ['saved', 'bookmarks', 'favorites', 'offline'] },`);

const renderTabRegex = /(\{activeTab === 'legal' && \([\s\S]*?\)\})/;
const savedTabContent = `
          {activeTab === 'saved' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Saved Content</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">View content you've saved offline.</p>
              <SavedContentList />
            </div>
          )}
`;
code = code.replace(renderTabRegex, (match) => {
  return match + "\n" + savedTabContent;
});

// We need a SavedContentList component. Let's add it right before Settings component
const savedComponent = `
const SavedContentList = () => {
  const [items, setItems] = useState<any[]>([]);
  const { localDB } = require('@/lib/dexie');
  
  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const saved = await localDB.saved_content.orderBy('saved_at').reverse().toArray();
        setItems(saved);
      } catch (e) {
        console.error(e);
      }
    };
    fetchSaved();
  }, []);

  if (items.length === 0) {
    return <div className="text-center py-10 text-gray-500">No saved content found.</div>;
  }

  return (
    <div className="space-y-4">
      {items.map(item => (
        <div key={item.id} className="p-4 bg-white dark:bg-[#1a1a1b] rounded-xl border border-gray-200 dark:border-gray-800 flex gap-4">
          {item.media_url && item.media_type?.includes('image') && (
            <img src={item.media_url} className="w-24 h-24 object-cover rounded-lg" alt="" />
          )}
          {item.media_url && item.media_type?.includes('video') && (
            <video src={item.media_url} className="w-24 h-24 object-cover rounded-lg" />
          )}
          <div className="flex-1">
            <h4 className="font-bold text-gray-900 dark:text-white">{item.author_name || 'Anonymous'}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{item.text}</p>
            <p className="text-xs text-gray-400 mt-2">{new Date(item.saved_at).toLocaleString()}</p>
            <button 
              onClick={async () => {
                await localDB.saved_content.delete(item.id);
                setItems(prev => prev.filter(p => p.id !== item.id));
                toast.success('Removed from saved items');
              }}
              className="mt-3 text-red-500 text-sm font-medium"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

`;
code = code.replace("const Settings: React.FC = () => {", savedComponent + "const Settings: React.FC = () => {");

fs.writeFileSync('src/pages/Settings.tsx', code);
console.log('Modified Settings.tsx');
