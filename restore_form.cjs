const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

const anchor = `<div className="relative bg-white dark:bg-black border-t border-gray-100 dark:border-gray-800 shrink-0 z-30 select-none">
              
                ) : isRecording ? (`;

const fixed = `<div className="relative bg-white dark:bg-black border-t border-gray-100 dark:border-gray-800 shrink-0 z-30 select-none">
              {replyingTo && (
                <div className="absolute bottom-full left-0 right-0 bg-white/90 dark:bg-black/90 backdrop-blur border-t border-gray-100 dark:border-gray-800 p-3 px-5 flex items-center justify-between z-20 slide-in-from-bottom-2 animate-in duration-200">
                  <div className="border-l-4 border-[#1877F2] pl-3 flex-1">
                    <p className="text-xs font-bold text-[#1877F2]">Replying to {replyingTo.sender_id === currentUser?.id ? 'Yourself' : selectedChat.display_name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-1">{replyingTo.content || 'Media message'}</p>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500">
                    <X size={20} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-3 md:p-5 flex items-center gap-2 md:gap-3 relative z-30 shrink-0">
                {!recordedAudio && (
                  <input type="file" ref={fileInputRef} hidden onChange={handleFileSelect} accept="image/*,video/*" />
                )}
                
                {!recordedAudio && (
                  <button 
                    type="button" 
                    disabled={isBlocked || isRecording} 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 md:p-2.5 text-[#1877F2] hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-all disabled:opacity-50 shrink-0"
                  >
                    <Paperclip size={22} />
                  </button>
                )}

                {recordedAudio ? (
                  <div className="flex-1 bg-blue-50 dark:bg-blue-900/10 rounded-2xl flex items-center pl-1 pr-4 py-1.5 border border-blue-200 dark:border-blue-800/50 justify-between gap-3">
                    <CustomAudioPlayer src={recordedAudio.url} isSender={false} />
                  </div>
                ) : isRecording ? (`;

code = code.replace(anchor, fixed);
fs.writeFileSync('src/pages/Messages.tsx', code);
