const fs = require('fs');
let code = fs.readFileSync('src/components/PostCard.tsx', 'utf-8');

// The original block:
/*
    const checkLikeStatus = async () => {
      try {
        if (!initialIsLiked && currentUser?.id) {
           const lSnap = await getDocs(query(collection(db, 'likes'), where('post_id', '==', post.id), where('user_id', '==', currentUser.id)));
           if (!unmounted && lSnap.size > 0) {
             setIsLiked(true);
           }
        }
      } catch(e) {}
    };
    checkLikeStatus();
*/

// Let's replace the whole useEffect that calls checkLikeStatus() with one that avoids getDocs.
const regex = /const checkLikeStatus = async \(\) => \{[\s\S]*?checkLikeStatus\(\);/g;

code = code.replace(regex, `// Avoid N+1 Firebase read - rely on initialIsLiked or likes array if provided
    if (initialIsLiked) setIsLiked(true);`);

fs.writeFileSync('src/components/PostCard.tsx', code);
console.log('Modified PostCard.tsx');
