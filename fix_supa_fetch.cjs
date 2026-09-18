const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

code = code.replace(
/const \{ data: supaMsgs, error: supaErr \} = await supabase\s*\.from\('messages'\)\s*\.select\('\*'\)\s*\/\/ replaced by dynamic check\s*\.order\('created_at', \{ ascending: true \}\)\s*\.limit\(100\);/g,
`let supaQuery = supabase.from('messages').select('*');
          if (selectedChat.is_group) {
            supaQuery = supaQuery.eq('receiver_id', selectedChat.id);
          } else {
            supaQuery = supaQuery.or(\`and(sender_id.eq.\${currentUser.id},receiver_id.eq.\${selectedChat.id}),and(sender_id.eq.\${selectedChat.id},receiver_id.eq.\${currentUser.id})\`);
          }
          const { data: supaMsgs, error: supaErr } = await supaQuery.order('created_at', { ascending: true }).limit(100);`
);

fs.writeFileSync('src/pages/Messages.tsx', code);
