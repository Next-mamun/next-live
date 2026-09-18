const fs = require('fs');
let code = fs.readFileSync('src/store/useGlobalStore.ts', 'utf-8');

// Fix fetchFeedPosts
code = code.replace(/const fetchFromFirebase = async \(\) => \{[\s\S]*?fetchedDocs = snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\);\n          \};/, `const fetchFromFirebase = async () => {
             // Zero-read hydration from Dexie
             if (!loadMore) {
                const localPosts = await localDB.posts.orderBy('created_at').reverse().limit(50).toArray();
                if (localPosts.length > 0) {
                   set({ feedPosts: localPosts as any, postsLoading: false });
                   // Delta sync
                   const latestTime = localPosts[0].created_at;
                   const qNew = query(collection(db, 'posts'), where('created_at', '>', latestTime), orderBy('created_at', 'desc'), limit(15));
                   try {
                     const snapNew = await getDocs(qNew);
                     if (!snapNew.empty) {
                        const newDocs = snapNew.docs.map(d => ({ id: d.id, ...d.data() }));
                        fetchedDocs = newDocs; 
                     }
                   } catch(e) { /* ignore index err for delta */ }
                   if (fetchedDocs.length === 0) return; // No new docs, save reads!
                }
             }

             let q = query(collection(db, 'posts'), orderBy('created_at', 'desc'), limit(20));
             if (loadMore && feedPosts.length > 0) {
               const lastPost = feedPosts[feedPosts.length - 1];
               if (lastPost.created_at) {
                 q = query(collection(db, 'posts'), orderBy('created_at', 'desc'), limit(20), startAfter(lastPost.created_at));
               }
             }
             
             if (fetchedDocs.length === 0) { // If delta sync didn't already populate it
               let snap;
               try {
                 snap = await getDocs(q);
               } catch (e: any) {
                 if (e.message && e.message.includes('index')) {
                   console.warn("Index missing for posts, falling back to in-memory sort...");
                   const fallbackQ = query(collection(db, 'posts'), limit(20));
                   snap = await getDocs(fallbackQ);
                   const allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                   allDocs.sort((a: any, b: any) => {
                     const timeA = typeof a.created_at === 'string' ? new Date(a.created_at).getTime() : (a.created_at?.toMillis ? a.created_at.toMillis() : 0);
                     const timeB = typeof b.created_at === 'string' ? new Date(b.created_at).getTime() : (b.created_at?.toMillis ? b.created_at.toMillis() : 0);
                     return timeB - timeA;
                   });
                   if (loadMore && feedPosts.length > 0) {
                     const lastPost = feedPosts[feedPosts.length - 1];
                     const lastTime = typeof lastPost.created_at === 'string' ? new Date(lastPost.created_at).getTime() : (lastPost.created_at?.toMillis ? lastPost.created_at.toMillis() : 0);
                     fetchedDocs = allDocs.filter(d => {
                       const t = typeof d.created_at === 'string' ? new Date(d.created_at).getTime() : (d.created_at?.toMillis ? d.created_at.toMillis() : 0);
                       return t < lastTime;
                     }).slice(0, 20);
                   } else {
                     fetchedDocs = allDocs.slice(0, 20);
                   }
                   return;
                 } else {
                   throw e;
                 }
               }
               fetchedDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
             }
          };`);

fs.writeFileSync('src/store/useGlobalStore.ts', code);
