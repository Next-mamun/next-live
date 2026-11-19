
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Plus, X, Link as LinkIcon, ThumbsUp, MessageSquare, Share2, Music, UserPlus, Send, Video, Trash2, CheckCircle, Volume2, VolumeX, Eye, Play } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth, useTheme } from '@/contexts/AuthContext';
import { db, auth as firebaseAuth } from '../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc, updateDoc, deleteDoc, addDoc, onSnapshot, startAfter, setDoc, increment } from 'firebase/firestore';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Reel } from '@/types';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { formatTime, getPosterUrl, optimizeCloudinaryUrl, playInteractionSound, triggerHaptic } from '@/lib/utils';
import { redis } from '@/lib/redis';
import { localDB, getUserProfile } from '@/lib/dexie';

import { useUpload } from '@/contexts/UploadContext';
import ConfirmDialog from '@/components/ConfirmDialog';
import { toast } from 'sonner';
import { useGlobalStore } from '@/store/useGlobalStore';
import { useContentFilter } from '@/hooks/useContentFilter';

const REELS_PER_PAGE = 50;

let globalReelsSeed = Math.random();

export const populateReelsWithProfiles = async (reelsList: any[]) => {
  if (!reelsList || reelsList.length === 0) return reelsList;
  try {
    const userIds = Array.from(new Set(reelsList.map(r => r.user_id).filter(Boolean)));
    if (userIds.length === 0) return reelsList;

    // Load cached users from IndexedDB (Dexie) with zero network read cost
    const cachedUsers = await localDB.users.where('id').anyOf(userIds).toArray().catch(() => []);
    const userMap = new Map<string, any>();
    cachedUsers.forEach(u => {
      userMap.set(u.id, u);
    });

    // Check if any missing and resolve from dexie helper / firebase
    const missingIds = userIds.filter(id => !userMap.has(id));
    if (missingIds.length > 0) {
      await Promise.all(
        missingIds.slice(0, 10).map(async (uid) => {
          try {
            const prof = await getUserProfile(uid);
            if (prof) userMap.set(uid, prof);
          } catch (e) {}
        })
      );
    }

    return reelsList.map(r => {
      const u: any = userMap.get(r.user_id);
      if (u) {
        const name = u.display_name || u.name || r.profiles?.display_name || 'User';
        const uname = u.username || r.profiles?.username || 'user';
        const avatar = u.avatar_url || u.avatar || r.profiles?.avatar_url || '';
        const verified = Boolean(u.is_verified ?? r.profiles?.is_verified);
        return {
          ...r,
          author: name,
          author_name: name,
          author_username: uname,
          author_avatar: avatar,
          profiles: {
            ...r.profiles,
            id: r.user_id,
            display_name: name,
            name: name,
            username: uname,
            avatar_url: avatar,
            avatar: avatar,
            is_verified: verified,
          }
        };
      }
      return r;
    });
  } catch (err) {
    console.warn('Error populating reels profiles:', err);
    return reelsList;
  }
};

export const formatReelDoc = (d: any, sourceCollection: string = 'posts') => {
  const data = typeof d.data === 'function' ? d.data() : (d.data || d);
  const id = d.id || data.id;

  const likesCount = Number(data.likesCount ?? (Array.isArray(data.likes) ? data.likes.length : 0)) || 0;
  const commentsCount = Number(data.commentsCount ?? (Array.isArray(data.comments) ? data.comments.length : 0)) || 0;
  const views = Number(data.views) || 0;

  const authorName = data.author_name || data.author || data.profiles?.display_name || data.profiles?.name || 'User';
  const authorAvatar = data.author_avatar || data.author_photo || data.profiles?.avatar_url || data.profiles?.avatar || '';
  const authorUsername = data.author_username || data.profiles?.username || 'user';
  const isVerified = Boolean(data.author_verified || data.profiles?.is_verified);

  const mediaUrl = data.media_url || data.mediaUrl || data.video_url || '';
  const content = data.content || data.caption || '';
  const sourceType = data.source_type || (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') ? 'youtube' : 'local');
  const youtubeId = data.youtube_id || data.youtubeId || null;

  return {
    id,
    user_id: data.user_id || '',
    content,
    caption: content,
    media_url: mediaUrl,
    mediaUrl,
    media_type: 'video',
    source_type: sourceType,
    youtube_id: youtubeId,
    youtubeId,
    thumbnail_url: data.thumbnail_url || data.thumbnailUrl || '',
    thumbnailUrl: data.thumbnail_url || data.thumbnailUrl || '',
    created_at: typeof data.created_at === 'string' ? data.created_at : (data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.timestamp || new Date().toISOString())),
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : (data.created_at || new Date().toISOString()),
    views,
    likesCount,
    commentsCount,
    likes: Array.isArray(data.likes) ? data.likes : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
    profiles: {
      id: data.user_id || '',
      display_name: authorName,
      name: authorName,
      username: authorUsername,
      avatar_url: authorAvatar,
      avatar: authorAvatar,
      is_verified: isVerified,
    },
    author: authorName,
    author_name: authorName,
    author_avatar: authorAvatar,
    author_username: authorUsername,
    source_collection: sourceCollection,
  };
};

const Reels: React.FC = () => {
  const { id: sharedReelId } = useParams();
  const { currentUser } = useAuth();
  const { showAllReels } = useTheme();
  const { addUpload } = useUpload();
  const { scanFile } = useContentFilter();
  const queryClient = useQueryClient();
  const openAuthModal = useGlobalStore((state) => state.openAuthModal);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [activeReelId, setActiveReelId] = useState<string | null>(sharedReelId || null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Upload State
  const [caption, setCaption] = useState('');
  const [localFile, setLocalFile] = useState<File | string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const [hiddenAds, setHiddenAds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'ad-empty' && e.data?.id) {
         setHiddenAds(prev => {
            const newSet = new Set(prev);
            newSet.add(e.data.id);
            return newSet;
         });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const { data: sharedReel } = useQuery({
    queryKey: ['shared_reel', sharedReelId],
    queryFn: async () => {
      if (!sharedReelId) return null;
      try {
        let reelDoc = await getDoc(doc(db, 'posts', sharedReelId));
        if (!reelDoc.exists()) {
          reelDoc = await getDoc(doc(db, 'reels', sharedReelId));
        }
        if (!reelDoc.exists()) return null;
        const formatted = formatReelDoc(reelDoc);
        const [populated] = await populateReelsWithProfiles([formatted]);
        return populated || formatted;
      } catch (err) {
        console.warn('Error fetching shared reel:', err);
        return null;
      }
    },
    enabled: !!sharedReelId,
  });

  const {
    data: reelsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: reelsLoading,
  } = useInfiniteQuery({
    queryKey: ['reels_infinite_denormalized_v1'],
    queryFn: async ({ pageParam = undefined }: { pageParam: any }) => {
      // 1. Initial page: Query localDB.feed_videos first for zero-latency hydration
      let localFallback: any[] = [];
      if (!pageParam) {
        try {
          const cachedLocal = await localDB.feed_videos.toArray();
          if (cachedLocal && cachedLocal.length > 0) {
            const formatted = cachedLocal.map(item => formatReelDoc(item));
            localFallback = await populateReelsWithProfiles(formatted);
          }
        } catch (dexieErr) {
          console.warn('Dexie read error in Reels:', dexieErr);
        }
      }

      try {
        let data: any[] = [];
        let lastVisible: any = null;
        let isLegacy = pageParam?.isLegacy || false;
        let actualDoc = pageParam?.doc || pageParam;

        if (!isLegacy) {
          try {
            let q = query(
              collection(db, 'posts'), 
              where('media_type', '==', 'video'),
              orderBy('created_at', 'desc'), 
              limit(REELS_PER_PAGE)
            );
            if (actualDoc) {
              q = query(q, startAfter(actualDoc));
            }
            const snapshot = await getDocs(q);
            data = snapshot.docs.map(d => formatReelDoc(d, 'posts'));
            if (snapshot.docs.length > 0) {
              lastVisible = { doc: snapshot.docs[snapshot.docs.length - 1], isLegacy: false };
            }
          } catch (e) {
            console.warn('Index error or fetch error on video posts with orderBy, retrying without composite index:', e);
            try {
              const simpleQ = query(
                collection(db, 'posts'), 
                where('media_type', '==', 'video'),
                limit(REELS_PER_PAGE)
              );
              const snapshot = await getDocs(simpleQ);
              data = snapshot.docs.map(d => formatReelDoc(d, 'posts'));
            } catch (err2) {
              console.warn('Fallback error on posts query:', err2);
            }
            isLegacy = true;
          }
        }

        // If legacy pagination or if fewer items returned than REELS_PER_PAGE
        if (isLegacy || data.length < REELS_PER_PAGE) {
          let fetchLimit = isLegacy ? REELS_PER_PAGE : (REELS_PER_PAGE - data.length);
          if (fetchLimit > 0) {
             let qReels = query(collection(db, 'reels'), orderBy('created_at', 'desc'), limit(fetchLimit));
             if (actualDoc && isLegacy) {
               qReels = query(qReels, startAfter(actualDoc));
             }
             const reelsSnap = await getDocs(qReels).catch(() => ({ docs: [] } as any));
             const legacyReels = (reelsSnap.docs || []).map((d: any) => formatReelDoc(d, 'reels'));
             data = [...data, ...legacyReels];
             
             if (reelsSnap.docs && reelsSnap.docs.length > 0) {
               lastVisible = { doc: reelsSnap.docs[reelsSnap.docs.length - 1], isLegacy: true };
             }
          }
        }

        // Dedupe
        data = Array.from(new Map(data.map(r => [r.id, r])).values());

        // Batch populate with user profiles from Dexie / GlobalStore
        if (data.length > 0) {
          data = await populateReelsWithProfiles(data);

          try {
            const dexieEntries = data.map(r => ({
              id: r.id,
              videoType: r.source_type === 'youtube' ? 'YOUTUBE' : 'CLOUDINARY',
              mediaUrl: r.media_url,
              youtubeId: r.youtube_id,
              thumbnailUrl: r.thumbnail_url,
              caption: r.content,
              author: r.author_name,
              timestamp: r.created_at,
              ...r
            }));
            await localDB.feed_videos.bulkPut(dexieEntries as any);
          } catch (dexErr) {
            console.warn('Error caching reels to Dexie:', dexErr);
          }
          return { data, lastVisible };
        }

        // If Firestore returned 0 docs and we have local fallback for page 0
        if (data.length === 0 && !pageParam && localFallback.length > 0) {
          return { data: localFallback, lastVisible: null };
        }

        return { data, lastVisible };
      } catch (firestoreError) {
        console.warn('Firestore error in Reels queryFn (Quota Exceeded / Network):', firestoreError);
        if (!pageParam && localFallback.length > 0) {
          return { data: localFallback, lastVisible: null };
        }
        return { data: [], lastVisible: null };
      }
    },
    initialPageParam: undefined as any,
    getNextPageParam: (lastPage) => {
      return (lastPage?.data?.length > 0 && lastPage?.lastVisible) ? lastPage.lastVisible : undefined;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const deletedPostIds = useGlobalStore(state => state.deletedPostIds || []);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialScrolled = useRef(false);

  const reels = useMemo(() => {
    let flatReels: any[] = Array.from(new Map((reelsData?.pages?.flatMap(p => p?.data || []) || []).map(r => [r.id, r])).values());
    
    // Filter out logically deleted reels via GlobalStore
    flatReels = flatReels.filter(r => !deletedPostIds.includes(r.id));

    if (!showAllReels) {
      flatReels = flatReels.filter(r => r.source_type === 'local' || (r.media_url && !r.media_url.includes('youtube.com') && !r.media_url.includes('facebook.com') && !r.media_url.includes('/embed/')));
    }

    if (sharedReel) {
      flatReels = [sharedReel, ...flatReels.filter(r => r.id !== sharedReel.id)];
    }
    
    return flatReels;
  }, [reelsData?.pages, sharedReel, showAllReels, deletedPostIds]);

  useEffect(() => {
    if (sharedReelId && !hasInitialScrolled.current && reels.length > 0) {
      hasInitialScrolled.current = true;
      setActiveReelId(sharedReelId);
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-id="${sharedReelId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'auto' });
        }
      });
    } else if (!activeReelId && reels.length > 0) {
      setActiveReelId(reels[0].id);
    }
  }, [sharedReelId, reels.length, activeReelId]);

  // Instant scroll position tracker for snappy auto-play switching
  const handleScroll = useCallback(() => {
    if (!containerRef.current || reels.length === 0) return;
    const container = containerRef.current;
    const itemHeight = container.clientHeight;
    if (itemHeight <= 0) return;

    const scrollY = container.scrollTop;
    const newIndex = Math.round(scrollY / itemHeight);
    
    if (newIndex >= 0 && newIndex < reels.length) {
      const targetReel = reels[newIndex];
      if (targetReel && targetReel.id !== activeReelId) {
        setActiveReelId(targetReel.id);
      }
    }

    if (newIndex >= reels.length - 2 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [reels, activeReelId, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Refs for infinite scroll state to avoid recreating the observer
  const infiniteScrollRefs = useRef({ hasNextPage, isFetchingNextPage, fetchNextPage, reelsLength: reels.length });
  useEffect(() => {
    infiniteScrollRefs.current = { hasNextPage, isFetchingNextPage, fetchNextPage, reelsLength: reels.length };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, reels.length]);

  // Stable Intersection Observer for Auto-Play and Infinite Scroll
  useEffect(() => {
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      let bestEntry: IntersectionObserverEntry | null = null;
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
            bestEntry = entry;
          }
        }
      });

      if (bestEntry) {
        const id = (bestEntry as IntersectionObserverEntry).target.getAttribute('data-id');
        if (id) {
          setActiveReelId(id);
          
          const index = (bestEntry as IntersectionObserverEntry).target.getAttribute('data-index');
          const { hasNextPage: hasNext, isFetchingNextPage: isFetching, fetchNextPage: fetchNext, reelsLength } = infiniteScrollRefs.current;
          
          if (index && parseInt(index) >= reelsLength - 2 && hasNext && !isFetching) {
            fetchNext();
          }
        }
      }
    }, { threshold: [0.5, 0.75, 0.9] });

    return () => {
      if (observer.current) observer.current.disconnect();
    };
  }, []);

  const reelRef = useCallback((node: HTMLDivElement | null) => {
    if (node && observer.current) {
      observer.current.observe(node);
    }
  }, []);


  // --- Upload Logic ---
  const getYoutubeId = (url: string | null | undefined) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const getFacebookEmbedUrl = (url: string | null | undefined) => {
    if (!url) return null;
    if (url.match(/(?:https?:\/\/)?(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.watch)/i)) {
      if (url.includes('plugins/video.php')) return url;
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0&width=560`;
    }
    return null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (file) {
      const isVid = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|3gp|flv|wmv|m4v|ts|ogv)$/i.test(file.name);
      if (!isVid) {
        toast.error('Please select a valid video file (MP4, MOV, WebM, MKV, etc.).');
        return;
      }
      if (file.size > 250 * 1024 * 1024) {
        toast.error('File is too large. Please select a video under 250MB.');
        return;
      }

      // Ultra-strict AI Content Scanning for Reels
      const isSafe = await scanFile(file, inputEl);
      if (!isSafe) {
        setLocalFile(null);
        setPreviewUrl(null);
        return;
      }

      setLocalFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleCreateReel = async () => {
    if (!localFile) {
      toast.error('Please select a video file.');
      return;
    }

    let payload: any = {
      user_id: currentUser?.id,
      content: caption,
      source_type: 'local',
      media_url: '', // Will be updated by UploadContext
      likesCount: 0,
      commentsCount: 0,
      views: 0,
      author_name: currentUser?.display_name || 'User',
      author_avatar: currentUser?.avatar_url || '',
      author_username: currentUser?.username || 'user',
    };

    addUpload(localFile, 'reel', {
      userId: currentUser?.id,
      payload,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['reels_infinite_denormalized_v1'] });
      }
    });

    setIsUploadModalOpen(false);
    setCaption('');
    setLocalFile(null);
    if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const triggerDelete = (id: string) => {
    setDeleteConfirmId(id);
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);

    const targetReel = reels.find((r: any) => r.id === id);
    const targetCol = targetReel?.source_collection === 'reels' ? 'reels' : 'posts';

    // Optimistic delete
    queryClient.setQueriesData({ queryKey: ['reels_infinite_denormalized_v1'] }, (oldData: any) => {
      if (!oldData || !oldData.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
          ...page,
          data: page.data.filter((r: any) => r.id !== id)
        }))
      };
    });
    const globalStore = useGlobalStore.getState();
    globalStore.setDeletedPostIds([...new Set([...(globalStore.deletedPostIds || []), id])]);

    try {
      localDB.posts.delete(id).catch(() => {});
      localDB.feed_videos.delete(id).catch(() => {});
      await setDoc(doc(db, 'deleted_posts', id), {
        postId: id,
        user_id: currentUser?.id || targetReel?.user_id || '',
        deletedAt: new Date().toISOString()
      });
      await deleteDoc(doc(db, targetCol, id));
      toast.success('Reel deleted');
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete reel');
      queryClient.invalidateQueries({ queryKey: ['reels_infinite_denormalized_v1'] });
    }
  };

  const activeIndex = useMemo(() => reels.findIndex(r => r.id === activeReelId), [reels, activeReelId]);

  if (reelsLoading && reels.length === 0) return <div className="h-screen flex items-center justify-center text-[#1877F2] font-black">Loading Reels...</div>;

  return (
    <div 
      id="reels-feed-container"
      ref={containerRef}
      onScroll={handleScroll}
      className="fixed inset-0 z-40 bg-black overflow-y-scroll snap-y snap-mandatory hide-scrollbar flex flex-col md:items-center overscroll-y-contain"
    >
      {/* Floating Create Reel Trigger */}
      <button
        type="button"
        onClick={() => {
          if (!currentUser) {
            openAuthModal(() => setIsUploadModalOpen(true), 'Sign in to create and share a reel');
            return;
          }
          setIsUploadModalOpen(true);
        }}
        className="fixed top-4 right-16 md:right-8 z-50 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[#1877F2] hover:bg-blue-600 text-white text-xs font-bold shadow-lg backdrop-blur-md transition-all active:scale-95"
        title="Create Reel"
      >
        <Plus size={16} />
        <span>Create</span>
      </button>
      {reels.length === 0 ? (
        <div className="h-full w-full flex flex-col items-center justify-center text-white/50 px-10 text-center shrink-0 mix-blend-screen">
          <Video size={80} strokeWidth={1} className="mb-4 opacity-20" />
          <p className="text-xl font-bold">No Reels Yet</p>
          <p className="text-sm">Be the first to share a moment on Next!</p>
        </div>
      ) : reels.map((reel, index) => {
        return (
          <React.Fragment key={reel.id}>
            <div 
              data-id={reel.id}
              data-index={index}
              ref={reelRef}
              className="reel-item h-[100dvh] w-full md:w-[450px] shrink-0 snap-start md:snap-center relative flex items-center justify-center bg-black"
            >
              <ReelItem 
                reel={reel} 
                isActive={activeReelId === reel.id} 
                isNextPreload={!activeReelId ? index <= 1 : index === activeIndex + 1}
                isNeighbor={Math.abs(index - activeIndex) <= 1}
                onDelete={() => triggerDelete(reel.id)} 
              />
            </div>
          </React.Fragment>
        );
      })}

      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="Delete Reel"
        message="Are you sure you want to delete this reel? This action cannot be undone."
        onConfirm={executeDelete}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
              <h2 className="font-black text-xl text-gray-900 dark:text-white">Create Reel</h2>
              <button onClick={() => setIsUploadModalOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"><X size={20} className="text-gray-600 dark:text-gray-300" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <textarea 
                placeholder="Write a caption..." 
                value={caption}
                onChange={e => setCaption(e.target.value)}
                className="w-full p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl outline-none border-2 border-transparent focus:border-[#1877F2] min-h-[100px] text-gray-800 dark:text-white font-medium resize-none placeholder-gray-500"
              />
              
              <div 
                onClick={() => !localFile && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl overflow-hidden flex flex-col items-center justify-center transition-all aspect-[9/16] ${localFile ? 'border-green-500 bg-black' : 'border-gray-300 dark:border-gray-700 hover:border-[#1877F2] hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer'}`}
              >
                {localFile && previewUrl ? (
                  <div className="relative w-full h-full flex flex-col items-center justify-center">
                      <video src={previewUrl} className="w-full h-full object-contain" controls />
                      <button onClick={(e) => { e.stopPropagation(); if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl); setLocalFile(null); setPreviewUrl(null); }} className="absolute top-2 right-2 bg-black/50 text-white p-2 rounded-full hover:bg-red-500"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 p-6 text-center">
                      <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center text-[#1877F2]">
                        <Video size={32} />
                      </div>
                      <div>
                        <p className="font-bold text-gray-700 dark:text-gray-300">Upload Video</p>
                        <p className="text-xs text-gray-400 mt-1">MP4, MOV (Max 250MB)</p>
                      </div>
                  </div>
                )}
              </div>

              <input type="file" ref={fileInputRef} hidden accept="video/*" onChange={handleFileUpload} />

              <button 
                onClick={handleCreateReel}
                disabled={(!localFile && !caption.trim())}
                className="w-full bg-[#1877F2] text-white py-3.5 rounded-xl font-bold shadow-lg hover:brightness-110 disabled:opacity-50 disabled:shadow-none transition-all"
              >
                Share Video
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ReelItem: React.FC<{ reel: any, isActive: boolean, isNextPreload: boolean, isNeighbor: boolean, onDelete: () => void }> = ({ reel, isActive, isNextPreload, isNeighbor, onDelete }) => {
  const { currentUser } = useAuth();
  const { soundEffects, hapticFeedback, saveDataMode } = useTheme();

  const [creator, setCreator] = useState<{ display_name: string; username: string; avatar_url: string; is_verified: boolean }>({
    display_name: reel.profiles?.display_name || reel.author_name || 'User',
    username: reel.profiles?.username || reel.author_username || 'user',
    avatar_url: reel.profiles?.avatar_url || reel.author_avatar || '',
    is_verified: Boolean(reel.profiles?.is_verified || reel.author_verified)
  });

  useEffect(() => {
    let active = true;
    if (!reel.user_id) return;
    
    // If reel.profiles is valid and not generic 'User', sync immediately
    if (reel.profiles && reel.profiles.display_name && reel.profiles.display_name !== 'User') {
      setCreator({
        display_name: reel.profiles.display_name,
        username: reel.profiles.username || 'user',
        avatar_url: reel.profiles.avatar_url || '',
        is_verified: Boolean(reel.profiles.is_verified)
      });
      return;
    }

    // Otherwise, lookup from IndexedDB / memory store
    (async () => {
      try {
        const u = await localDB.users.get(reel.user_id);
        if (u && (u.display_name || u.name) && active) {
          setCreator({
            display_name: u.display_name || u.name || 'User',
            username: u.username || 'user',
            avatar_url: u.avatar_url || u.avatar || '',
            is_verified: Boolean(u.is_verified)
          });
          return;
        }
        const prof = await getUserProfile(reel.user_id);
        if (prof && active) {
          setCreator({
            display_name: prof.display_name || prof.name || 'User',
            username: prof.username || 'user',
            avatar_url: prof.avatar_url || prof.avatar || '',
            is_verified: Boolean(prof.is_verified)
          });
        }
      } catch (e) {}
    })();

    return () => { active = false; };
  }, [reel.user_id, reel.profiles]);

  const [views, setViews] = useState(reel.views || 0);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasViewed = useRef(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const [isLiked, setIsLiked] = useState(Boolean(reel.is_liked || reel.likes?.some((l: any) => l.user_id === currentUser?.id)));
  const [likesCount, setLikesCount] = useState(Number(reel.likesCount ?? (Array.isArray(reel.likes) ? reel.likes.length : 0)));
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState((reel.comments || []).slice().reverse());
  const [commentsCount, setCommentsCount] = useState(Number(reel.commentsCount ?? (Array.isArray(reel.comments) ? reel.comments.length : 0)));

  const poster = getPosterUrl(reel.media_url);
  const isYouTubeUrl = reel.media_url?.includes('youtube.com/embed') || reel.media_url?.includes('youtube.com/') || reel.media_url?.includes('youtu.be/');
  const isFacebook = reel.media_url?.includes('fb.watch') || reel.media_url?.includes('facebook.com');
  const isYouTube = reel.source_type === 'youtube' || isYouTubeUrl || isFacebook;
  
  const ytId = reel.source_type === 'youtube' ? reel.youtube_id : ((reel.media_url?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/) || [])[1]);

  useEffect(() => {
    const handleOtherVideoPlaying = (e: any) => {
      if (e.detail?.src && e.detail.src !== reel.media_url) {
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
        setIsPlaying(false);
      }
    };
    window.addEventListener('single-video-play', handleOtherVideoPlaying as any);
    return () => {
      window.removeEventListener('single-video-play', handleOtherVideoPlaying as any);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    };
  }, [reel.media_url]);

  // Load comments when comments drawer is opened
  useEffect(() => {
    if (!showComments) return;
    let active = true;
    (async () => {
      try {
        const cSnap = await getDocs(query(collection(db, 'comments'), where('post_id', '==', reel.id)));
        const fetchedComments = await Promise.all(cSnap.docs.map(async cd => {
          const cdData = cd.data();
          let profileData: any = null;
          if (cdData.author_name) {
            profileData = {
              display_name: cdData.author_name,
              username: cdData.author_username || 'user',
              avatar_url: cdData.author_avatar || '',
              is_verified: Boolean(cdData.author_verified)
            };
          } else {
            try {
              const cached = await localDB.users.get(cdData.user_id);
              if (cached) {
                profileData = {
                  display_name: cached.display_name || cached.name || 'User',
                  username: cached.username || 'user',
                  avatar_url: cached.avatar_url || cached.avatar || '',
                  is_verified: Boolean(cached.is_verified)
                };
              } else {
                const prof = await getUserProfile(cdData.user_id);
                if (prof) profileData = prof;
              }
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
        fetchedComments.sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        if (active && fetchedComments.length > 0) {
          setComments(fetchedComments);
          setCommentsCount(fetchedComments.length);
        }
      } catch (err) {
        console.warn('Error fetching comments for reel:', err);
      }
    })();
    return () => { active = false; };
  }, [showComments, reel.id]);

  useEffect(() => {
    if (isActive) {
      // Pause all other video elements in the document to prevent background audio/playback
      try {
        document.querySelectorAll('video').forEach((v: HTMLVideoElement) => {
          if (v !== videoRef.current) {
            v.pause();
            v.currentTime = 0;
          }
        });
      } catch (e) {}

      setIsPlaying(true);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        const playPromise = videoRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              window.dispatchEvent(new CustomEvent('single-video-play', { detail: { src: reel.media_url } }));
            })
            .catch((e) => {
              console.log("Unmuted autoplay restricted, attempting muted autoplay", e);
              if (videoRef.current) {
                videoRef.current.muted = true;
                setIsMuted(true);
                videoRef.current.play().then(() => {
                  setIsPlaying(true);
                  window.dispatchEvent(new CustomEvent('single-video-play', { detail: { src: reel.media_url } }));
                }).catch((err) => {
                  console.log("Autoplay prevented by browser", err);
                  setIsPlaying(false);
                });
              }
            });
        }
      }
      if (isYouTube) {
        window.dispatchEvent(new CustomEvent('single-video-play', { detail: { src: reel.media_url } }));
      }
    } else {
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
  }, [isActive, reel.media_url, isYouTube]);

  useEffect(() => {
    // Atomic increment view count with zero read overhead
    if (isActive && !hasViewed.current) {
      hasViewed.current = true;
      setViews(prev => prev + 1);
      const targetCol = reel.source_collection === 'reels' ? 'reels' : 'posts';
      const reelRef = doc(db, targetCol, reel.id);
      updateDoc(reelRef, { views: increment(1) }).catch(() => {});
    }
  }, [isActive, reel.id, reel.source_collection]);

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLVideoElement>) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > rect.width / 2) {
      pressTimer.current = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.playbackRate = 2.0;
        }
      }, 300); // 300ms hold to activate 2x speed
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLVideoElement>) => {
    e.stopPropagation();
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = 1.0;
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const openAuthModal = useGlobalStore((state) => state.openAuthModal);

  const handleLike = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!currentUser) {
      openAuthModal(() => handleLike(), 'Sign in to like this reel');
      return;
    }

    const nextLiked = !isLiked;
    const nextCount = Math.max(0, likesCount + (nextLiked ? 1 : -1));
    
    // 1. Optimistic UI update
    setIsLiked(nextLiked);
    setLikesCount(nextCount);
    
    if (nextLiked) {
      playInteractionSound(soundEffects);
      triggerHaptic(hapticFeedback);
    }

    // 2. Atomic Firestore update on parent reel document
    const targetCol = reel.source_collection === 'reels' ? 'reels' : 'posts';
    const reelRef = doc(db, targetCol, reel.id);
    updateDoc(reelRef, {
      likesCount: increment(nextLiked ? 1 : -1)
    }).catch(err => console.warn("Firestore like increment warning:", err));

    // 3. Local Dexie sync
    localDB.feed_videos.update(reel.id, {
      likesCount: nextCount,
      is_liked: nextLiked
    } as any).catch(() => {});

    // 4. Background like & notification documents
    (async () => {
      try {
        if (nextLiked) {
          await addDoc(collection(db, 'likes'), { post_id: reel.id, user_id: currentUser.id, created_at: new Date().toISOString() });
          if (reel.user_id !== currentUser.id) {
            await addDoc(collection(db, 'notifications'), {
              user_id: reel.user_id,
              sender_id: currentUser.id,
              type: 'like',
              is_read: false,
              created_at: new Date().toISOString()
            }).catch(() => {});
          }
        } else {
          const q = query(collection(db, 'likes'), where('post_id', '==', reel.id), where('user_id', '==', currentUser.id));
          const snap = await getDocs(q).catch(() => ({ docs: [] } as any));
          await Promise.all((snap.docs || []).map((d: any) => deleteDoc(doc(db, 'likes', d.id)).catch(() => {})));
        }
      } catch (e) {
        console.warn('Like background sync notice:', e);
      }
    })();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    if (!currentUser) {
      openAuthModal(() => handleComment(e), 'Sign in to comment on this reel');
      return;
    }

    const submittedText = commentText.trim();
    const newComment = {
      id: `comment_${Date.now()}`,
      post_id: reel.id,
      user_id: currentUser.id,
      content: submittedText,
      created_at: new Date().toISOString(),
      profiles: {
        id: currentUser.id,
        display_name: currentUser.display_name || 'User',
        username: currentUser.username || 'user',
        avatar_url: currentUser.avatar_url || '',
        is_verified: currentUser.is_verified || false
      }
    };

    // 1. Optimistic UI update
    setComments(prev => [newComment, ...prev]);
    setCommentsCount(prev => prev + 1);
    setCommentText('');

    // 2. Atomic Firestore update on parent reel document
    const targetCol = reel.source_collection === 'reels' ? 'reels' : 'posts';
    const reelRef = doc(db, targetCol, reel.id);
    updateDoc(reelRef, {
      commentsCount: increment(1)
    }).catch(err => console.warn("Firestore comment increment warning:", err));

    // 3. Local Dexie sync
    localDB.feed_videos.update(reel.id, {
      commentsCount: commentsCount + 1
    } as any).catch(() => {});

    // 4. Background comment doc & notification
    (async () => {
      try {
        const commentData = {
          post_id: reel.id,
          user_id: currentUser.id,
          content: submittedText,
          created_at: newComment.created_at,
          author_name: currentUser.display_name || 'User',
          author_username: currentUser.username || 'user',
          author_avatar: currentUser.avatar_url || '',
          author_verified: Boolean(currentUser.is_verified)
        };
        await addDoc(collection(db, 'comments'), commentData);
        if (reel.user_id !== currentUser.id) {
          await addDoc(collection(db, 'notifications'), {
            user_id: reel.user_id,
            sender_id: currentUser.id,
            type: 'comment',
            is_read: false,
            created_at: new Date().toISOString()
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('Comment background sync notice:', err);
      }
    })();
  };

  let ytUrl = reel.media_url;
  if (isYouTube && isActive) {
      try {
        const urlObj = new URL(reel.media_url || `https://youtube.com/embed/${ytId}`);
        urlObj.searchParams.set('autoplay', '1');
        urlObj.searchParams.set('mute', isMuted ? '1' : '0'); 
        urlObj.searchParams.set('controls', '1');
        urlObj.searchParams.set('allowfullscreen', '1');
        urlObj.searchParams.set('loop', '1');
        const playlistId = urlObj.pathname.split('/').pop();
        if (playlistId) {
            urlObj.searchParams.set('playlist', playlistId);
        }
        ytUrl = urlObj.toString();
      } catch (e) {}
  }

  const handleShare = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const shareUrl = `${window.location.origin}/reels/${reel.id}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Post by ${reel.profiles?.display_name}`,
            text: reel.content,
            url: shareUrl,
          });
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') return;
          console.warn('Navigator share failed, falling back to clipboard', shareErr);
        }
      }
      
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard!');
    } catch (e) {
      console.error('Final fallback share error', e);
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* Video Layer */}
      <div className="w-full h-full md:w-[450px] relative bg-black flex items-center justify-center">
        {(!isNeighbor && !isActive && (poster || reel.thumbnail_url || ytId)) ? (
            <div className="w-full h-full bg-black relative flex items-center justify-center pointer-events-none">
              <img src={ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : (poster || reel.thumbnail_url || (reel.media_url ? getPosterUrl(reel.media_url) : undefined))} onError={(e) => { e.currentTarget.style.display='none'; }} className="w-full h-full object-cover opacity-80" alt="Video Thumbnail" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                  <Play size={32} className="text-white ml-2" />
                </div>
              </div>
            </div>
        ) : isYouTube ? (
          isActive ? (
            <iframe 
              src={ytUrl}
              className="w-full h-full object-contain pointer-events-auto"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
              title="reel-player"
            />
          ) : (
            <div className="w-full h-full bg-black relative flex items-center justify-center pointer-events-none">
              {ytId ? (
                <img src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} className="w-full h-full object-cover opacity-80" alt="Video Thumbnail" />
              ) : (
                <img src={getPosterUrl(reel.media_url) || undefined} onError={(e) => { e.currentTarget.style.display='none'; }} className={`w-full h-full object-cover opacity-80 ${!getPosterUrl(reel.media_url) ? 'hidden' : ''}`} alt="Video Thumbnail" />
              )}
               <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                    <Play size={32} className="text-white ml-2" />
                  </div>
               </div>
            </div>
          )
        ) : (
          <>
            <video 
              ref={videoRef}
              src={reel.media_url ? optimizeCloudinaryUrl(reel.media_url, { type: 'video', eco: saveDataMode }) : undefined} 
              poster={optimizeCloudinaryUrl(poster || reel.thumbnail_url || (reel.media_url && !isYouTube ? getPosterUrl(reel.media_url) : undefined), { width: 540, type: 'image' })}
              preload={!saveDataMode && (isActive || isNextPreload) ? "auto" : isNeighbor ? "metadata" : "none"}
              loop 
              muted={isMuted}
              playsInline
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              onClick={(e) => {
                if (isMuted && videoRef.current) {
                  videoRef.current.muted = false;
                  setIsMuted(false);
                }
                togglePlayPause(e);
              }}
              className="w-full h-full object-contain cursor-pointer"
            />
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                  <Play size={32} className="text-white ml-2" />
                </div>
              </div>
            )}
            {/* Speed Indicator */}
            {videoRef.current && videoRef.current.playbackRate > 1 && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-1.5 rounded-full text-xs font-bold backdrop-blur-md pointer-events-none">
                2x Speed
              </div>
            )}
          </>
        )}
        
        {/* Mute Indicator (Local Video Only) */}
        {!isYouTube && (
           <button onClick={(e) => { e.stopPropagation(); toggleMute(); }} className="absolute top-4 right-4 p-2 bg-black/40 rounded-full text-white backdrop-blur-sm z-20 hover:scale-110 transition-transform">
             {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
           </button>
        )}
      </div>

      {/* Overlay UI */}
      <div className="absolute inset-0 z-10 flex flex-col justify-end p-4 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none">
        <div className="flex items-end justify-between w-full md:w-[450px] mx-auto pointer-events-auto pb-16 md:pb-4">
          <div className="space-y-3 max-w-[80%]">
            <div className="flex items-center gap-3">
              <Link to={`/profile/${creator.username}`} className="flex items-center gap-3 group">
                <ProfileAvatar userId={reel.user_id} defaultAvatar={creator.avatar_url} name={creator.display_name} className="w-[48px] h-[48px] rounded-full object-cover border-2 border-white/80 shadow-md" />
                <div className="flex flex-col">
                  <span className="text-white font-bold text-sm drop-shadow-md group-hover:underline flex items-center gap-1">
                    {creator.display_name}
                    {creator.is_verified && <VerifiedBadge />}
                  </span>
                  <span className="text-white/80 text-xs">@{creator.username}</span>
                </div>
              </Link>
            </div>
            
            <p className="text-white text-sm drop-shadow-md leading-snug line-clamp-2">{reel.content}</p>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-white/80 text-xs bg-white/10 px-2 py-1 rounded-md backdrop-blur-sm">
                <Eye size={12} />
                <span>{views} views</span>
              </div>
              <div className="flex items-center gap-2 text-white/70 text-xs bg-white/10 px-3 py-1 rounded-full w-fit backdrop-blur-sm">
                <Music size={12} />
                <span className="truncate max-w-[150px]">Original Audio • {creator.display_name}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-5">
             <div className="flex flex-col items-center gap-1">
              <button 
                onClick={handleLike}
                className={`p-3 rounded-full backdrop-blur-md transition-all active:scale-90 ${isLiked ? 'bg-[#1877F2]' : 'bg-black/40 hover:bg-black/60'} text-white`}
              >
                <ThumbsUp size={24} fill={isLiked ? "currentColor" : "none"} />
              </button>
              <span className="text-white text-xs font-bold drop-shadow-md">{likesCount}</span>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button 
                onClick={() => setShowComments(true)}
                className="p-3 bg-black/40 rounded-full text-white backdrop-blur-md hover:bg-black/60 transition-all active:scale-90"
              >
                <MessageSquare size={24} />
              </button>
              <span className="text-white text-xs font-bold drop-shadow-md">{comments.length}</span>
            </div>

            <button onClick={handleShare} className="p-3 bg-black/40 rounded-full text-white backdrop-blur-md hover:bg-black/60 transition-all active:scale-90">
              <Share2 size={24} />
            </button>

            {reel.user_id === currentUser?.id && (
              <button 
                onClick={onDelete}
                className="p-3 bg-black/40 rounded-full text-white/80 backdrop-blur-md hover:bg-red-500 hover:text-white transition-all active:scale-90"
              >
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

       {/* Comments Drawer */}
       {showComments && (
         <div className="absolute top-[60px] bottom-[60px] left-0 right-0 z-50 bg-black/80 backdrop-blur-md flex flex-col animate-in slide-in-from-bottom duration-300 md:w-[450px] md:mx-auto">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
              <h3 className="text-white font-bold text-center flex-1">Comments ({comments.length})</h3>
              <button onClick={() => setShowComments(false)} className="text-white p-1 hover:bg-white/10 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
               {comments.length === 0 ? (
                 <div className="h-full flex flex-col items-center justify-center text-white/30 gap-2">
                   <MessageSquare size={40} />
                   <p>No comments yet</p>
                 </div>
               ) : Array.from(new Map(comments.map((c: any) => [c.id, c])).values()).map((c: any) => (
                 <div key={c.id} className="flex gap-3 text-white group">
                    <Link to={`/profile/${c.profiles?.username}`}>
                      <ProfileAvatar userId={c.user_id} defaultAvatar={c.profiles?.avatar_url} name={c.profiles?.display_name} className="w-[32px] h-[32px] rounded-full object-cover border border-white/20" />
                    </Link>
                    <div className="flex-1">
                       <div className="flex items-baseline gap-2">
                         <Link to={`/profile/${c.profiles?.username}`} className="font-bold text-sm hover:underline text-gray-200 flex items-center gap-1">
                           {c.profiles?.display_name}
                           {c.profiles?.is_verified && <VerifiedBadge size={12} />}
                         </Link>
                         <span className="text-[10px] text-gray-500">{formatTime(c.created_at)}</span>
                       </div>
                       <p className="text-sm text-gray-300 mt-0.5">{c.content}</p>
                    </div>
                 </div>
               ))}
            </div>
            
            <form onSubmit={handleComment} className="p-3 bg-black border-t border-white/10 flex gap-2 items-center">
              <ProfileAvatar userId={currentUser?.id || ''} defaultAvatar={currentUser?.avatar_url} name={currentUser?.display_name} className="w-[32px] h-[32px] rounded-full object-cover border border-white/20" />
              <div className="flex-1 relative">
                <input 
                   value={commentText}
                   onChange={e => setCommentText(e.target.value)}
                   placeholder="Add a comment..." 
                   className="w-full bg-white/10 rounded-full px-4 py-2 text-white outline-none focus:bg-white/20 transition-colors text-sm pr-10" 
                />
                <button 
                   type="submit" 
                   disabled={!commentText.trim()}
                   className="absolute right-2 top-1/2 -translate-y-1/2 text-[#1877F2] disabled:opacity-30 hover:scale-110 transition-transform"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
         </div>
       )}
    </div>
  );
};

export default Reels;
