const fs = require('fs');
let code = fs.readFileSync('src/components/PostCard.tsx', 'utf-8');

// The line to replace:
const oldDeleteBtnRegex = /\{post\.user_id === currentUser\?\.id && <button onClick=\{triggerDelete\} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900\/20 rounded-full transition-colors"><Trash2 size=\{18\} \/><\/button>\}/;

const newMenu = `
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <MoreVertical size={18} />
          </button>
          
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)}></div>
              <div className="absolute right-0 top-10 mt-1 w-48 bg-white dark:bg-[#1a1a1b] border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in zoom-in duration-200">
                <button 
                  onClick={async () => {
                    setShowMenu(false);
                    try {
                      const { localDB } = require('@/lib/dexie');
                      await localDB.saved_content.put({
                        id: post.id,
                        media_url: post.media_url || '',
                        media_type: post.media_type || '',
                        text: post.content || '',
                        author_name: post.profiles?.display_name || post.profiles?.name || 'User',
                        author_avatar: post.profiles?.avatar_url || post.profiles?.avatar || '',
                        saved_at: Date.now()
                      });
                      toast.success('Saved locally!');
                    } catch (e) {
                      console.warn(e);
                      toast.error('Failed to save');
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Bookmark size={18} />
                  Save locally
                </button>
                <button 
                  onClick={() => {
                    setShowMenu(false);
                    setShowReport(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Flag size={18} />
                  Report post
                </button>
                {post.user_id === currentUser?.id && (
                  <button 
                    onClick={() => {
                      setShowMenu(false);
                      triggerDelete();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 size={18} />
                    Delete post
                  </button>
                )}
              </div>
            </>
          )}
        </div>
`;

code = code.replace(oldDeleteBtnRegex, newMenu);

// Now add the Report Modal rendering at the end of the return statement before the closing div.
const reportModalHtml = `
      {showReport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Report Content</h3>
            <p className="text-sm text-gray-500 mb-4">Please tell us why you are reporting this content.</p>
            <textarea
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white mb-4 outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
              placeholder="Reason for report..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            ></textarea>
            <div className="flex gap-3">
              <button 
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold"
                onClick={() => setShowReport(false)}
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
                      reported_entity_id: post.id,
                      entity_type: 'post',
                      reason: reportReason,
                      created_at: new Date().toISOString()
                    });
                    toast.success('Report submitted successfully');
                    setShowReport(false);
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

code = code.replace("    </div>\n  );\n});", reportModalHtml + "    </div>\n  );\n});");

fs.writeFileSync('src/components/PostCard.tsx', code);
console.log('Modified PostCard.tsx');
