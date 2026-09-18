const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

const reportModal = `
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
`;

const groupCreateModal = `
      {/* Group Create Modal */}
      {showGroupCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create Group</h3>
            
            <div className="flex flex-col items-center mb-4">
              <label className="relative cursor-pointer mb-2 block w-24 h-24 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-500 transition-colors">
                {groupAvatarPreview ? (
                  <img src={groupAvatarPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                    <Users size={32} />
                  </div>
                )}
                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setGroupAvatarFile(file);
                    setGroupAvatarPreview(URL.createObjectURL(file));
                  }
                }} />
              </label>
              <span className="text-xs text-gray-500">Upload Group Photo</span>
            </div>

            <input
              type="text"
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white mb-4 outline-none focus:border-blue-500"
              placeholder="Group Name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <p className="text-xs text-gray-500 mb-4 text-center">{selectedChatsForAction.length} members selected.</p>
            <div className="flex gap-3">
              <button 
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold"
                onClick={() => { setShowGroupCreate(false); setIsMultiSelectMode(false); setSelectedChatsForAction([]); setGroupName(''); setGroupAvatarFile(null); setGroupAvatarPreview(''); }}
              >
                Cancel
              </button>
              <button 
                className="flex-1 py-2.5 rounded-xl bg-[#1877F2] hover:bg-[#166fe5] text-white font-bold"
                onClick={async () => {
                  if (!groupName.trim()) return toast.error('Group name required');
                  try {
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

                    if (groupAvatarFile) {
                      addUpload(groupAvatarFile, 'profile', { userId: groupId });
                    }

                    // Insert Welcome Message so it shows in inbox
                    const msgRefId = doc(collection(db, 'messages')).id;
                    await setDoc(doc(db, 'messages', msgRefId), {
                      id: msgRefId,
                      chat_id: groupId,
                      sender_id: currentUser?.id,
                      receiver_id: groupId, // Group ID as receiver handles grouping
                      content: "Group created",
                      created_at: new Date().toISOString(),
                      is_read: false
                    });

                    toast.success('Group created!');
                    setShowGroupCreate(false);
                    setIsMultiSelectMode(false);
                    setSelectedChatsForAction([]);
                    setGroupName('');
                    setGroupAvatarFile(null);
                    setGroupAvatarPreview('');
                    
                    // Force refresh
                    queryClient.invalidateQueries({ queryKey: ['contacts'] });
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

// Insert the modals before <ConfirmDialog isOpen={!!deleteConfirmId}
const insertTarget = "<ConfirmDialog\n        isOpen={!!deleteConfirmId}";
if (!code.includes("Report Modal")) {
  code = code.replace(insertTarget, reportModal + "\n" + groupCreateModal + "\n      " + insertTarget);
  fs.writeFileSync('src/pages/Messages.tsx', code);
  console.log('Modals injected');
} else {
  console.log('Modals already injected');
}

