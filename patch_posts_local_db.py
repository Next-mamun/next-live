import re

with open('src/store/useGlobalStore.ts', 'r') as f:
    content = f.read()

# Make it clear old data before adding random data to Dexie so it doesn't just infinitely accumulate duplicates
replacement = """                 // Full content caching for main feed
                 const offlinePosts = populatedPosts.map(p => ({
                   ...p,
                   created_at: typeof p.created_at === 'string' ? p.created_at : (p.created_at?.toDate ? p.created_at.toDate().toISOString() : new Date().toISOString())
                 }));
                 await localDB.posts.clear(); // Clear so random posts don't just grow forever
                 await localDB.posts.bulkPut(offlinePosts as any);"""

content = re.sub(r'                 // Full content caching for main feed.*?                 \}', replacement, content, flags=re.DOTALL)

with open('src/store/useGlobalStore.ts', 'w') as f:
    f.write(content)
