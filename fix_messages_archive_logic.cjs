const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// 1. Where do we put the toggle?
// Maybe right under the search bar? Or next to "New Friends" button in the standard header?
const standardHeaderRegex = /<h1 className="text-2xl font-black text-gray-900 dark:text-white">Chats<\/h1>\s*<button \s*onClick=\{\(\) => setShowNewFriends\(!showNewFriends\)\}/;

const standardHeaderReplacement = \`
              <h1 className="text-2xl font-black text-gray-900 dark:text-white">{chatViewMode === 'archived' ? 'Archived Chats' : 'Chats'}</h1>
              <div className="flex gap-2">
                <button 
                  onClick={() => setChatViewMode(chatViewMode === 'active' ? 'archived' : 'active')}
                  className="px-3 py-1.5 rounded-full text-xs font-black transition-all bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                >
                  {chatViewMode === 'active' ? 'View Archive' : 'Back'}
                </button>
                <button 
                  onClick={() => setShowNewFriends(!showNewFriends)}
\`;

code = code.replace(standardHeaderRegex, standardHeaderReplacement);

// 2. Archive / Unarchive logic in MultiSelect top bar
const archiveActionRegex = /<button onClick=\{\(\) => \{\s*const toArchive = selectedChatsForAction\.map\(c => c\.id\);\s*const archived = JSON\.parse\(localStorage\.getItem\('archived_chats'\) \|\| '\[\]'\);\s*localStorage\.setItem\('archived_chats', JSON\.stringify\(\[\.\.\.new Set\(\[\.\.\.archived, \.\.\.toArchive\]\)\]\)\);\s*setIsMultiSelectMode\(false\); setSelectedChatsForAction\(\[\]\);\s*toast\.success\('Chats archived'\);\s*\}\} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full" title="Archive">\s*<EyeOff size=\{18\} \/>\s*<\/button>/;

const archiveActionReplacement = \`
                <button onClick={() => {
                  const toAction = selectedChatsForAction.map(c => c.id);
                  let archived = JSON.parse(localStorage.getItem('archived_chats') || '[]');
                  if (chatViewMode === 'active') {
                    archived = [...new Set([...archived, ...toAction])];
                    toast.success('Chats archived');
                  } else {
                    archived = archived.filter((id) => !toAction.includes(id));
                    toast.success('Chats unarchived');
                  }
                  localStorage.setItem('archived_chats', JSON.stringify(archived));
                  setIsMultiSelectMode(false); setSelectedChatsForAction([]);
                  
                  // Force a re-render of contacts by triggering a tiny state update
                  setHasFetchedMessages(prev => prev);
                }} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full" title={chatViewMode === 'active' ? "Archive" : "Unarchive"}>
                  {chatViewMode === 'active' ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
\`;

code = code.replace(archiveActionRegex, archiveActionReplacement);

// 3. Update the filter for contacts mapping based on chatViewMode
const listFilterRegex = /const archivedIds = JSON\.parse\(localStorage\.getItem\('archived_chats'\) \|\| '\[\]'\);\s*const filteredForDeletion = contactsWithMessages\.filter\(c => !deletedIds\.includes\(c\.id\) && !archivedIds\.includes\(c\.id\)\);/;

const listFilterReplacement = \`const archivedIds = JSON.parse(localStorage.getItem('archived_chats') || '[]');
        const filteredForDeletion = contactsWithMessages.filter(c => {
          if (deletedIds.includes(c.id)) return false;
          if (chatViewMode === 'archived') {
            return archivedIds.includes(c.id);
          } else {
            return !archivedIds.includes(c.id);
          }
        });\`;

code = code.replace(listFilterRegex, listFilterReplacement);

fs.writeFileSync('src/pages/Messages.tsx', code);
