const fs = require('fs');
let code = fs.readFileSync('src/components/PostCard.tsx', 'utf-8');

code = code.replace(/globalStore\.setFeedPosts\(globalStore\.feedPosts\.filter\(\(p: any\) => p\.id !== postId\)\);/, `globalStore.setFeedPosts(globalStore.feedPosts.filter((p: any) => p.id !== postId));
    // CRITICAL: Update deletedPostIds globally to instantly hide from Profile View
    globalStore.setDeletedPostIds([...new Set([...(globalStore.deletedPostIds || []), postId])]);`);

fs.writeFileSync('src/components/PostCard.tsx', code);
