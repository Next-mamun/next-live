const fs = require('fs');
let code = fs.readFileSync('src/store/useGlobalStore.ts', 'utf-8');

// Replace un-limited notifications snapshot
code = code.replace(
  /const qNotifs = query\(\s*collection\(db, 'notifications'\),\s*where\('receiver_id', '==', userId\),\s*orderBy\('created_at', 'desc'\)\s*\);/g,
  `const qNotifs = query(
          collection(db, 'notifications'),
          where('receiver_id', '==', userId),
          orderBy('created_at', 'desc'),
          limit(20)
        );`
);

// Replace un-limited deleted_posts snapshot
// We should check exactly what the deleted posts query looks like.
const delRegex = /const qDeleted = query\(collection\(db, 'deleted_posts'\)\);/g;
code = code.replace(delRegex, `const qDeleted = query(collection(db, 'deleted_posts'), limit(20));`);

fs.writeFileSync('src/store/useGlobalStore.ts', code);
console.log('Modified useGlobalStore.ts');
