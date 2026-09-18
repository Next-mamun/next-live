const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// Replace the fallback query and listener
const regex = /const initializeChat = async \(\) => \{[\s\S]*?return \(\) => \{/m;
const replacement = `const initializeChat = async () => {
      const chatId = [currentUser.id, selectedChat.id].sort().join('_');
      
      // Load local messages first for instant UI
      try {
        const locals = await localDB.messages
          .filter((m: any) => m.chat_id === chatId || m.chatId === chatId || (m.sender_id === currentUser.id && m.receiver_id === selectedChat.id) || (m.receiver_id === currentUser.id && m.sender_id === selectedChat.id))
          .toArray();
        if (locals.length > 0) mergeIncomingMessages(locals);
      } catch (e) {
        console.warn("Error reading local messages:", e);
      }

      // Query just by chat_id. If there are too many messages, it will be slow, but it guarantees delivery.
      // To prevent massive read explosions on active chats, we limit the query if possible, but Firestore requires composite index.
      // So we just use chat_id. We rely on docChanges to not re-read everything.
      const q = query(
        collection(db, 'messages'), 
        where('chat_id', '==', chatId)
      );

      unsub1 = onSnapshot(q, (snapshot) => {
        handleRemovals(snapshot);
        // Only process NEW or MODIFIED docs to save CPU and render cycles
        const changes = snapshot.docChanges();
        if (changes.length > 0) {
           const newMsgs = changes.filter(c => c.type === 'added' || c.type === 'modified').map(c => {
              const item = c.doc.data();
              let createdAt = new Date().toISOString();
              if (item.created_at && typeof item.created_at.toDate === 'function') {
                createdAt = item.created_at.toDate().toISOString();
              } else if (typeof item.created_at === 'string') {
                createdAt = item.created_at;
              } else if (item.local_created_at) {
                createdAt = item.local_created_at;
              }
              return { id: c.doc.id, ...item, created_at: createdAt } as any;
           });
           mergeIncomingMessages(newMsgs);
        }
      }, (err) => {
        console.warn("Messages onSnapshot error:", err);
      });
    };

    initializeChat();

    return () => {`;

code = code.replace(regex, replacement);

fs.writeFileSync('src/pages/Messages.tsx', code);
