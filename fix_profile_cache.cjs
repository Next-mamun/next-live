const fs = require('fs');
let code = fs.readFileSync('src/pages/Profile.tsx', 'utf-8');

code = code.replace(/import\('@\/lib\/dexie'\)\.then\(\(\{ localDB \}\) => \{[\s\S]*?localDB\.users\.put\(updatedData as any\);[\s\S]*?\}\);/, `import('@/lib/dexie').then(({ localDB }) => {
              localDB.users.put(updatedData as any);
           });
           
           // Force window reload to apply global cache clear
           setTimeout(() => {
               window.location.reload();
           }, 500);`);

fs.writeFileSync('src/pages/Profile.tsx', code);
