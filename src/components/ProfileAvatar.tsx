import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { localDB } from '@/lib/dexie';

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
      // 1. Check IndexedDB cache first
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
          // Save to Dexie cache for future use with all properties
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
    };

    const loadAvatar = async () => {
      try {
        let fetchPromise = activeProfileFetches.get(userId);
        if (!fetchPromise) {
          fetchPromise = fetchAvatarData();
          activeProfileFetches.set(userId, fetchPromise);
          
          // Cleanup map once resolved/rejected
          fetchPromise.finally(() => {
            if (activeProfileFetches.get(userId) === fetchPromise) {
              activeProfileFetches.delete(userId);
            }
          });
        }
        
        const finalUrl = await fetchPromise;
        if (isMounted) setAvatar(finalUrl);
      } catch (err) {
        console.warn('Failed to load avatar:', err);
        if (isMounted) setAvatar(defaultAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${name || userId}`);
      }
    };

    if (!avatar || avatar.includes('dicebear')) {
        loadAvatar();
    }

    return () => { isMounted = false; };
  }, [userId, defaultAvatar, name, avatar]);

  const handleError = () => {
    setAvatar(`https://api.dicebear.com/7.x/bottts/svg?seed=${name || userId || 'U'}`);
  };

  return (
    <img 
      src={avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${name || userId || 'U'}`} 
      alt={`${name || 'User'} avatar`} 
      className={className || "w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-800"} 
      onError={handleError}
      loading="lazy"
    />
  );
};
