import re

with open('src/components/PostCard.tsx', 'r') as f:
    content = f.read()

replacement_load = """  const loadCommentsOnDemand = async () => {
    try {
       const cSnap = await getDocs(query(collection(db, 'comments'), where('post_id', '==', post.id)));
       const commentsData = await Promise.all(cSnap.docs.map(async cd => {
          const cdData = cd.data();
          let profileData = null;
          
          // 1. Try embedded zero-read data
          if (cdData.author_name) {
             profileData = {
                display_name: cdData.author_name,
                username: cdData.author_username || 'user',
                avatar_url: cdData.author_avatar || ''
             };
          }
          
          // 2. Try zero-read local indexedDB cache
          if (!profileData) {
             const { localDB } = await import('@/lib/dexie');
             try {
                const cached = await localDB.users.get(cdData.user_id);
                if (cached) {
                   profileData = {
                      display_name: cached.display_name || cached.name || 'User',
                      username: cached.username || 'user',
                      avatar_url: cached.avatar_url || cached.avatar || ''
                   };
                }
             } catch(e) {}
          }
          
          // 3. Fallback to Firebase
          if (!profileData) {
             try {
               const uDoc = await getDoc(doc(db, 'profiles', cdData.user_id));
               if (uDoc.exists()) profileData = uDoc.data();
             } catch(e) {}
          }

          return { 
            id: cd.id, 
            ...cdData, 
            profiles: profileData || {
              display_name: 'User',
              username: 'user',
              avatar_url: ''
            }
          };
       }));
       
       commentsData.sort((a: any, b: any) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
       setLocalComments(commentsData);
       setCommentsCount(commentsData.length);
       setHasFetchedComments(true);"""

content = re.sub(
    r'  const loadCommentsOnDemand = async \(\) => \{\n    try \{\n       const cSnap = await getDocs\(query\(collection\(db, \'comments\'\), where\(\'post_id\', \'==\', post\.id\)\)\);\n       const commentsData = await Promise\.all\(cSnap\.docs\.map\(async cd => \{\n          const cdData = cd\.data\(\);\n          let profileData = null;\n          try \{\n            const uDoc = await getDoc\(doc\(db, \'profiles\', cdData\.user_id\)\);\n            if \(uDoc\.exists\(\)\) profileData = uDoc\.data\(\);\n          \} catch\(e\) \{\}\n          return \{ \n            id: cd\.id, \n            \.\.\.cdData, \n            profiles: profileData \|\| \{\n              display_name: \'User\',\n              username: \'user\',\n              avatar_url: \'\'\n            \}\n          \};\n       \}\)\);\n       \n       commentsData\.sort\(\(a: any, b: any\) => new Date\(a\.created_at \|\| 0\)\.getTime\(\) - new Date\(b\.created_at \|\| 0\)\.getTime\(\)\);\n       setLocalComments\(commentsData\);\n       setCommentsCount\(commentsData\.length\);\n       setHasFetchedComments\(true\);',
    replacement_load,
    content,
    flags=re.DOTALL
)

replacement_add = """    try {
      const docRef = await addDoc(collection(db, 'comments'), { 
        post_id: post.id, 
        user_id: currentUser.id, 
        content: commentText, 
        created_at: newComment.created_at,
        author_name: currentUser.display_name || 'User',
        author_username: currentUser.username || 'user',
        author_avatar: currentUser.avatar_url || ''
      });"""

content = re.sub(
    r'    try \{\n      const docRef = await addDoc\(collection\(db, \'comments\'\), \{ \n        post_id: post\.id, \n        user_id: currentUser\.id, \n        content: commentText, \n        created_at: newComment\.created_at\n      \}\);',
    replacement_add,
    content,
    flags=re.DOTALL
)

with open('src/components/PostCard.tsx', 'w') as f:
    f.write(content)
