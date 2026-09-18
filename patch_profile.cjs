const fs = require('fs');
let code = fs.readFileSync('src/pages/Profile.tsx', 'utf-8');

code = code.replace(/setCurrentUser\(\{ id: uDoc\.id, \.\.\.uDoc\.data\(\) \} as any\);/, `const updatedData = { id: uDoc.id, ...uDoc.data() };
           setCurrentUser(updatedData as any);
           // Update Dexie to instantly reflect globally
           import('@/lib/dexie').then(({ localDB }) => {
              localDB.users.put(updatedData as any);
           });`);

fs.writeFileSync('src/pages/Profile.tsx', code);
