import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { localDB } from '@/lib/dexie';

interface ProfileAvatarProps {
  userId?: string;
  defaultAvatar?: string;
  name?: string;
  className?: string;
}

const activeProfileFetches = new Map<string, Promise<string>>();

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({ userId, defaultAvatar, name, className }) => {
  const [avatar, setAvatar] = useState<string>(() => {
    if (defaultAvatar && !defaultAvatar.includes('dicebear')) return defaultAvatar;
    return '';
  });
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setHasError(false);

    // If defaultAvatar is a real URL (not dicebear robot), use it
    if (defaultAvatar && !defaultAvatar.includes('dicebear')) {
      setAvatar(defaultAvatar);
      return;
    }

    if (!userId) {
      setAvatar('');
      return;
    }

    const fetchAvatarData = async (): Promise<string> => {
      // 1. Check IndexedDB cache first (offline-first)
      try {
        const cached = await localDB.users.get(userId);
        if (cached && (cached.avatar_url || cached.avatar)) {
          const u = cached.avatar_url || cached.avatar;
          if (u && !u.includes('dicebear')) return u;
        }
      } catch (e) {}

      // 2. Fetch from Firestore if missing from cache
      try {
        const docRef = doc(db, 'profiles', userId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const avatarUrl = data.avatar_url || data.avatar || '';
          const dispName = data.display_name || data.name || name || 'User';
          
          await localDB.users.put({ 
            id: userId, 
            name: dispName,
            display_name: dispName,
            username: data.username || '',
            avatar: avatarUrl,
            avatar_url: avatarUrl,
            email: data.email,
            is_verified: !!data.is_verified
          }).catch(() => {});

          if (avatarUrl && !avatarUrl.includes('dicebear')) {
            return avatarUrl;
          }
        }
      } catch (err) {}
      
      return '';
    };

    const loadAvatar = async () => {
      try {
        let fetchPromise = activeProfileFetches.get(userId);
        if (!fetchPromise) {
          fetchPromise = fetchAvatarData();
          activeProfileFetches.set(userId, fetchPromise);
          fetchPromise.finally(() => {
            if (activeProfileFetches.get(userId) === fetchPromise) {
              activeProfileFetches.delete(userId);
            }
          });
        }
        
        const finalUrl = await fetchPromise;
        if (isMounted && finalUrl) {
          setAvatar(finalUrl);
        }
      } catch (err) {
        // Fallback to initial
      }
    };

    loadAvatar();

    return () => { isMounted = false; };
  }, [userId, defaultAvatar]);

  // Clean initials display
  const displayName = name || 'User';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'U';

  // Distinct pleasant background colors based on name
  const getGradientByName = (str: string) => {
    const gradients = [
      'from-blue-600 to-indigo-600',
      'from-emerald-600 to-teal-600',
      'from-purple-600 to-pink-600',
      'from-amber-600 to-orange-600',
      'from-cyan-600 to-blue-600',
      'from-rose-600 to-red-600',
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  };

  if (!avatar || hasError) {
    return (
      <div 
        className={`${className || "w-10 h-10 rounded-full"} bg-gradient-to-tr ${getGradientByName(displayName)} text-white font-bold flex items-center justify-center text-sm shadow-sm select-none shrink-0 border border-white/20`}
        title={displayName}
      >
        <span>{initial}</span>
      </div>
    );
  }

  return (
    <img 
      src={avatar} 
      alt={`${displayName} avatar`} 
      className={className || "w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-800 shrink-0"} 
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
};

export default ProfileAvatar;
