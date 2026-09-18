import re

with open('src/components/PostCard.tsx', 'r') as f:
    content = f.read()

replacement_like = """    try {
      const likeId = `${post.id}_${currentUser.id}`;
      const likeDocRef = doc(db, 'likes', likeId);

      if (isLiked) {
        // Delete like using deterministic ID
        await deleteDoc(likeDocRef);
      } else {
        // Insert like using deterministic ID
        await setDoc(likeDocRef, { post_id: post.id, user_id: currentUser.id, created_at: new Date().toISOString() });
        
        if (post.user_id !== currentUser.id) {"""

content = re.sub(
    r'    try \{\n      const likesRef = collection\(db, \'likes\'\);\n      const q = query\(likesRef, where\(\'post_id\', \'==\', post\.id\), where\(\'user_id\', \'==\', currentUser\.id\)\);\n      const snap = await getDocs\(q\);\n\n      if \(isLiked\) \{\n        // Delete like\n        snap\.forEach\(async \(d\) => \{\n           await deleteDoc\(doc\(db, \'likes\', d\.id\)\);\n        \}\);\n      \} else \{\n        // Insert like\n        if \(snap\.empty\) \{\n           await addDoc\(likesRef, \{ post_id: post\.id, user_id: currentUser\.id, created_at: new Date\(\)\.toISOString\(\) \}\);\n        \}\n        if \(post\.user_id !== currentUser\.id\) \{',
    replacement_like,
    content,
    flags=re.DOTALL
)

with open('src/components/PostCard.tsx', 'w') as f:
    f.write(content)
