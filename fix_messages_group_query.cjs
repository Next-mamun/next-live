const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// Fixing supabase listener
code = code.replace(
  /\(item\.sender_id === currentUser\.id && item\.receiver_id === selectedChat\.id\) \|\|\s*\(item\.sender_id === selectedChat\.id && item\.receiver_id === currentUser\.id\)/g,
  `selectedChat.is_group ? item.receiver_id === selectedChat.id : ((item.sender_id === currentUser.id && item.receiver_id === selectedChat.id) || (item.sender_id === selectedChat.id && item.receiver_id === currentUser.id))`
);

// Fixing firebase fallback query
code = code.replace(
  /const qMsgs = query\(\s*collection\(db, 'messages'\),\s*or\(\s*and\(where\('sender_id', '==', currentUser\.id\), where\('receiver_id', '==', selectedChat\.id\)\),\s*and\(where\('sender_id', '==', selectedChat\.id\), where\('receiver_id', '==', currentUser\.id\)\)\s*\),\s*orderBy\('created_at', 'asc'\),\s*limit\(100\)\s*\);/g,
  `const qMsgs = selectedChat.is_group 
          ? query(collection(db, 'messages'), where('receiver_id', '==', selectedChat.id), orderBy('created_at', 'asc'), limit(100))
          : query(collection(db, 'messages'), or(and(where('sender_id', '==', currentUser.id), where('receiver_id', '==', selectedChat.id)), and(where('sender_id', '==', selectedChat.id), where('receiver_id', '==', currentUser.id))), orderBy('created_at', 'asc'), limit(100));`
);

// Fixing dexie local messages filter
code = code.replace(
  /\(m: any\) => m\.chat_id === chatId \|\| m\.chatId === chatId \|\| \(m\.sender_id === currentUser\.id && m\.receiver_id === selectedChat\.id\) \|\| \(m\.receiver_id === currentUser\.id && m\.sender_id === selectedChat\.id\)/g,
  `(m: any) => selectedChat.is_group ? (m.receiver_id === selectedChat.id) : (m.chat_id === chatId || m.chatId === chatId || (m.sender_id === currentUser.id && m.receiver_id === selectedChat.id) || (m.receiver_id === currentUser.id && m.sender_id === selectedChat.id))`
);

// Fixing supabase fetch
code = code.replace(
  /\.or\(`and\(sender_id\.eq\.\$\{currentUser\.id\},receiver_id\.eq\.\$\{selectedChat\.id\}\),and\(sender_id\.eq\.\$\{selectedChat\.id\},receiver_id\.eq\.\$\{currentUser\.id\}\)`\)/g,
  `// replaced by dynamic check`
);

code = code.replace(
  /const \{ data: supaMsgs, error: supaErr \} = await supabase\s*\.from\('messages'\)\s*\.select\('\*'\)\s*\/\/ replaced by dynamic check\s*\.order\('created_at', \{ ascending: false \}\)\s*\.limit\(100\);/g,
  `let supaQuery = supabase.from('messages').select('*');
          if (selectedChat.is_group) {
            supaQuery = supaQuery.eq('receiver_id', selectedChat.id);
          } else {
            supaQuery = supaQuery.or(\`and(sender_id.eq.\${currentUser.id},receiver_id.eq.\${selectedChat.id}),and(sender_id.eq.\${selectedChat.id},receiver_id.eq.\${currentUser.id})\`);
          }
          const { data: supaMsgs, error: supaErr } = await supaQuery.order('created_at', { ascending: false }).limit(100);`
);

fs.writeFileSync('src/pages/Messages.tsx', code);
