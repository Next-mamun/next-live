const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

code = code.replace(/queryClient\.setQueryData\(\['contacts'\], \(old: any\) => \{[\s\S]*?return newContacts;\n    \}\);/, `queryClient.setQueryData(['contacts'], (old: any) => {
      if (!old) return old;
      const newContacts = [...old];
      const chatIdx = newContacts.findIndex((c: any) => c.id === selectedChat.id);
      if (chatIdx > -1) {
        const chat = {...newContacts[chatIdx]};
        chat.lastMessage = { ...optimisticMsg, created_at: new Date() };
        chat.lastMessageTime = new Date();
        newContacts.splice(chatIdx, 1);
        newContacts.unshift(chat);
      }
      return newContacts;
    });`);

fs.writeFileSync('src/pages/Messages.tsx', code);
