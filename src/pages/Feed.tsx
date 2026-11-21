import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { Image as LucideImage, Video, ThumbsUp, Send, X, CheckCircle, Clapperboard, Link as LinkIcon, Search, Camera, Pencil } from 'lucide-react';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import ZoomableImage from '@/components/ZoomableImage';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import VideoPlayer from '@/components/VideoPlayer';
import EmbedPlayer from '@/components/EmbedPlayer';
import { useAuth, useTheme } from '@/contexts/AuthContext';
import { db } from '../lib/firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, limit, increment } from 'firebase/firestore';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';

const CameraCapture = lazy(() => import('@/components/MediaTools').then(m => ({ default: m.CameraCapture })));
const MediaEditor = lazy(() => import('@/components/MediaTools').then(m => ({ default: m.MediaEditor })));

import PostCard from '@/components/PostCard';
import AdSenseAd from '@/components/AdSenseAd';
import { getPosterUrl, optimizeCloudinaryUrl, parseDate } from '@/lib/utils';

import { useUpload } from '@/contexts/UploadContext';
import { useGlobalStore } from '@/store/useGlobalStore';
import { localDB } from '@/lib/dexie';
import { formatReelDoc, populateReelsWithProfiles } from '@/lib/reelsHelper';
import { useContentFilter } from '@/hooks/useContentFilter';
import { toast } from 'sonner';

const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleWithRng = <T,>(arr: T[], rand: () => number): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const getPostKind = (p: any): 'image' | 'text' | 'nativeVideo' | 'youtube' => {
  const url = String(p?.media_url || p?.video_url || '').toLowerCase();
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (p?.media_type === 'video' || p?.video_url) return 'nativeVideo';
  if (p?.media_type === 'image' || p?.image_url || (p?.media_url && p?.media_type !== 'text')) return 'image';
  return 'text';
};

const Feed: React.FC = () => {
  const { id: sharedPostId } = useParams();
  const { currentUser } = useAuth();
  const { showAllReels } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { addUpload, uploads } = useUpload();
  const { isScanning: isModerating, scanFile } = useContentFilter();
  const openAuthModal = useGlobalStore((state) => state.openAuthModal);
  const [newPostContent, setNewPostContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | string | null>(null);
  const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileType, setFileType] = useState<'image' | 'video' | 'text'>('text');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [contentTypeFilter, setContentTypeFilter] = useState<'All' | 'Image' | 'Text' | 'Video'>('All');
  
  useEffect(() => {
    setSearchQuery('');
  }, [selectedCategory, contentTypeFilter]);

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (thumbnailPreview && thumbnailPreview.startsWith('blob:')) URL.revokeObjectURL(thumbnailPreview);
    };
  }, [thumbnailPreview]);
  const [postCategory, setPostCategory] = useState('Entertainment');
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const categories = ['All', 'Entertainment', 'Learning', 'AI', 'Technology', 'Music', 'Gaming', 'News', 'Lifestyle', 'Sports', 'Art'];
  
  const [ytLink, setYtLink] = useState('');
  const [showYoutube, setShowYoutube] = useState(false);
  
  const viewedPostsRef = useRef<Set<string>>(new Set());
  const observer = useRef<IntersectionObserver | null>(null);

  // Use Global Store for state
  const { feedPosts, fetchHomeFeed, postsLoading, postsError, hasMorePosts, addPostOptimistic } = useGlobalStore();

  const [ribbonReady, setRibbonReady] = useState(false);

  useEffect(() => {
    // Yield initial frame so navigation buttons, Navbar, and Sidebar are 100% interactive immediately
    const feedTimer = setTimeout(() => {
      fetchHomeFeed(false, false);
    }, 20);
    const ribbonTimer = setTimeout(() => {
      setRibbonReady(true);
    }, 220);
    return () => {
      clearTimeout(feedTimer);
      clearTimeout(ribbonTimer);
    };
  }, [fetchHomeFeed]);

  const handleLoadMore = () => {
    if (!postsLoading && hasMorePosts) {
      fetchHomeFeed(true);
    }
  };

  const handleRefreshFeed = () => {
    setFeedRandomSeed(Math.random());
    fetchHomeFeed(false, true); // Force refresh
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Fetch Reels (deferred slightly so critical interactive shell paints first)
  const { data: reels = [] } = useQuery({
    queryKey: ['reels_ribbon', showAllReels],
    enabled: ribbonReady,
    staleTime: 5 * 60 * 1000, // 5 minutes TTL
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      let localRibbonFallback: any[] = [];
      try {
        const cached = await localDB.feed_videos.limit(10).toArray();
        if (cached && cached.length > 0) {
          localRibbonFallback = cached.map(item => formatReelDoc(item));
        }
      } catch (dexErr) {
        console.warn('Dexie read error in feed ribbon:', dexErr);
      }

      try {
        const qReels = query(collection(db, 'reels'), limit(10));
        const reelsSnap = await getDocs(qReels).catch(() => ({ docs: [] } as any));
        
        const qPosts = query(collection(db, 'posts'), where('media_type', '==', 'video'), limit(10));
        const postsSnap = await getDocs(qPosts).catch(() => ({ docs: [] } as any));
        
        const allDocs = [...(reelsSnap as any).docs, ...(postsSnap as any).docs];
        let docs = allDocs.map(d => formatReelDoc(d));

        // Sort in memory instead of on firestore level to guarantee reliability
        docs.sort((a: any, b: any) => {
          const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return timeB - timeA;
        });
        
        // Deduplicate by ID
        let uniqueDocs = Array.from(new Map(docs.map(d => [d.id, d])).values());
        
        // Filter out non-native (youtube/embed) videos if showAllReels is false
        if (!showAllReels) {
          uniqueDocs = uniqueDocs.filter(r => 
            r.source_type === 'local' || 
            (r.media_url && !r.media_url.includes('youtube.com') && !r.media_url.includes('facebook.com') && !r.media_url.includes('/embed/'))
          );
        }

        if (uniqueDocs.length === 0 && localRibbonFallback.length > 0) {
          uniqueDocs = localRibbonFallback;
        }

        uniqueDocs = await populateReelsWithProfiles(uniqueDocs);
        return uniqueDocs.slice(0, 10);
      } catch (err) {
        console.warn('Reels ribbon query error (Quota/Network):', err);
        return localRibbonFallback.length > 0 ? localRibbonFallback : [];
      }
    },
  });

  const getPopulatedReel = async (d: any) => {
    try {
      const data = d.data ? d.data() : d;
      const id = d.id;
      let profiles = null;
      if (data.author_name) {
        profiles = {
           display_name: data.author_name,
           avatar_url: data.author_photo,
           username: data.author_username || 'user'
        };
      } else {
        profiles = await getProfile(data.user_id);
      }
      
      const likes: any[] = [];
      return { id, ...data, profiles, likes };
    } catch (e) {
      console.error("Error populating reel:", e);
      return { id: d.id, ...d.data ? d.data() : d };
    }
  };

  const profileCache = new Map();
  const getProfile = async (userId: string) => {
     if (!userId) return null;
     if (profileCache.has(userId)) return profileCache.get(userId);
     const userDoc = await getDoc(doc(db, 'profiles', userId));
     const data = userDoc.exists() ? userDoc.data() : null;
     profileCache.set(userId, data);
     return data;
  };

  const getPopulatedPost = async (d: any) => {
    try {
      const postData = d.data ? d.data() : d;
      const id = d.id || d.post_id;
      const profiles = await getProfile(postData.user_id);
      
      // Comments will be fetched lazily
      const comments: any[] = [];

      // Likes will be fetched lazily in the component
      const likes: any[] = [];

      return { id, ...postData, profiles, comments, likes };
    } catch (e) {
      console.error("Error populating post:", e);
      return { id: d.id, ...d.data ? d.data() : d };
    }
  };

  const { data: sharedPost } = useQuery({
    queryKey: ['post', sharedPostId],
    queryFn: async () => {
      if (!sharedPostId) return null;
      const postDoc = await getDoc(doc(db, 'posts', sharedPostId));
      if (!postDoc.exists()) return null;
      const data = postDoc.data();
      let profileData = null;
      if (data.user_id) {
         const userDoc = await getDoc(doc(db, 'profiles', data.user_id));
         if (userDoc.exists()) profileData = userDoc.data();
      }
      return { id: postDoc.id, ...data, profiles: profileData, comments: [], likes: [] };
    },
    enabled: !!sharedPostId,
  });

  const [feedRandomSeed, setFeedRandomSeed] = useState(() => Math.random());

  const posts = useMemo(() => {
    let flatPosts = [...feedPosts];

    if (sharedPost) {
      flatPosts = flatPosts.filter(p => p.id !== sharedPost.id);
    }

    if (flatPosts.length > 0) {
      const rand = mulberry32(Math.floor(feedRandomSeed * 1e9) || 1);

      // Bucket posts by content type (photos, text, uploaded videos, YouTube videos)
      // and shuffle every bucket randomly so YouTube posts never monopolize the top of the feed.
      const buckets: Record<'image' | 'text' | 'nativeVideo' | 'youtube', any[]> = {
        image: [],
        text: [],
        nativeVideo: [],
        youtube: []
      };

      flatPosts.forEach((p) => {
        buckets[getPostKind(p)].push(p);
      });

      (['image', 'text', 'nativeVideo', 'youtube'] as const).forEach((k) => {
        buckets[k] = shuffleWithRng(buckets[k], rand);
      });

      const activeKeys = (['image', 'text', 'nativeVideo', 'youtube'] as const).filter(k => buckets[k].length > 0);
      const mixed: any[] = [];

      // Weighted round-robin random draw across remaining buckets
      while (activeKeys.some(k => buckets[k].length > 0)) {
        const available = activeKeys.filter(k => buckets[k].length > 0);
        const turnOrder = shuffleWithRng(available, rand);
        for (const k of turnOrder) {
          const item = buckets[k].pop();
          if (item) mixed.push(item);
        }
      }

      flatPosts = mixed;
    }

    if (sharedPost) {
      flatPosts.unshift(sharedPost);
    }

    return flatPosts;
  }, [feedPosts, feedRandomSeed, sharedPost]);

  const handleObserve = useCallback((el: HTMLElement) => {
    observer.current?.observe(el);
  }, []);

  useEffect(() => {
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
    return () => obs.disconnect();
  }, []);

  const incrementViewCount = async (postId: string) => {
    if (!currentUser?.id) return;
    try {
      const postRef = doc(db, 'posts', postId);
      updateDoc(postRef, { views: increment(1) }).catch(() => {});
    } catch (err) {
      // Silently catch in case of quota or network issue
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      const contentStr = p.content || '';
      const nameStr = p.profiles?.display_name || '';
      const matchSearch = contentStr.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          nameStr.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchCat = true;
      if (selectedCategory !== 'All') {
         matchCat = (p.category || 'Entertainment').toLowerCase() === selectedCategory.toLowerCase();
      }
      
      let matchType = true;
      if (contentTypeFilter !== 'All') {
         const type = contentTypeFilter === 'Video' ? 'video' : contentTypeFilter.toLowerCase();
         const kind = getPostKind(p);
         const derivedType = (kind === 'youtube' || kind === 'nativeVideo') ? 'video' : kind;
         matchType = (p.media_type || derivedType) === type || derivedType === type;
      }

      return matchSearch && matchCat && matchType;
    });
  }, [posts, searchQuery, selectedCategory, contentTypeFilter]);

  const [visibleCount, setVisibleCount] = useState(5);
  const progressiveSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(5);
    const expandTimer = setTimeout(() => {
      setVisibleCount((prev) => (prev < 10 ? 10 : prev));
    }, 350);
    return () => clearTimeout(expandTimer);
  }, [searchQuery, selectedCategory, contentTypeFilter, feedRandomSeed]);

  const visiblePosts = useMemo(() => {
    return filteredPosts.slice(0, visibleCount);
  }, [filteredPosts, visibleCount]);

  useEffect(() => {
    if (visibleCount >= filteredPosts.length) return;
    const el = progressiveSentinelRef.current;
    if (!el) return;

    const progObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 10, filteredPosts.length));
        }
      },
      { rootMargin: '400px 0px' }
    );

    progObserver.observe(el);
    return () => progObserver.disconnect();
  }, [visibleCount, filteredPosts.length]);

  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMorePosts) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMorePosts && !postsLoading) {
        handleLoadMore();
      }
    }, { rootMargin: '400px 0px', threshold: 0.05 });

    const el = loadMoreRef.current;
    if (el) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [hasMorePosts, postsLoading]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (file) {
      const isVid = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|3gp|flv|wmv|m4v)$/i.test(file.name);
      const isImg = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|heic|bmp|svg)$/i.test(file.name);
      if (!isVid && !isImg) {
        toast.error('Please select a valid image or video file.');
        return;
      }

      // Ultra-strict AI Content Scanning
      const isSafe = await scanFile(file, inputEl);
      if (!isSafe) {
        setSelectedFile(null);
        setPreviewUrl(null);
        return;
      }

      const type = isVid ? 'video' : 'image';
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setFileType(type);
    }
  };

  const handleThumbnailSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const inputEl = e.target;
    if (file) {
      const isSafe = await scanFile(file, inputEl);
      if (!isSafe) {
        setSelectedThumbnail(null);
        setThumbnailPreview(null);
        return;
      }

      setSelectedThumbnail(file);
      setThumbnailPreview(URL.createObjectURL(file));
    }
  };

  const uploadToCloudinary = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'next_app_uploads');
    const cloudName = 'dcwe6ln0h';
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Cloudinary Upload Failed');
    const data = await res.json();
    return data.secure_url;
  };

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

  const getEmbedUrl = (url: string) => {
    if (!url) return null;
    const ytId = getYoutubeId(url);
    const fbUrl = getFacebookEmbedUrl(url);
    if (ytId) return `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&iv_load_policy=3&controls=1&disablekb=1&autoplay=0`;
    if (fbUrl) return fbUrl;
    return null;
  };

  const handleCreatePost = async () => {
    if (!newPostContent.trim() && !selectedFile && !ytLink) return;
    
    try {
      let mediaUrl = selectedFile;
      let mType = selectedFile ? fileType : 'text';
      
      let targetLink = ytLink;
      
      if (!targetLink && !selectedFile) {
        const urlMatch = newPostContent.match(/https?:\/\/(?:www\.|m\.|web\.)?(?:youtube\.com|youtu\.be|facebook\.com|fb\.watch)\/[^\s]+/i);
        if (urlMatch) targetLink = urlMatch[0];
      }

      const embedUrl = getEmbedUrl(targetLink);

      if (embedUrl) {
        mediaUrl = embedUrl;
        mType = 'video';
      }

      const category = showCategoryInput ? customCategory : postCategory;

      setIsUploading(true);

      let thumbnailUrl: string | undefined = undefined;
      if (selectedThumbnail) {
        try {
          thumbnailUrl = await uploadToCloudinary(selectedThumbnail);
        } catch (err) {
          console.error("Failed to upload custom thumbnail", err);
        }
      }

      const metadataObj: any = {
        userId: currentUser!.id,
        authorName: currentUser?.display_name || currentUser?.username || 'User',
        authorUsername: currentUser?.username || 'user',
        authorAvatar: currentUser?.avatar_url || '',
        authorVerified: Boolean(currentUser?.is_verified),
        content: newPostContent,
        mediaType: mType,
        category: category,
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['posts'] });
        }
      };
      if (thumbnailUrl) {
         metadataObj.payload = { 
             user_id: currentUser!.id,
             author_name: metadataObj.authorName,
             author_username: metadataObj.authorUsername,
             author_avatar: metadataObj.authorAvatar,
             author_verified: metadataObj.authorVerified,
             content: newPostContent,
             category: category,
             views: 0,
             thumbnail_url: thumbnailUrl 
         };
      }
      addUpload(mediaUrl || '', 'post', metadataObj);

      setNewPostContent('');
      setSelectedFile(null);
      setPreviewUrl(null);
      setSelectedThumbnail(null);
      setThumbnailPreview(null);
      setYtLink('');
      setShowYoutube(false);
      setShowCategoryInput(false);
      setCustomCategory('');
      setIsUploading(false);

    } catch (error: any) {
      setIsUploading(false);
      console.error('Post creation error:', error);
      toast.error('Failed to post: ' + (error.message || 'Unknown error.'));
    }
  };

  return (
    <div className="max-w-[700px] w-full mx-auto flex flex-col gap-4 pb-20 pt-4 px-4">
      {/* Search Bar */}
      <div className="bg-white dark:bg-black rounded-[2vmin] shadow-sm border border-gray-200 dark:border-gray-800 p-[1vmin] flex items-center gap-[1vmin] sticky top-0 z-40">
        <div className="flex-1 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center px-4 py-2 border border-transparent focus-within:border-[#1877F2] transition-all">
          <Search size={18} className="text-gray-400" />
          <input 
            placeholder="Search posts, users..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none ml-2 text-sm w-full font-bold text-gray-700 dark:text-gray-200 placeholder-gray-500" 
          />
        </div>
      </div>

      {/* Content Type Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
        {(['All', 'Image', 'Text', 'Video'] as const).map(type => (
          <button type="button" 
            key={type} 
            onClick={() => setContentTypeFilter(type)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${contentTypeFilter === type ? 'bg-[#1877F2] text-white border-[#1877F2] shadow-md' : 'bg-white dark:bg-black text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900'}`}
          >
            {type}
          </button>
        ))}
        <button type="button" 
          onClick={() => navigate('/reels')}
          className="px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border bg-white dark:bg-black text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 flex items-center gap-1"
        >
          <Clapperboard size={14} className="text-[#1877F2]" />
          Reels
        </button>
      </div>

      {/* Category Filter Bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
        {categories.map(cat => (
          <button type="button" 
            key={cat} 
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-all border ${selectedCategory === cat ? 'bg-[#1877F2] text-white border-[#1877F2] shadow-md' : 'bg-white dark:bg-black text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {!currentUser && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-4 text-white shadow-lg mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 animate-in fade-in duration-300">
          <div>
            <p className="font-extrabold text-base sm:text-lg">Welcome to Next!</p>
            <p className="text-xs sm:text-sm text-blue-100 mt-0.5">Explore posts, watch reels, or join to connect and share.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/login"
              className="bg-white text-[#1877F2] font-black text-xs sm:text-sm px-4 py-2 rounded-xl shadow-md hover:bg-blue-50 transition-all active:scale-95 text-center"
            >
              Log In
            </Link>
            <Link
              to="/register"
              className="bg-white/15 hover:bg-white/25 text-white border border-white/30 font-black text-xs sm:text-sm px-4 py-2 rounded-xl transition-all active:scale-95 text-center"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}

      {currentUser && (
        <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden mb-4">
          <div className="p-4 flex gap-3">
            <ProfileAvatar userId={currentUser?.id} defaultAvatar={currentUser?.avatar_url} name={currentUser?.display_name} className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm shrink-0" />
            <div className="flex-1">
              <textarea 
                value={newPostContent} 
                onChange={(e) => setNewPostContent(e.target.value)} 
                placeholder="What's on your mind?" 
              className="w-full bg-transparent border-none outline-none resize-none text-[15px] text-gray-800 dark:text-white placeholder-gray-500 font-medium pt-2 min-h-[40px]" 
              rows={newPostContent.split('\n').length > 1 ? Math.min(newPostContent.split('\n').length, 5) : 1} 
              style={{ overflow: 'hidden' }}
            />
            
            {selectedFile && previewUrl && (
              <div className="relative mt-3 flex flex-col gap-2">
                <div className="relative bg-gray-50 dark:bg-gray-900 rounded-xl overflow-hidden max-h-64 flex justify-center border border-gray-100 dark:border-gray-800">
                  {fileType === 'image' ? (
                    <img src={previewUrl} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <video src={previewUrl} controls playsInline className="h-full w-full object-contain bg-black" />
                  )}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button type="button" 
                      onClick={() => setShowEditor(true)}
                      className="bg-black/60 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/80 transition-all shadow-sm"
                      title="Edit Media"
                    >
                      <Pencil size={14} />
                    </button>
                    <button type="button" onClick={() => { setSelectedFile(null); setPreviewUrl(null); }} className="bg-black/60 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/80 transition-all shadow-sm">
                      <X size={14} />
                    </button>
                  </div>
                </div>
                
                {fileType === 'video' && (
                  <div className="flex gap-3 items-center bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-800 mt-1">
                    <input type="file" ref={thumbnailInputRef} hidden onChange={handleThumbnailSelect} accept="image/*" />
                    <button type="button" onClick={() => thumbnailInputRef.current?.click()} className="text-xs font-bold text-[#1877F2] hover:bg-blue-50 dark:hover:bg-blue-900/30 px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5">
                      <LucideImage size={14} /> {thumbnailPreview ? 'Change Cover' : 'Add Cover Image'}
                    </button>
                    {thumbnailPreview && (
                      <div className="relative w-8 h-8 rounded shrink-0 shadow-sm border border-gray-200 dark:border-gray-700">
                        <img src={thumbnailPreview} className="w-full h-full object-cover rounded" />
                        <button type="button" onClick={() => { setSelectedThumbnail(null); setThumbnailPreview(null); }} className="absolute -top-1.5 -right-1.5 bg-black text-white rounded-full shadow-md p-0.5">
                          <X size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {!selectedFile && (
              (ytLink && getEmbedUrl(ytLink)) || 
              (!ytLink && newPostContent.match(/https?:\/\/(?:www\.|m\.|web\.)?(?:youtube\.com|youtu\.be|facebook\.com|fb\.watch)\/[^\s]+/i) && getEmbedUrl(newPostContent.match(/https?:\/\/(?:www\.|m\.|web\.)?(?:youtube\.com|youtu\.be|facebook\.com|fb\.watch)\/[^\s]+/i)?.[0] || ''))
            ) && (
              <div className="relative mt-3 bg-black rounded-xl overflow-hidden aspect-video flex justify-center shadow-inner">
                <iframe 
                  src={getEmbedUrl(ytLink) || getEmbedUrl(newPostContent.match(/https?:\/\/(?:www\.|m\.|web\.)?(?:youtube\.com|youtu\.be|facebook\.com|fb\.watch)\/[^\s]+/i)?.[0] || '') || undefined} 
                  className="w-full h-full border-none"
                  allowFullScreen
                />
                <button type="button" 
                  onClick={() => { setYtLink(''); }} 
                  className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white p-2 rounded-full hover:bg-black/80 transition-all shadow-sm"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Options & Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-t border-gray-100 dark:border-gray-800/60 px-4 py-3 bg-gray-50/50 dark:bg-gray-900/30 gap-3">
          <div className="flex items-center gap-1 flex-wrap">
            <input type="file" ref={fileInputRef} hidden onChange={(e) => handleFileSelect(e)} accept="*/*" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-full text-green-500 transition-colors group" title="Photo/Video">
              <LucideImage size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-sm font-bold text-gray-600 dark:text-gray-400 hidden sm:inline">Media</span>
            </button>
            <button type="button" onClick={() => setShowCamera(true)} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full text-blue-500 transition-colors group" title="Camera">
              <Camera size={20} className="group-hover:scale-110 transition-transform" />
            </button>
            <button type="button" onClick={() => setShowYoutube(!showYoutube)} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full text-red-500 transition-colors group" title="Embed Video">
              <LinkIcon size={20} className="group-hover:scale-110 transition-transform" />
            </button>
            <button type="button" onClick={() => setShowCategoryInput(!showCategoryInput)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors group ${showCategoryInput || postCategory !== 'Entertainment' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-500' : 'hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-400'}`}>
              <CheckCircle size={20} className="group-hover:scale-110 transition-transform" />
              <span className="text-xs font-bold whitespace-nowrap hidden sm:inline">{postCategory === 'Entertainment' && !showCategoryInput ? 'Category' : postCategory}</span>
            </button>
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <button type="button" 
              onClick={handleCreatePost} 
              disabled={(!newPostContent.trim() && !selectedFile && !ytLink) || isUploading} 
              className="bg-[#1877F2] text-white px-6 py-2 rounded-full font-bold text-sm tracking-wide disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700 dark:disabled:text-gray-400 transition-all shadow-md hover:shadow-lg disabled:shadow-none hover:scale-[1.02] active:scale-[0.98] shrink-0 ml-auto"
            >
              Post
            </button>
          </div>
        </div>

        {/* Expandable Menus */}
        <div className="overflow-hidden">
          {showCategoryInput && (
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-black animate-in slide-in-from-top-2 duration-200">
              <input 
                type="text" 
                placeholder="Type custom category..." 
                value={customCategory}
                onChange={e => setCustomCategory(e.target.value)}
                autoFocus
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg outline-none border border-gray-200 dark:border-gray-700 focus:border-[#1877F2] text-sm font-medium shadow-sm text-gray-900 dark:text-white transition-colors"
              />
            </div>
          )}
          {!showCategoryInput && (newPostContent.trim() || selectedFile || ytLink) && (
            <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-black flex gap-2 overflow-x-auto scrollbar-hide">
              {categories.filter(c => c !== 'All').map(cat => (
                <button type="button" 
                  key={cat} 
                  onClick={() => setPostCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${postCategory === cat ? 'bg-black dark:bg-white text-white dark:text-black border-transparent shadow-sm' : 'bg-white dark:bg-black text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
          {showYoutube && (
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-black animate-in slide-in-from-top-2 duration-200">
              <input 
                type="text" 
                placeholder="Paste YouTube or Facebook Link..." 
                value={ytLink}
                onChange={e => setYtLink(e.target.value)}
                autoFocus
                className="w-full p-2.5 bg-gray-50 dark:bg-gray-900 rounded-lg outline-none border border-gray-200 dark:border-gray-700 focus:border-red-400 text-sm font-medium shadow-sm text-gray-900 dark:text-white transition-colors"
              />
            </div>
          )}
        </div>
      </div>
      )}

      {/* Quick Reels Ribbon */}
      {reels.length > 0 && (
        <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-black flex items-center gap-2 text-gray-900 dark:text-white"><Clapperboard size={20} className="text-[#1877F2]" /> Next Reels</h3>
            <Link to="/reels" className="text-[#1877F2] text-xs font-bold hover:underline">View All</Link>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {reels.slice(0, 10).map(reel => {
              const ytId = reel.source_type === 'youtube' ? reel.youtube_id : (reel.media_url?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/) || [])[1];
              const isYoutube = !!ytId;
              const posterImage = optimizeCloudinaryUrl(
                reel.thumbnail_url || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : getPosterUrl(reel.media_url)),
                { width: 320, type: 'image' }
              );

              return (
                <Link to={`/reels/${reel.id}`} key={reel.id} className="group relative flex-shrink-0 w-32 h-56 rounded-xl overflow-hidden bg-zinc-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:scale-[1.02] transition-transform">
                  {posterImage ? (
                    <img 
                      src={posterImage} 
                      alt={reel.content || 'Reel'} 
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                      referrerPolicy="no-referrer"
                    />
                  ) : reel.media_url ? (
                    <video 
                      src={!reel.media_url.includes('facebook') ? `${reel.media_url}#t=0.1` : reel.media_url} 
                      preload="none" 
                      muted 
                      playsInline 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none" 
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-800 text-zinc-500">
                      <Clapperboard size={32} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-between p-2.5">
                    <div className="flex justify-between items-start">
                      <div className="bg-black/50 p-1.5 rounded-full backdrop-blur-sm">
                        <Clapperboard size={14} className="text-white" />
                      </div>
                    </div>
                    <div>
                      {reel.author_name && (
                        <p className="text-white text-[11px] font-bold line-clamp-1 drop-shadow-sm mb-1">
                          {reel.author_name}
                        </p>
                      )}
                      <div className="flex items-center gap-1">
                        <ThumbsUp size={11} className="text-white drop-shadow-md" />
                        <span className="text-white text-[10px] font-bold drop-shadow-md">
                          {reel.likesCount ?? (Array.isArray(reel.likes) ? reel.likes.length : 0)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Combined Feed items */}
      {postsError && posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <p className="font-bold text-red-500">Error loading posts: {postsError.message}</p>
          <button type="button" onClick={handleRefreshFeed} className="bg-[#1877F2] text-white px-4 py-2 rounded-lg font-bold">Retry</button>
        </div>
      ) : postsLoading && posts.length === 0 ? (
        <div className="flex flex-col gap-4">
           {[...Array(3)].map((_, i) => (
             <div key={i} className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4">
               <div className="flex items-center gap-3 mb-4">
                 <div className="w-10 h-10 rounded-full shimmer-box shrink-0"></div>
                 <div className="flex-1">
                   <div className="h-4 rounded w-1/3 mb-2 shimmer-box"></div>
                   <div className="h-3 rounded w-1/4 shimmer-box"></div>
                 </div>
               </div>
               <div className="space-y-2 mb-4">
                 <div className="h-4 rounded w-full shimmer-box"></div>
                 <div className="h-4 rounded w-5/6 shimmer-box"></div>
                 <div className="h-4 rounded w-4/6 shimmer-box"></div>
               </div>
               <div className="w-full h-52 rounded-lg shimmer-box"></div>
             </div>
           ))}
        </div>
      ) : (
        <>
          {/* Optimistic Uploads */}
          {uploads.filter(u => u.type === 'post').map(upload => (
            <div key={upload.id} className={`bg-white dark:bg-black rounded-xl shadow-sm border ${upload.status === 'error' ? 'border-red-500' : 'border-[#1877F2] animate-pulse'} p-4`}>
              <div className="flex items-center gap-3 mb-3">
                <ProfileAvatar userId={currentUser?.id || ''} defaultAvatar={currentUser?.avatar_url} name={currentUser?.display_name} className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm" />
                <div>
                  <h4 className="font-bold text-gray-900 dark:text-white">{currentUser?.display_name}</h4>
                  <p className={`text-xs font-bold ${upload.status === 'error' ? 'text-red-500' : 'text-[#1877F2]'}`}>
                    {upload.status === 'error' ? 'Upload Failed. Please retry.' : `Uploading... ${Math.round(upload.progress)}%`}
                  </p>
                </div>
              </div>
              {upload.metadata?.content && <p className="text-gray-800 dark:text-gray-200 mb-3 text-sm">{upload.metadata.content}</p>}
              <div className={`w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-800 mt-2 overflow-hidden ${upload.status === 'error' ? 'hidden' : ''}`}>
                <div className="bg-[#1877F2] h-1.5 rounded-full transition-all duration-300" style={{ width: `${upload.progress}%` }}></div>
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-4">
            {visiblePosts.map((post, index) => (
              <div key={post.id} className="flex flex-col gap-4">
                <PostCard 
                  post={post} 
                  onObserve={handleObserve}
                />
                {(index + 1) % 5 === 0 && (
                  <AdSenseAd 
                    key={`ad-${post.id}-${Math.floor((index + 1) / 5) % 2 === 1 ? 'infeed' : 'display'}`}
                    slotType={Math.floor((index + 1) / 5) % 2 === 1 ? 'infeed' : 'display'} 
                  />
                )}
              </div>
            ))}
            {visibleCount < filteredPosts.length && (
              <div ref={progressiveSentinelRef} className="h-8 w-full flex items-center justify-center text-xs font-bold text-gray-400">
                Loading more posts...
              </div>
            )}
          </div>
          {hasMorePosts && (
            <div ref={loadMoreRef} className="py-4">
              {postsLoading ? (
                <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full shimmer-box shrink-0"></div>
                    <div className="flex-1">
                      <div className="h-3.5 rounded w-1/3 mb-2 shimmer-box"></div>
                      <div className="h-3 rounded w-1/5 shimmer-box"></div>
                    </div>
                  </div>
                  <div className="w-full h-36 rounded-lg shimmer-box"></div>
                </div>
              ) : (
                <p className="text-center font-bold text-gray-500 text-xs">Scroll for more posts</p>
              )}
            </div>
          )}
          {!hasMorePosts && posts.length > 0 && (
            <p className="text-center text-gray-400 font-bold py-4">You're all caught up!</p>
          )}
          {!postsLoading && posts.length === 0 && uploads.filter(u => u.type === 'post').length === 0 && (
            <div className="text-center py-10">
              <p className="text-gray-500 dark:text-gray-400 font-bold">No posts found.</p>
              <p className="text-sm text-gray-400 mt-2">Be the first to create a post!</p>
              <button
                type="button"
                onClick={handleRefreshFeed}
                className="mt-4 px-5 py-2 rounded-full bg-[#1877F2] text-white text-xs font-bold hover:opacity-90 transition-opacity"
              >
                Refresh Feed
              </button>
            </div>
          )}
          {!postsLoading && posts.length > 0 && filteredPosts.length === 0 && (
            <div className="text-center py-10 bg-white dark:bg-black rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <p className="text-gray-700 dark:text-gray-300 font-bold">No matching posts for current filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                  setContentTypeFilter('All');
                }}
                className="mt-3 px-4 py-2 rounded-full bg-[#1877F2] text-white text-xs font-bold hover:opacity-90 transition-opacity"
              >
                Reset Filters
              </button>
            </div>
          )}
        </>
      )}

      {/* Camera & Editor Modals */}
      {showCamera && (
        <Suspense fallback={null}>
          <CameraCapture 
            onCapture={(url, type) => {
              setSelectedFile(url);
              setPreviewUrl(url);
              setFileType(type);
              setShowCamera(false);
            }}
            onCancel={() => setShowCamera(false)}
          />
        </Suspense>
      )}

      {showEditor && selectedFile && previewUrl && (
        <Suspense fallback={null}>
          <MediaEditor 
            mediaUrl={previewUrl}
            mediaType={fileType as 'image' | 'video'}
            onSave={(processed) => {
              setSelectedFile(processed);
              setPreviewUrl(processed);
              setShowEditor(false);
            }}
            onCancel={() => setShowEditor(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Feed;
