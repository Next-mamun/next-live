const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// The class condition is: ${selectedChat?.id === c.id ? 'bg-[#e7f3ff] ...' : '...'}
code = code.replace(
  /className=\`flex items-center gap-3 p-3 cursor-pointer select-none rounded-2xl transition-all \$\{selectedChat\?\.id === c\.id \? 'bg-\[#e7f3ff\]/g,
  "className={`flex items-center gap-3 p-3 cursor-pointer select-none rounded-2xl transition-all ${((selectedChat?.id === c.id) || (isMultiSelectMode && selectedChatsForAction.some(sc => sc.id === c.id))) ? 'bg-[#e7f3ff]"
);

// We should also filter out archived chats from the contact list unless we have a way to view them.
// The user just said "Archive chats", which means they shouldn't show up in the main list.
// Where is the contact list generated?
// Let's add modals for Report and Group Create.

const modals = `
      {/* Report Modal */}
      {showReportConfirm && selectedChatsForAction.length === 1 && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Report User</h3>
            <p className="text-sm text-gray-500 mb-4">Please specify the reason for reporting this user.</p>
            <textarea
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white mb-4 outline-none resize-none h-24"
              placeholder="Reason for report..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            ></textarea>
            <div className="flex gap-3">
              <button 
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold"
                onClick={() => { setShowReportConfirm(false); setIsMultiSelectMode(false); setSelectedChatsForAction([]); setReportReason(''); }}
              >
                Cancel
              </button>
              <button 
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold"
                onClick={async () => {
                  if (!reportReason.trim()) return toast.error('Please provide a reason');
                  try {
                    await addDoc(collection(db, 'reports'), {
                      reporter_id: currentUser?.id,
                      reported_entity_id: selectedChatsForAction[0].id,
                      entity_type: 'user',
                      reason: reportReason,
                      created_at: new Date().toISOString()
                    });
                    toast.success('Report submitted successfully');
                    setShowReportConfirm(false);
                    setIsMultiSelectMode(false);
                    setSelectedChatsForAction([]);
                    setReportReason('');
                  } catch (e) {
                    toast.error('Failed to submit report');
                  }
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Create Modal */}
      {showGroupCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create Group</h3>
            <p className="text-sm text-gray-500 mb-4">Name your new group chat.</p>
            <input
              type="text"
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white mb-4 outline-none"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <p className="text-xs text-gray-500 mb-4">{selectedChatsForAction.length} members selected.</p>
            <div className="flex gap-3">
              <button 
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold"
                onClick={() => { setShowGroupCreate(false); setIsMultiSelectMode(false); setSelectedChatsForAction([]); setGroupName(''); }}
              >
                Cancel
              </button>
              <button 
                className="flex-1 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-bold"
                onClick={async () => {
                  if (!groupName.trim()) return toast.error('Group name required');
                  try {
                    // Creating group as a profile entity for simplicity
                    const groupId = "group_" + Date.now();
                    const memberIds = [currentUser?.id, ...selectedChatsForAction.map(c => c.id)];
                    
                    await setDoc(doc(db, 'profiles', groupId), {
                      id: groupId,
                      is_group: true,
                      display_name: groupName,
                      admin_id: currentUser?.id,
                      members: memberIds,
                      created_at: new Date().toISOString()
                    });
                    
                    toast.success('Group created!');
                    setShowGroupCreate(false);
                    setIsMultiSelectMode(false);
                    setSelectedChatsForAction([]);
                    setGroupName('');
                  } catch (e) {
                    toast.error('Failed to create group');
                  }
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
`;

code = code.replace(/\{showDeleteConfirm && \(/, modals + "\n      {showDeleteConfirm && (");

fs.writeFileSync('src/pages/Messages.tsx', code);
console.log('Modified Messages.tsx with highlight and modals');
