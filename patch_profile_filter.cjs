const fs = require('fs');
let code = fs.readFileSync('src/pages/Profile.tsx', 'utf-8');

code = code.replace(/const visiblePosts = userPosts\.filter\(\(post: any\) => !deletedPostIds\.includes\(post\.id\)\);/, `const visiblePosts = userPosts.filter((post: any) => {
    // Make sure we also check the global deleted list
    const globalDeleted = useGlobalStore.getState().deletedPostIds || [];
    return !deletedPostIds.includes(post.id) && !globalDeleted.includes(post.id);
  });`);

fs.writeFileSync('src/pages/Profile.tsx', code);
