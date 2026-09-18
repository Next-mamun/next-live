const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

const setupListenerBlock = `      // 3. Setup Listener
      if (useGlobalStore.getState().isSupabaseActive) {
        const channelId = \`chat:\${chatId}\`;
        realtimeChannel = supabase.channel(channelId, {
          config: {
            broadcast: { ack: false, self: false },
            presence: { key: currentUser.id }
          }
        });
  
        realtimeChannel
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'messages',
            },
            (payload: any) => {
              console.log('📡 [Chat Realtime] Event Received:', payload.eventType, payload.new);
              if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                const item = payload.new;
                if (
                  (item.sender_id === currentUser.id && item.receiver_id === selectedChat.id) ||
                  (item.sender_id === selectedChat.id && item.receiver_id === currentUser.id)
                ) {
                  console.log('✅ [Chat Realtime] Matching message merged into active chat:', item.id);
                  const formatted = {
                    id: item.id,
                    ...item,
                    content: item.content || item.text,
                    chat_id: chatId,
                    chatId: chatId,
                    created_at: item.created_at || new Date().toISOString()
                  };
                  mergeIncomingMessages([formatted]);
                } else {
                  console.log('ℹ️ [Chat Realtime] Ignored message (does not belong to current chat):', item);
                }
              } else if (payload.eventType === 'DELETE') {
                const deletedId = payload.old?.id;
                if (deletedId) {
                  setMessages(prev => prev.filter(m => m.id !== deletedId && m.tempId !== deletedId));
                  import('@/lib/dexie').then(({ localDB }) => {
                    localDB.messages.delete(deletedId).catch(console.warn);
                  });
                }
              }
            }
          )
          .on('broadcast', { event: 'chat_signal' }, (payload: any) => {
            const data = payload.payload;
            if (data?.sender_id === selectedChat.id) {
              if (data.type === 'TYPING') {
                setOtherUserTyping(Boolean(data.isTyping));
              } else if (data.type === 'SEEN') {
                setMessages(prev => prev.map(m => m.id === data.msgId ? { ...m, p2p_seen: true } : m));
              }
            }
          })
          .subscribe((status: string, err: any) => {
            console.log(\`🔌 [Chat Realtime Channel Status]: \${status}\`, err || '');
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('⚠️ [Chat Realtime] Subscription issue detected. Fallback triggered.');
              useGlobalStore.getState().triggerFirebaseFallback();
              if (realtimeChannel) supabase.removeChannel(realtimeChannel);
              initializeChat(); // Retry initialization which will now use Firebase
            }
          });
      } else {
        // Fallback Realtime Listener via Firebase
        const qMsgs = query(
          collection(db, 'messages'),
          or(
            and(where('sender_id', '==', currentUser.id), where('receiver_id', '==', selectedChat.id)),
            and(where('sender_id', '==', selectedChat.id), where('receiver_id', '==', currentUser.id))
          ),
          orderBy('created_at', 'asc'),
          limit(100)
        );
        realtimeChannel = { isFirebase: true, unsub: onSnapshot(qMsgs, (snap) => {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          mergeIncomingMessages(docs);
        }) };
      }
      
      activeChannelRef.current = realtimeChannel;`;

// Delete the old setupListenerBlock
const startIndex = code.indexOf('// 3. Setup Listener');
const endIndex = code.indexOf('activeChannelRef.current = realtimeChannel;') + 'activeChannelRef.current = realtimeChannel;'.length;

if (startIndex !== -1 && endIndex !== -1) {
  const codeToDelete = code.substring(startIndex, endIndex);
  code = code.replace(codeToDelete, '');
}

// Insert it at the top of initializeChat
const insertIndex = code.indexOf('const chatId = [currentUser.id, selectedChat.id].sort().join(\'_\');');
if (insertIndex !== -1) {
  const insertPos = insertIndex + 'const chatId = [currentUser.id, selectedChat.id].sort().join(\'_\');'.length;
  code = code.slice(0, insertPos) + '\n\n' + setupListenerBlock + '\n' + code.slice(insertPos);
}

fs.writeFileSync('src/pages/Messages.tsx', code);
console.log('Modified Messages.tsx');
