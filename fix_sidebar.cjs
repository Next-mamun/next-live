const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

code = code.replace(/const q = query\([\s\S]*?where\('is_read', '==', false\)\s*\);/, `const q = query(
        collection(db, 'messages'), 
        where('receiver_id', '==', currentUser.id),
        where('is_read', '==', false),
        limit(50)
      );`);

fs.writeFileSync('src/components/Sidebar.tsx', code);
console.log('Modified Sidebar.tsx');
