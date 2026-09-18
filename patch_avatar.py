import re

with open('src/components/ProfileAvatar.tsx', 'r') as f:
    content = f.read()

replacement = """import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { localDB } from '@/lib/dexie';
import { useGlobalStore } from '@/store/useGlobalStore';

interface ProfileAvatarProps {
  userId: string;
  defaultAvatar?: string;
  name?: string;
  className?: string;
}

const activeProfileFetches = new Map<string, Promise<string>>();

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ userId, defaultAvatar, name, className }) => {
  const [avatar, setAvatar] = useState<string>(defaultAvatar || '');

  useEffect(() => {
    let isMounted = true;
    
    if (!userId) { 
       setAvatar(defaultAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${name || 'U'}`); 
       return; 
    }

    const fetchAvatarData = async (): Promise<string> => {
      // 0. Check Global Zustand Store (Zero Read)
      const state = useGlobalStore.getState() as any;
      if (state.profilesCache && state.profilesCache[userId]) {
         const p = state.profilesCache[userId];
         if (p.avatar_url || p.avatar) return p.avatar_url || p.avatar;
      }

      // 1. Check IndexedDB cache
      try {
        const cached = await localDB.users.get(userId);
        if (cached && (cached.avatar_url || cached.avatar)) {
          return cached.avatar_url || cached.avatar;
        }
      } catch (e) {}

      // 2. Fetch from Firestore if missing from cache
      try {
        const docRef = doc(db, 'profiles', userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const avatarUrl = data.avatar_url || data.avatar || '';
          const dispName = data.display_name || data.name || 'User';

          // Save to Dexie cache for future use
          await localDB.users.put({ 
            id: userId, 
            name: dispName,
            display_name: dispName,
            username: data.username || userId,
            avatar: avatarUrl,
            avatar_url: avatarUrl,
            email: data.email,
            is_verified: !!data.is_verified
          }).catch(console.warn);

          if (avatarUrl) return avatarUrl;
        }
      } catch (err) {}

      return defaultAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${name || userId}`;
    };"""

content = re.sub(
    r'import React, \{ useState, useEffect \} from \'react\';\nimport \{ db \} from \'@/lib/firebase\';\nimport \{ doc, getDoc \} from \'firebase/firestore\';\nimport \{ localDB \} from \'@/lib/dexie\';\n\ninterface ProfileAvatarProps \{[\s\S]*?    const fetchAvatarData = async \(\): Promise<string> => \{\n      // 1\. Check IndexedDB cache first\n      try \{\n        const cached = await localDB\.users\.get\(userId\);\n        if \(cached && \(cached\.avatar_url \|\| cached\.avatar\)\) \{\n          return cached\.avatar_url \|\| cached\.avatar;\n        \}\n      \} catch \(e\) \{\}\n\n      // 2\. Fetch from Firestore if missing from cache\n      try \{\n        const docRef = doc\(db, \'profiles\', userId\);\n        const docSnap = await getDoc\(docRef\);\n        if \(docSnap\.exists\(\)\) \{\n          const data = docSnap\.data\(\);\n          const avatarUrl = data\.avatar_url \|\| data\.avatar \|\| \'\';\n          const dispName = data\.display_name \|\| data\.name \|\| \'User\';\n\n          // Save to Dexie cache for future use with all properties\n          await localDB\.users\.put\(\{ \n             id: userId, \n             name: dispName,\n            display_name: dispName,\n            username: data\.username \|\| userId,\n            avatar: avatarUrl,\n            avatar_url: avatarUrl,\n            email: data\.email,\n            is_verified: !!data\.is_verified\n          \}\)\.catch\(console\.warn\);\n\n          if \(avatarUrl\) return avatarUrl;\n        \}\n      \} catch \(err\) \{\}\n\n      return defaultAvatar \|\| `https://api\.dicebear\.com/7\.x/bottts/svg\?seed=\$\{name \|\| userId\}`;\n    \};',
    replacement,
    content,
    flags=re.DOTALL
)

with open('src/components/ProfileAvatar.tsx', 'w') as f:
    f.write(content)
