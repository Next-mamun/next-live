import re

with open('src/store/useGlobalStore.ts', 'r') as f:
    content = f.read()

# Make it shuffle
replacement = """          const fetchFromFirebase = async () => {
             // Instant hydration from Dexie for fast UI
             if (!loadMore && !forceRefresh) {
                try {
                  const localPosts = await localDB.posts.orderBy('created_at').reverse().limit(150).toArray();
                  if (localPosts.length > 0) {
                     // Shuffle local posts on first load
                     for (let i = localPosts.length - 1; i > 0; i--) {
                       const j = Math.floor(Math.random() * (i + 1));
                       [localPosts[i], localPosts[j]] = [localPosts[j], localPosts[i]];
                     }
                     set({ feedPosts: localPosts as any, postsLoading: false });
                  }
                } catch (dexErr) {}
             }

             // We fetch a larger pool of posts to allow for good randomization
             let q = query(collection(db, 'posts'), limit(150));
                
             let snap;
             try {
               snap = await getDocs(q);
             } catch (e: any) {
               console.warn("Error fetching posts:", e);
               const fallbackQ = query(collection(db, 'posts'), limit(150));
               snap = await getDocs(fallbackQ);
             }

             const rawDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

             // Shuffle the fetched posts array (Fisher-Yates shuffle)
             for (let i = rawDocs.length - 1; i > 0; i--) {
               const j = Math.floor(Math.random() * (i + 1));
               [rawDocs[i], rawDocs[j]] = [rawDocs[j], rawDocs[i]];
             }
             
             fetchedDocs = rawDocs;
          };"""

content = re.sub(r'          const fetchFromFirebase = async \(\) => \{.*?(?=          const fetchFromSupabase = async \(\) => \{)', replacement + "\n\n", content, flags=re.DOTALL)

with open('src/store/useGlobalStore.ts', 'w') as f:
    f.write(content)
