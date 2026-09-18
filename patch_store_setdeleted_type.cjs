const fs = require('fs');
let code = fs.readFileSync('src/store/useGlobalStore.ts', 'utf-8');

code = code.replace(/setFeedPosts: \(posts: Post\[\]\) => void;/, `setFeedPosts: (posts: Post[]) => void;
  setDeletedPostIds: (ids: string[]) => void;`);

fs.writeFileSync('src/store/useGlobalStore.ts', code);
