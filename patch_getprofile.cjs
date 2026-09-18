const fs = require('fs');
let code = fs.readFileSync('src/store/useGlobalStore.ts', 'utf-8');

code = code.replace(/const getProfile = async \(userId: string\) => \{[\s\S]*?return \{ display_name: 'Unknown User' \};\n             \}\n          \};/, `const getProfile = async (userId: string) => {
             if (!userId) return null;
             if (profileCache.has(userId)) return profileCache.get(userId);
             try {
               // STRICT ZERO-READ: Use Dexie if present!
               const localUser = await localDB.users.get(userId);
               if (localUser) {
                  profileCache.set(userId, localUser);
                  return localUser;
               }
               // Fetch from Firebase ONLY if completely missing
               const userDoc = await getDoc(doc(db, 'profiles', userId));
               const data = userDoc.exists() ? userDoc.data() : null;
               
               if (data) {
                 profileCache.set(userId, data);
                 localDB.users.put({ id: userId, ...data } as any).catch(() => {});
                 return data;
               }
               return null;
             } catch (e) {
               console.warn("Profile fetch error for user:", userId, e);
               return { display_name: 'Unknown User' };
             }
          };`);

fs.writeFileSync('src/store/useGlobalStore.ts', code);
