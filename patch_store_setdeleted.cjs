const fs = require('fs');
let code = fs.readFileSync('src/store/useGlobalStore.ts', 'utf-8');

code = code.replace(/setFeedPosts: \(posts\) => set\(\{ feedPosts: posts, lastFeedFetch: Date.now\(\) \}\),/, `setFeedPosts: (posts) => set({ feedPosts: posts, lastFeedFetch: Date.now() }),
      setDeletedPostIds: (ids) => set({ deletedPostIds: ids }),`);

fs.writeFileSync('src/store/useGlobalStore.ts', code);
