import { MoreVertical, Flag, Bookmark } from 'lucide-react';

import React, { useState, useEffect, useRef } from 'react';
import { ThumbsUp, MessageSquare, Trash2, Eye, Send, MessageCircle, Share2, Clapperboard } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, collection, query, where, getDocs, addDoc, increment } from 'firebase/firestore';
import { useAuth, useTheme } from '@/contexts/AuthContext';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import ZoomableImage from '@/components/ZoomableImage';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import VideoPlayer from '@/components/VideoPlayer';
import EmbedPlayer from '@/components/EmbedPlayer';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatTime, playInteractionSound, triggerHaptic } from '@/lib/utils';
import { toast } from 'sonner';
import { triggerNotification } from '@/services/notificationService';
import { useGlobalStore } from '@/store/useGlobalStore';

interface PostCardProps {
  post: any;
  onObserve?: (el: HTMLElement) => void;
  isProfileView?: boolean;
}

const PostCard = React.memo(({ post, onObserve, isProfileView = false }: PostCardProps) => {
  const { currentUser } = useAuth();
  const { soundEffects, hapticFeedback, autoplayVideos, saveDataMode } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [localComments, setLocalComments] = useState<any[]>(post.comments || []);
  
  // Optimistic UI state
  const initialIsLiked = post.likes?.some((l: any) => l.user_id === currentUser?.id);
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [likesCount, setLikesCount] = useState(post.like_count !== undefined ? post.like_count : (post.likes?.length || 0));
  const [commentsCount, setCommentsCount] = useState(post.comment_count !== undefined ? post.comment_count : (post.comments?.length || 0));
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [hasFetchedComments, setHasFetchedComments] = useState(false);
  
  const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
    let unmounted = false;
    // Avoid N+1 Firebase read - rely on initialIsLiked or likes array if provided
    if (initialIsLiked) setIsLiked(true);
    return () => { unmounted = true; };
  }, [post.id, currentUser?.id, initialIsLiked]);

  const loadCommentsOnDemand = async () => {
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
       setHasFetchedComments(true);
    } catch(e) {
       console.error("Error loading comments", e);
    }
  };

  const toggleComments = () => {
    if (!showComments) {
       loadCommentsOnDemand();
    }
    setShowComments(!showComments);
  };

  useEffect(() => {
    if (cardRef.current && onObserve) {
      onObserve(cardRef.current);
    }
  }, [onObserve]);

  // Sync local state if post prop changes from server, without clearing loaded comments
  useEffect(() => {
    setIsLiked(post.likes?.some((l: any) => l.user_id === currentUser?.id));
    if (post.like_count !== undefined) setLikesCount(post.like_count);
    else if (post.likes?.length !== undefined) setLikesCount(post.likes.length);
    
    if (post.comment_count !== undefined && !hasFetchedComments) {
      setCommentsCount(post.comment_count);
    }
    if (!hasFetchedComments && Array.isArray(post.comments) && post.comments.length > 0) {
      setLocalComments(post.comments);
    }
  }, [post.likes, post.like_count, post.comment_count, post.comments, currentUser?.id, hasFetchedComments]);

  const handleLike = async () => {
    if (!currentUser) {
      window.location.href = `/login?returnUrl=${encodeURIComponent(`/post/${post.id}`)}`;
      return;
    }
    // Optimistic update
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    const newLikesCount = newIsLiked ? likesCount + 1 : likesCount - 1;
    setLikesCount(newLikesCount);
    
    // Update global store
    const { updatePostOptimistic } = (await import('@/store/useGlobalStore')).useGlobalStore.getState();
    updatePostOptimistic(post.id, { 
      likes: newIsLiked 
        ? [...(post.likes || []), { user_id: currentUser.id }] 
        : (post.likes || []).filter((l: any) => l.user_id !== currentUser.id)
    });

    if (newIsLiked) {
       playInteractionSound(soundEffects);
       triggerHaptic(hapticFeedback);
    }
    
    try {
      const likeId = `${post.id}_${currentUser.id}`;
      const likeDocRef = doc(db, 'likes', likeId);

      if (isLiked) {
        // Delete like using deterministic ID
        await deleteDoc(likeDocRef);
      } else {
        // Insert like using deterministic ID
        await setDoc(likeDocRef, { post_id: post.id, user_id: currentUser.id, created_at: new Date().toISOString() });
        
        if (post.user_id !== currentUser.id) {
          const senderName = currentUser.display_name || currentUser.username || 'Someone';
          const usernameTag = currentUser.username ? ` (@${currentUser.username})` : '';

          await addDoc(collection(db, 'notifications'), {
            user_id: post.user_id,
            sender_id: currentUser.id,
            sender_name: senderName,
            sender_username: currentUser.username || '',
            sender_avatar: currentUser.avatar_url || '',
            post_id: post.id,
            type: 'like',
            is_read: false,
            created_at: new Date().toISOString()
          });
          
          triggerNotification(
            post.user_id,
            `${senderName}${usernameTag}`,
            'liked your post.',
            {
              type: 'like',
              post_id: post.id,
              sender_id: currentUser.id,
              sender_name: senderName,
              sender_username: currentUser.username || '',
              sender_avatar: currentUser.avatar_url || '',
              url: `/post/${post.id}`
            }
          );

          queryClient.invalidateQueries({ queryKey: ['notifications', post.user_id] });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
    } catch (error) {
      // Revert on failure
      setIsLiked(isLiked);
      setLikesCount(post.likes?.length || 0);
      console.error("Failed to toggle like", error);
    }
  };

  const handleShare = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const shareUrl = `${window.location.origin}/post/${post.id}`;
      if (navigator.share) {
        try {
          await navigator.share({
            title: `Post by ${post.profiles?.display_name}`,
            text: post.content,
            url: shareUrl,
          });
          return;
        } catch (shareErr: any) {
          // If the user cancelled, don't show an error or fallback
          if (shareErr.name === 'AbortError') return;
          console.warn('Navigator share failed, falling back to clipboard', shareErr);
        }
      }
      
      // Fallback for no navigator.share OR if it failed (e.g. iframe permission)
      await navigator.clipboard.writeText(shareUrl);
      toast.success('Link copied to clipboard!');
    } catch (e) {
      console.error('Final fallback share error', e);
    }
  };

  const handleCommentClick = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!currentUser) {
      window.location.href = `/login?returnUrl=${encodeURIComponent(`/post/${post.id}`)}`;
      return;
    }
    toggleComments();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim() || !currentUser) return;
    
    const commentText = comment.trim();
    setComment('');

    // Optimistic comment
    const newComment = {
      id: `comment-${Date.now()}`,
      post_id: post.id,
      user_id: currentUser.id,
      content: commentText,
      created_at: new Date().toISOString(),
      profiles: {
        id: currentUser.id,
        display_name: currentUser.display_name || 'User',
        username: currentUser.username || 'user',
        avatar_url: currentUser.avatar_url || '',
        is_verified: currentUser.is_verified || false
      }
    };
    
    setLocalComments(prev => [...prev, newComment]);
    setCommentsCount(c => c + 1);
    setHasFetchedComments(true);

    try {
      const docRef = await addDoc(collection(db, 'comments'), { 
        post_id: post.id, 
        user_id: currentUser.id, 
        content: commentText, 
        created_at: newComment.created_at 
      });

      // Update with real Firestore ID
      setLocalComments(prev => prev.map(c => c.id === newComment.id ? { ...c, id: docRef.id } : c));

      // Atomic increment on Firestore posts document
      try {
        await updateDoc(doc(db, 'posts', post.id), {
          comment_count: increment(1)
        });
      } catch (e) {}

      // Update global store
      const { updatePostOptimistic } = useGlobalStore.getState();
      updatePostOptimistic(post.id, { 
        comment_count: (post.comment_count || 0) + 1,
        comments: [...(post.comments || []), newComment]
      });

      if (post.user_id !== currentUser.id) {
        const senderName = currentUser.display_name || currentUser.username || 'Someone';
        const usernameTag = currentUser.username ? ` (@${currentUser.username})` : '';

        await addDoc(collection(db, 'notifications'), {
          user_id: post.user_id,
          sender_id: currentUser.id,
          sender_name: senderName,
          sender_username: currentUser.username || '',
          sender_avatar: currentUser.avatar_url || '',
          post_id: post.id,
          type: 'comment',
          content: commentText,
          is_read: false,
          created_at: new Date().toISOString()
        }).catch(() => {});
        
        triggerNotification(
          post.user_id,
          `${senderName}${usernameTag}`,
          `commented: "${commentText.slice(0, 35)}..."`,
          {
            type: 'comment',
            post_id: post.id,
            sender_id: currentUser.id,
            sender_name: senderName,
            sender_username: currentUser.username || '',
            sender_avatar: currentUser.avatar_url || '',
            url: `/post/${post.id}`
          }
        );

        queryClient.invalidateQueries({ queryKey: ['notifications', post.user_id] });
      }
    } catch (error) {
      console.error("Failed to post comment", error);
      toast.error("Failed to send comment");
    }
  };

  const triggerDelete = () => {
    setShowConfirmDelete(true);
  };

  const executeDelete = async () => {
    setShowConfirmDelete(false);
    const postId = post.id;
    
    // Optimistic delete: hide from all queries starting with 'posts'
    queryClient.setQueriesData({ queryKey: ['posts'] }, (oldData: any) => {
      if (!oldData || !oldData.pages) return oldData;
      return {
        ...oldData,
        pages: oldData.pages.map((page: any) => ({
             ...page,
             data: page.data ? page.data.filter((p: any) => p.id !== postId) : page.filter((p: any) => p.id !== postId)
        }))
      };
    });
    // Update userPosts cache
    queryClient.setQueriesData({ queryKey: ['userPosts'] }, (oldData: any) => {
       if (!oldData) return oldData;
       if (oldData.pages) {
          return {
             ...oldData,
             pages: oldData.pages.map((page: any) => ({
                ...page,
                data: page.data ? page.data.filter((p: any) => p.id !== postId) : page.filter((p: any) => p.id !== postId)
             }))
          };
       }
       if (Array.isArray(oldData)) {
         return oldData.filter((p: any) => p.id !== postId);
       }
       return oldData;
    });

    // CRITICAL: Update global store to instantly remove from feed
    const globalStore = useGlobalStore.getState();
    globalStore.setFeedPosts(globalStore.feedPosts.filter((p: any) => p.id !== postId));
    // CRITICAL: Update deletedPostIds globally to instantly hide from Profile View
    globalStore.setDeletedPostIds([...new Set([...(globalStore.deletedPostIds || []), postId])]);

    try {
      import('@/lib/dexie').then(({ localDB }) => {
        localDB.posts.delete(postId).catch(() => {});
        localDB.feed_videos.delete(postId).catch(() => {});
      }).catch(() => {});
      
      // Delete post directly from Firestore
      await deleteDoc(doc(db, 'posts', postId));
      
      // Also try to remove from supabase if available
      import('@/lib/supabase').then(({ supabase }) => {
        try {
          supabase.from('posts').delete().eq('id', postId);
        } catch (e) {}
      }).catch(() => {});

      toast.success('Post deleted successfully');
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast.error('Failed to delete post');
      // Re-invalidate on failure
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['userPosts'] });
    }
  };

  return (
    <div ref={cardRef} data-post-id={post.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 500px' }} className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-all">
      <div className="p-4 flex justify-between items-center">
        <Link to={`/profile/${post.profiles?.username || 'unknown'}`} className="flex gap-3 hover:opacity-80 transition-opacity">
          <ProfileAvatar userId={post.user_id} defaultAvatar={post.profiles?.avatar_url || post.profiles?.avatar} name={post.profiles?.display_name || post.profiles?.name} className="w-[40px] h-[40px] rounded-full object-cover border border-gray-200 dark:border-gray-800" />
          <div>
            <p className="font-bold text-[15px] text-gray-900 dark:text-white leading-tight flex items-center gap-2">
              {post.profiles?.display_name || post.profiles?.name || 'User'}
              {post.profiles?.is_verified && <VerifiedBadge />}
              {post.category && <span className="text-[10px] bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full border border-orange-100 dark:border-orange-800">{post.category}</span>}
            </p>
            <p className="text-[12px] text-gray-500 dark:text-gray-400 font-medium">{formatTime(post.created_at || new Date().toISOString(), { showYear: true })}</p>
          </div>
        </Link>
        
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
            <MoreVertical size={18} />
          </button>
          
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)}></div>
              <div className="absolute right-0 top-10 mt-1 w-48 bg-white dark:bg-[#1a1a1b] border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg z-50 overflow-hidden animate-in fade-in zoom-in duration-200">
                <button 
                  onClick={async () => {
                    setShowMenu(false);
                    try {
                      const { localDB } = require('@/lib/dexie');
                      await localDB.saved_content.put({
                        id: post.id,
                        media_url: post.media_url || '',
                        media_type: post.media_type || '',
                        text: post.content || '',
                        author_name: post.profiles?.display_name || post.profiles?.name || 'User',
                        author_avatar: post.profiles?.avatar_url || post.profiles?.avatar || '',
                        saved_at: Date.now()
                      });
                      toast.success('Saved locally!');
                    } catch (e) {
                      console.warn(e);
                      toast.error('Failed to save');
                    }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Bookmark size={18} />
                  Save locally
                </button>
                <button 
                  onClick={() => {
                    setShowMenu(false);
                    setShowReport(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Flag size={18} />
                  Report post
                </button>
                {post.user_id === currentUser?.id && (
                  <button 
                    onClick={() => {
                      setShowMenu(false);
                      triggerDelete();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 size={18} />
                    Delete post
                  </button>
                )}
              </div>
            </>
          )}
        </div>

      </div>
      <p className="px-4 pb-3 text-[15px] text-gray-800 dark:text-gray-200 leading-relaxed font-medium">{post.content}</p>
      {post.media_url && (
        <div className="bg-black flex items-center justify-center">
          {post.media_url.includes('/embed/') || post.media_url.includes('plugins/video.php') ? (
            <EmbedPlayer src={post.media_url} />
          ) : post.media_type === 'image' ? (
            <ZoomableImage src={post.media_url} className="w-full max-h-[600px] object-contain" referrerPolicy="no-referrer" />
          ) : (
            <VideoPlayer src={post.media_url} className="w-full max-h-[600px]" />
          )}
        </div>
      )}
      <div className="px-4 py-1">
        <div className="flex justify-between text-[13px] text-gray-500 dark:text-gray-400 py-2 font-bold">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5"><ThumbsUp size={12} className="text-white bg-[#1877F2] p-0.5 rounded-full" /> {likesCount} Likes</div>
            <div className="flex items-center gap-1.5"><Eye size={14} className="text-gray-400" /> {post.views || 0} Views</div>
          </div>
          <button onClick={toggleComments} className="hover:underline">{commentsCount} comments</button>
        </div>
        <div className="flex border-t border-gray-100 dark:border-gray-800 py-1 gap-1">
          <button onClick={handleLike} className={`flex-1 flex items-center justify-center gap-2 py-2 font-bold transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900 ${isLiked ? 'text-[#1877F2]' : 'text-gray-600 dark:text-gray-400'}`}><ThumbsUp size={20} /> Like</button>
          <button onClick={handleCommentClick} className="flex-1 flex items-center justify-center gap-2 py-2 font-bold text-gray-600 dark:text-gray-400 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"><MessageSquare size={20} /> Comment</button>
          <button onClick={handleShare} className="flex-1 flex items-center justify-center gap-2 py-2 font-bold text-gray-600 dark:text-gray-400 transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"><Share2 size={20} /> Share</button>
          {isProfileView && (
            <button onClick={() => navigate('/')} className="flex-1 flex items-center justify-center gap-2 py-2 font-bold text-[#1877F2] transition-colors rounded-lg hover:bg-gray-50 dark:hover:bg-gray-900"><MessageCircle size={20} /> Feed</button>
          )}
        </div>
      </div>
      
      {showComments && (
        <div className="px-4 pb-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
          <div className="max-h-60 overflow-y-auto py-2 space-y-3 scrollbar-hide">
            {localComments.map((c: any, index: number) => (
              <div key={c.id || index} className="flex gap-2">
                <Link to={`/profile/${c.profiles?.username || 'unknown'}`}>
                  <ProfileAvatar userId={c.user_id} defaultAvatar={c.profiles?.avatar_url} name={c.profiles?.display_name} className="w-[32px] h-[32px] rounded-full object-cover border border-gray-200 dark:border-gray-800" />
                </Link>
                <div className="bg-white dark:bg-black px-3 py-2 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex-1">
                  <Link to={`/profile/${c.profiles?.username || 'unknown'}`} className="font-bold text-[13px] text-gray-900 dark:text-white hover:underline flex items-center gap-1">
                    {c.profiles?.display_name || 'User'}
                    {c.profiles?.is_verified && <VerifiedBadge size={12} />}
                  </Link>
                  <p className="text-[14px] text-gray-800 dark:text-gray-200">{c.content}</p>
                </div>
              </div>
            ))}
            {localComments.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-2">No comments yet. Be the first!</p>
            )}
          </div>
          <form onSubmit={handleComment} className="mt-2 flex gap-2">
            <ProfileAvatar userId={currentUser?.id || ''} defaultAvatar={currentUser?.avatar_url} name={currentUser?.display_name} className="w-[32px] h-[32px] rounded-full object-cover border border-gray-200 dark:border-gray-800" />
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={comment} 
                onChange={(e) => setComment(e.target.value)} 
                placeholder="Write a comment..." 
                className="w-full bg-white dark:bg-black border border-gray-200 dark:border-gray-800 rounded-full px-4 py-1.5 text-sm outline-none focus:border-[#1877F2] pr-10 text-gray-900 dark:text-white placeholder-gray-500"
              />
              <button type="submit" disabled={!comment.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#1877F2] disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        isOpen={showConfirmDelete}
        title="Delete Post"
        message="Are you sure you want to delete this post? This action cannot be undone."
        onConfirm={executeDelete}
        onCancel={() => setShowConfirmDelete(false)}
      />

      {showReport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl w-full max-w-sm p-6 shadow-xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Report Content</h3>
            <p className="text-sm text-gray-500 mb-4">Please tell us why you are reporting this content.</p>
            <textarea
              className="w-full p-3 rounded-xl bg-gray-50 dark:bg-black border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white mb-4 outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
              placeholder="Reason for report..."
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            ></textarea>
            <div className="flex gap-3">
              <button 
                className="flex-1 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold"
                onClick={() => setShowReport(false)}
              >
                Cancel
              </button>
              <button 
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold"
                onClick={async () => {
                  if (!reportReason.trim()) return toast.error('Please provide a reason');
                  try {
                    await addDoc(collection(db, 'reports'), {
                      reporter_id: currentUser?.id,
                      reported_entity_id: post.id,
                      entity_type: 'post',
                      reason: reportReason,
                      created_at: new Date().toISOString()
                    });
                    toast.success('Report submitted successfully');
                    setShowReport(false);
                  } catch (e) {
                    toast.error('Failed to submit report');
                  }
                }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default PostCard;
