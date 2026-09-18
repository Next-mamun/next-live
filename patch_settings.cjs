const fs = require('fs');
let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

code = code.replace(/setProfile\(\(prev: any\) => \(\{ \.\.\.prev, \.\.\.updates \}\)\);[\s\S]*?\/\/ Note: A full page reload[\s\S]*?view\./, `setProfile((prev: any) => ({ ...prev, ...updates }));
        
        // Update currentUser globally
        const updatedData = { ...currentUser, ...updates };
        setCurrentUser(updatedData);
        
        // Update IndexedDB to reflect globally
        import('@/lib/dexie').then(({ localDB }) => {
           localDB.users.put(updatedData);
        });`);

fs.writeFileSync('src/pages/Settings.tsx', code);
