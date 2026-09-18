const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// 1. Add states for Multi-Select
if (!code.includes('isMultiSelectMode')) {
  code = code.replace("const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);", `const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedChatsForAction, setSelectedChatsForAction] = useState<any[]>([]);
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [groupName, setGroupName] = useState('');`);
}

// 2. Change startLongPress
const startLongPressRegex = /const startLongPress = \(contact: any\) => \{[\s\S]*?\}, 600\);\n  \};/;
const newStartLongPress = `const startLongPress = (contact: any) => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (!isMultiSelectMode) {
        setIsMultiSelectMode(true);
        setSelectedChatsForAction([contact]);
        if ('vibrate' in navigator) navigator.vibrate(80);
      }
    }, 600);
  };`;
code = code.replace(startLongPressRegex, newStartLongPress);

// 3. Update handleItemClick to handle multi-select
const handleItemClickRegex = /const handleItemClick = \(c: any\) => \{[\s\S]*?setHasFetchedMessages\(false\);\n    \}\n  \};/;
const newHandleItemClick = `const handleItemClick = (c: any) => {
    if (isLongPressRef.current) return;
    if (isMultiSelectMode) {
      if (selectedChatsForAction.some(sc => sc.id === c.id)) {
        const next = selectedChatsForAction.filter(sc => sc.id !== c.id);
        setSelectedChatsForAction(next);
        if (next.length === 0) setIsMultiSelectMode(false);
      } else {
        setSelectedChatsForAction([...selectedChatsForAction, c]);
      }
      return;
    }
    if (selectedChat?.id !== c.id) {
      setSelectedChat(c);
      setMessages([]);
      setHasFetchedMessages(false);
    }
  };`;
code = code.replace(handleItemClickRegex, newHandleItemClick);

// 4. Update the sidebar top bar to show Multi-Select UI
const sidebarHeaderRegex = /<div className="flex justify-between items-center mb-4">\s*<h1 className="text-2xl font-black text-gray-900 dark:text-white">Chats<\/h1>[\s\S]*?<\/button>\s*<\/div>/;
const newSidebarHeader = `
          {isMultiSelectMode ? (
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-3">
                <button onClick={() => { setIsMultiSelectMode(false); setSelectedChatsForAction([]); }} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800">
                  <X size={20} />
                </button>
                <span className="font-bold">{selectedChatsForAction.length} Selected</span>
              </div>
              <div className="flex items-center gap-2">
                {selectedChatsForAction.length === 1 && (
                  <button onClick={() => setShowReportConfirm(true)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full" title="Report">
                    <Ban size={18} />
                  </button>
                )}
                {selectedChatsForAction.length === 1 && (
                  <button onClick={() => { setChatToDelete(selectedChatsForAction[0]); setShowDeleteConfirm(true); setIsMultiSelectMode(false); setSelectedChatsForAction([]); }} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full" title="Delete">
                    <Trash2 size={18} />
                  </button>
                )}
                <button onClick={() => {
                  const toArchive = selectedChatsForAction.map(c => c.id);
                  const archived = JSON.parse(localStorage.getItem('archived_chats') || '[]');
                  localStorage.setItem('archived_chats', JSON.stringify([...new Set([...archived, ...toArchive])]));
                  setIsMultiSelectMode(false); setSelectedChatsForAction([]);
                  toast.success('Chats archived');
                }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full" title="Archive">
                  <EyeOff size={18} />
                </button>
                {selectedChatsForAction.length >= 1 && (
                  <button onClick={() => setShowGroupCreate(true)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full" title="Create Group">
                    <Users size={18} />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex justify-between items-center mb-4">
              <h1 className="text-2xl font-black text-gray-900 dark:text-white">Chats</h1>
              <button 
                onClick={() => setShowNewFriends(!showNewFriends)}
                className={\`px-3 py-1.5 rounded-full text-xs font-black transition-all \${showNewFriends ? 'bg-[#1877F2] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}\`}
              >
                {showNewFriends ? 'Back to Chats' : 'New Friends'}
              </button>
            </div>
          )}
`;
code = code.replace(sidebarHeaderRegex, newSidebarHeader);

// Add Users import
if (!code.includes("import { Users } from 'lucide-react';")) {
  code = code.replace(/import \{ Search, Trash2, Send, /g, "import { Users, Search, Trash2, Send, ");
}

fs.writeFileSync('src/pages/Messages.tsx', code);
console.log('Modified Messages.tsx');
