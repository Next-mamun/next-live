import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, Edit2, Plus, Save, X, MessageCircle, UserPlus, Check, Users, RefreshCw, Calendar, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, collection, query, where, getDocs, addDoc, orderBy, limit, increment } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import { localDB } from '@/lib/dexie';
import {
  syncProfileToSupabase,
  cacheUserInDexie,
  migrateUserFriendshipsOnce,
  getFriendshipBetweenSmart,
  getAcceptedFriendsCountSmart,
  sendFriendRequestSmart,
  deleteFriendshipSmart,
} from '@/lib/profileSync';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import ZoomableImage from '@/components/ZoomableImage';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUpload } from '@/contexts/UploadContext';
import { useGlobalStore } from '@/store/useGlobalStore';
import { toast } from 'sonner';
import { useContentFilter } from '@/hooks/useContentFilter';

import PostCard from '@/components/PostCard';

const Profile: React.FC = () => {
  const { username } = useParams();
  const { currentUser, setCurrentUser } = useAuth();
  const { addUpload } = useUpload();
  const { scanFile } = useContentFilter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ display_name: '', bio: '', avatar_url: '', cover_url: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
  const deletedPostIds = useGlobalStore(state => state.deletedPostIds || []);
  const openAuthModal = useGlobalStore(state => state.openAuthModal);
  const viewedPostsRef = useRef<Set<string>>(new Set());
  const observer = useRef<IntersectionObserver | null>(null);

  const isOwnProfile = Boolean(
    currentUser &&
      username &&
      (currentUser.id === username ||
        (currentUser.username || '').toLowerCase() === username.toLowerCase())
  );

  useEffect(() => {
    if (!currentUser?.id) return;
    migrateUserFriendshipsOnce(currentUser.id)
      .then((changed) => {
        if (changed) {
          queryClient.invalidateQueries({ queryKey: ['friendship'] });
          queryClient.invalidateQueries({ queryKey: ['friendsCount'] });
        }
      })
      .catch(() => {});
  }, [currentUser?.id, queryClient]);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['profile', username, currentUser?.id],
    queryFn: async () => {
      if (!username) return null;
      let userData: any = null;

      // Check Dexie & localStorage first so updates are never clobbered by stale closures
      try {
        if (isOwnProfile && currentUser) {
          const freshLocal = await localDB.users.get(currentUser.id).catch(() => null);
          let freshStored: any = null;
          try {
            const raw = localStorage.getItem('next_media_user');
            if (raw) freshStored = JSON.parse(raw);
          } catch {}
          userData = {
            ...currentUser,
            ...(freshStored?.id === currentUser.id ? freshStored : {}),
            ...(freshLocal || {}),
          };
        } else {
          const allLocal = await localDB.users.toArray();
          const lower = username.toLowerCase();
          const localMatch = allLocal.find((u: any) => u.id === username || (u.username || '').toLowerCase() === lower);
          if (localMatch) userData = localMatch;
        }
      } catch {}

      // Try Supabase first for fast profile lookup
      if (!userData) {
        try {
          const { data: supaByUser } = await supabase
            .from('profiles')
            .select('*')
            .ilike('username', username)
            .maybeSingle();
          if (supaByUser) {
            userData = supaByUser;
          } else {
            const { data: supaById } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', username)
              .maybeSingle();
            if (supaById) userData = supaById;
          }
        } catch {}
      }

      // Fallback to Firestore if still not found
      if (!userData && db) {
        try {
          const q = query(collection(db, 'profiles'), where('username', '==', username));
          const snap = await getDocs(q);
          if (!snap.empty) {
            userData = { id: snap.docs[0].id, ...snap.docs[0].data() };
          } else {
            const docSnap = await getDoc(doc(db, 'profiles', username));
            if (docSnap.exists()) {
              userData = { id: docSnap.id, ...docSnap.data() };
            }
          }
        } catch (error) {
          console.warn('Firestore profile lookup warning:', error);
        }
      }

      if (userData) {
        cacheUserInDexie(userData);
        syncProfileToSupabase(userData).catch(() => {});
      }

      return userData;
    },
    initialData: () => (isOwnProfile && currentUser ? currentUser : undefined),
    staleTime: 1000 * 60 * 5,
  });

  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile) {
      setEditData({ 
        display_name: profile.display_name, 
        bio: profile.bio || '', 
        avatar_url: profile.avatar_url,
        cover_url: profile.cover_url || ''
      });
    }
  }, [profile]);

  const getProfile = async (userId: string) => {
     if (!userId) return null;
     const userDoc = await getDoc(doc(db, 'profiles', userId));
     return userDoc.exists() ? userDoc.data() : null;
  };

  const { data: userPosts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['userPosts', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      let rawPosts: any[] = [];

      try {
        const q = query(collection(db, 'posts'), where('user_id', '==', profile.id), orderBy('created_at', 'desc'), limit(20));
        const snapshot = await getDocs(q);
        rawPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch {
        try {
          const fallbackQ = query(collection(db, 'posts'), where('user_id', '==', profile.id), limit(30));
          const snapshot = await getDocs(fallbackQ);
          rawPosts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch {
          try {
            const cachedPosts = await localDB.posts.toArray();
            rawPosts = cachedPosts.filter((p: any) => p.user_id === profile.id);
          } catch {}
        }
      }

      rawPosts.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      return rawPosts.slice(0, 20).map((postData: any) => ({
        id: postData.id,
        ...postData,
        profiles: profile,
        comments: Array.isArray(postData.comments) ? postData.comments : [],
        likes: Array.isArray(postData.likes) ? postData.likes : [],
      }));
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 5,
  });

  const { data: friendship } = useQuery({
    queryKey: ['friendship', currentUser?.id, profile?.id],
    queryFn: async () => {
      if (!profile?.id || !currentUser?.id || isOwnProfile) return null;
      return getFriendshipBetweenSmart(currentUser.id, profile.id);
    },
    enabled: !!profile?.id && !isOwnProfile && !!currentUser?.id,
  });

  const friendStatus = friendship?.status || 'none';

  const { data: friendsCount = 0 } = useQuery({
    queryKey: ['friendsCount', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;
      return getAcceptedFriendsCountSmart(profile.id);
    },
    enabled: !!profile?.id,
  });

  useEffect(() => {
    if (profileLoading || postsLoading) return;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const postId = entry.target.getAttribute('data-post-id');
          if (postId && !viewedPostsRef.current.has(postId)) {
            incrementViewCount(postId);
            viewedPostsRef.current.add(postId);
          }
        }
      });
    }, { threshold: 0.5 });

    observer.current = obs;

    setTimeout(() => {
      const elements = document.querySelectorAll('[data-post-id]');
      elements.forEach(el => obs.observe(el));
    }, 100);

    return () => obs.disconnect();
  }, [profileLoading, postsLoading, userPosts.length]);

  const incrementViewCount = async (postId: string) => {
    try {
      const postRef = doc(db, 'posts', postId);
      updateDoc(postRef, { views: increment(1) }).catch(() => {});
    } catch (err) {
      // Silently catch in case of quota or network issue
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'cover') => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (!file || !currentUser?.id) {
      if (inputEl) inputEl.value = '';
      return;
    }

    if (type === 'cover') setCoverUploading(true);
    else setIsUploading(true);

    // Clear input so the user can re-pick the same image if needed
    inputEl.value = '';

    // Ultra-strict AI Content Scanning for Profile Images
    const isSafe = await scanFile(file, inputEl);
    if (!isSafe) {
      if (type === 'cover') setCoverUploading(false);
      else setIsUploading(false);
      return;
    }

    const localPreview = URL.createObjectURL(file);
    if (type === 'cover') {
      setCoverPreviewUrl(localPreview);
    }

    const fieldKey = type === 'avatar' ? 'avatar_url' : 'cover_url';

    addUpload(file, 'profile', {
      userId: currentUser.id,
      fullProfile: currentUser,
      skipModeration: true,
      payload: { [fieldKey]: '' }, // Cloudinary URL populated by UploadContext
      onSuccess: async (uploadedUrl?: string) => {
        try {
          let freshDocData: any = null;
          try {
            const uDoc = await getDoc(doc(db, 'profiles', currentUser.id));
            if (uDoc.exists()) freshDocData = { id: uDoc.id, ...uDoc.data() };
          } catch (_) {}

          const mergedData = {
            ...(currentUser || {}),
            ...(freshDocData || {}),
            id: currentUser.id,
            ...(uploadedUrl ? { [fieldKey]: uploadedUrl } : {}),
          } as any;

          await syncProfileToSupabase(mergedData);
          await cacheUserInDexie(mergedData);
          localStorage.setItem('next_media_user', JSON.stringify(mergedData));
          setCurrentUser(mergedData);
          setEditData({
            display_name: mergedData.display_name || '',
            bio: mergedData.bio || '',
            avatar_url: mergedData.avatar_url || '',
            cover_url: mergedData.cover_url || ''
          });
          queryClient.setQueryData(['profile', username, currentUser.id], mergedData);
          toast.success(`${type === 'avatar' ? 'Profile picture' : 'Cover photo'} updated!`);
        } finally {
          if (type === 'cover') {
            setCoverPreviewUrl(null);
            setCoverUploading(false);
          } else {
            setIsUploading(false);
          }
          URL.revokeObjectURL(localPreview);
        }
      },
      onError: () => {
        if (type === 'cover') {
          setCoverPreviewUrl(null);
          setCoverUploading(false);
        } else {
          setIsUploading(false);
        }
        URL.revokeObjectURL(localPreview);
      }
    });
  };

  const handleSendRequest = async () => {
    if (!currentUser) {
      openAuthModal(() => handleSendRequest(), 'Sign in to send friend requests');
      return;
    }
    if (!friendship) {
      try {
        await sendFriendRequestSmart(currentUser.id, profile.id);

        await addDoc(collection(db, 'notifications'), {
          user_id: profile.id,
          sender_id: currentUser.id,
          sender_name: currentUser.display_name || currentUser.username || 'Someone',
          sender_username: currentUser.username || '',
          sender_avatar: currentUser.avatar_url || '',
          type: 'friend_request',
          created_at: new Date().toISOString(),
          is_read: false
        }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ['friendship', currentUser.id, profile?.id] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        setFeedback({ type: 'success', msg: 'Friend request sent successfully!' });
      } catch (e) {
        setFeedback({ type: 'error', msg: 'Failed to send friend request.' });
      }
    } else if (friendship.status === 'pending') {
      try {
        await deleteFriendshipSmart(friendship.id, currentUser.id, profile.id);
        queryClient.invalidateQueries({ queryKey: ['friendship', currentUser.id, profile?.id] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        setFeedback({ type: 'success', msg: 'Friend request cancelled.' });
      } catch (e) {
        setFeedback({ type: 'error', msg: 'Failed to cancel friend request.' });
      }
    }
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleUpdate = async () => {
    if (!currentUser?.id) return;
    setIsUploading(true);
    try {
      await setDoc(doc(db, 'profiles', currentUser.id), editData, { merge: true }).catch(() => {});
      let updatedData: any = { ...currentUser, ...editData, id: currentUser.id };
      try {
        const uDoc = await getDoc(doc(db, 'profiles', currentUser.id));
        if (uDoc.exists()) {
          updatedData = { ...updatedData, id: uDoc.id, ...uDoc.data(), ...editData };
        }
      } catch (_) {}
      await syncProfileToSupabase(updatedData);
      await cacheUserInDexie(updatedData);
      localStorage.setItem('next_media_user', JSON.stringify(updatedData));
      setCurrentUser(updatedData as any);
      queryClient.setQueryData(['profile', username, currentUser.id], updatedData);
      setIsEditing(false);
      toast.success('Profile updated!');
    } catch (e) {
      console.error('Failed to update profile', e);
      toast.error('Failed to update profile');
    }
    setIsUploading(false);
  };

  if (profileLoading) return <div className="flex flex-col items-center justify-center p-40 gap-4"><div className="w-10 h-10 border-4 border-[#1877F2] border-t-transparent rounded-full animate-spin"></div><p className="font-bold text-gray-500">Loading profile data...</p></div>;
  if (!profile) return <div className="p-20 text-center text-gray-500 font-bold">Profile not found.</div>;

  const visiblePosts = userPosts.filter((post: any) => {
    // Make sure we also check the global deleted list
    const globalDeleted = useGlobalStore.getState().deletedPostIds || [];
    return !deletedPostIds.includes(post.id) && !globalDeleted.includes(post.id);
  });

  return (
    <div className="bg-white dark:bg-black min-h-screen relative pt-4">
      {/* Photo Modal */}
      {showPhotoModal && (
        <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={() => setShowPhotoModal(false)}>
          <button className="absolute top-6 right-6 text-white hover:scale-110 transition-transform"><X size={32} /></button>
          <img src={profile.avatar_url || undefined} className="max-w-full max-h-full rounded-lg shadow-2xl animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {feedback && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-2xl font-bold animate-in fade-in slide-in-from-top-4 duration-300 ${feedback.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {feedback.msg}
        </div>
      )}
      <div className="w-full max-w-[1100px] mx-auto">
        <div className="relative mb-6 md:mb-24">
          <div className="h-[200px] md:h-[300px] bg-gradient-to-r from-blue-400 to-blue-600 rounded-b-xl overflow-hidden shadow-sm relative z-10 group">
            {(coverPreviewUrl || (isEditing ? editData.cover_url : ((isOwnProfile ? currentUser?.cover_url : undefined) || profile.cover_url))) && (
              <ZoomableImage
                src={(coverPreviewUrl || (isEditing ? editData.cover_url : ((isOwnProfile ? currentUser?.cover_url : undefined) || profile.cover_url))) as string}
                alt="Cover photo"
                className="w-full h-full object-cover"
              />
            )}
            {isOwnProfile && (
              <>
                <input type="file" ref={coverInputRef} hidden onChange={(e) => handleFileUpload(e, 'cover')} accept="image/*" />
                <button
                  type="button"
                  disabled={coverUploading}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    coverInputRef.current?.click();
                  }}
                  className="absolute top-3 right-3 md:top-auto md:bottom-4 md:right-4 z-30 bg-black/65 hover:bg-black/85 text-white px-3.5 py-2 rounded-full backdrop-blur-md border border-white/20 shadow-xl transition-all flex items-center gap-2 min-h-[40px] cursor-pointer disabled:opacity-70"
                >
                  {coverUploading ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      <span className="text-xs sm:text-sm font-bold">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Camera size={18} />
                      <span className="text-xs sm:text-sm font-bold">Update Cover</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
          
          <div className="pointer-events-none relative -mt-16 px-4 flex flex-col items-center gap-4 md:gap-6 md:mt-0 md:px-0 md:flex-row md:items-end md:absolute md:-bottom-20 md:left-10 md:w-[calc(100%-5rem)] z-20">
            <div className="pointer-events-auto relative group cursor-pointer" onClick={() => !isEditing && setShowPhotoModal(true)}>
              <ProfileAvatar userId={profile.id} defaultAvatar={isEditing ? editData.avatar_url : profile.avatar_url} name={profile.display_name} className="w-32 h-32 md:w-44 md:h-44 rounded-full border-4 border-white dark:border-black shadow-2xl object-cover bg-white dark:bg-gray-800 hover:brightness-90 transition-all" />
              {isOwnProfile && (
                <>
                  <input type="file" ref={avatarInputRef} hidden onChange={(e) => handleFileUpload(e, 'avatar')} accept="image/*" />
                  <button type="button" onClick={(e) => { e.stopPropagation(); avatarInputRef.current?.click(); }} className="absolute bottom-2 right-2 bg-gray-100 dark:bg-gray-800 p-2.5 rounded-full border-2 border-white dark:border-black shadow-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50" disabled={isUploading}>
                    <Camera size={18} className="text-gray-600 dark:text-gray-300" />
                  </button>
                </>
              )}
            </div>
            <div className="pointer-events-auto flex-1 text-center md:text-left md:pb-2">
              {isEditing ? (
                <div className="flex flex-col gap-2 mt-2">
                  <input value={editData.display_name} onChange={e => setEditData({...editData, display_name: e.target.value})} className="text-3xl font-black border dark:border-gray-700 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-300 text-gray-900 dark:text-white bg-transparent" />
                </div>
              ) : (
                <h1 className="text-2xl md:text-4xl font-black text-gray-900 dark:text-white drop-shadow-md flex items-center justify-center md:justify-start gap-2">
                  {profile.display_name}
                  {profile.is_verified && <VerifiedBadge size={24} />}
                </h1>
              )}
              <p className="text-gray-700 dark:text-gray-300 font-bold bg-white/30 dark:bg-black/30 backdrop-blur-sm inline-block px-2 rounded-md mt-1">@{profile.username || profile.id}</p>
            </div>
            <div className="pointer-events-auto flex flex-wrap justify-center gap-2 md:pb-2">
              {isOwnProfile ? (
                isEditing ? (
                  <>
                    <button onClick={handleUpdate} disabled={isUploading} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md hover:bg-green-700 transition-all disabled:opacity-50">
                      {isUploading ? <><RefreshCw size={18} className="animate-spin" /> Saving...</> : <><Save size={18}/> Save</>}
                    </button>
                    <button onClick={() => setIsEditing(false)} className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"><X size={18}/> Cancel</button>
                  </>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"><Edit2 size={18}/> Edit Profile</button>
                )
              ) : (
                <>
                  <button onClick={handleSendRequest} className={`${friendStatus === 'accepted' ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white' : 'bg-[#1877F2] text-white'} px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md hover:brightness-110 transition-all`}>
                    {friendStatus === 'none' ? <><UserPlus size={18}/> Add Friend</> : <><Check size={18}/> {friendStatus.toUpperCase()}</>}
                  </button>
                  <button onClick={() => currentUser ? navigate('/messages', { state: { userId: profile.id } }) : openAuthModal(undefined, 'Sign in to send a private message')} className="bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white px-6 py-2 rounded-lg font-bold flex items-center gap-2 shadow-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"><MessageCircle size={18}/> Message</button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Profile Details & Posts */}
        <div className="mt-4 px-4 md:px-10 flex flex-col md:flex-row gap-6 p-4 md:p-8 bg-[#f0f2f5] dark:bg-gray-900 rounded-t-3xl">
          <div className="w-full md:w-[300px] flex-shrink-0 flex flex-col gap-4">
            <div className="bg-white dark:bg-black p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
              <h2 className="text-xl font-black mb-4 text-gray-900 dark:text-white">Intro</h2>
              {isEditing ? (
                <textarea value={editData.bio} onChange={e => setEditData({...editData, bio: e.target.value})} className="w-full border dark:border-gray-700 rounded-lg p-2 text-center italic text-gray-800 dark:text-white bg-transparent focus:ring-2 focus:ring-blue-200 outline-none" rows={3}/>
              ) : (
                <p className="text-center italic font-medium text-gray-700 dark:text-gray-300">
                  {profile.bio
                    ? profile.bio.split(/(\*\*.*?\*\*)/g).map((part: string, idx: number) =>
                        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
                          <strong key={idx}>{part.slice(2, -2)}</strong>
                        ) : (
                          <React.Fragment key={idx}>{part}</React.Fragment>
                        )
                      )
                    : ''}
                </p>
              )}
              <div className="mt-6 space-y-4">
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 font-medium"><Users className="text-gray-400" size={20} /> <span className="font-bold text-gray-900 dark:text-white">{friendsCount}</span> Friends</div>
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 font-medium"><Calendar className="text-gray-400" size={20} /> Member since {profile.created_at ? new Date(profile.created_at).getFullYear() : '2023'}</div>
                <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400 font-medium"><CheckCircle className="text-gray-400" size={20} /> Active User</div>
              </div>
              {isOwnProfile && (
                <button onClick={() => setIsEditing(true)} className="w-full bg-[#f0f2f5] dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 py-2.5 rounded-xl font-bold mt-6 text-gray-800 dark:text-white transition-colors">Edit Bio</button>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-4">
            <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Recent Posts</h2>
            {visiblePosts.length === 0 ? (
              <div className="bg-white dark:bg-black p-20 rounded-2xl text-center border-2 border-dashed border-gray-200 dark:border-gray-800 text-gray-400 font-bold flex flex-col items-center gap-4">
                <Plus size={48} className="opacity-20" />
                <p>No posts published by {profile.display_name} yet.</p>
              </div>
            ) : visiblePosts.map((post: any) => (
              <PostCard 
                key={post.id} 
                post={post} 
                isProfileView={true} 
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
