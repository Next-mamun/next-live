import { localDB } from "@/lib/dexie";
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from './idbStorage';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, getDoc, doc, startAfter, or } from 'firebase/firestore';
import { toast } from 'sonner';
import { getActiveDB, switchDB } from '@/lib/dbHelper';
import { supabase } from '@/lib/supabase';
import { playNotificationSound, showNotification, showInAppNotificationToast } from '@/services/notificationService';

interface Post {
  id: string;
  [key: string]: any;
}

interface Message {
  id: string;
  [key: string]: any;
}

interface Notification {
  id: string;
  [key: string]: any;
}

interface GlobalState {
  currentUser: any | null;
  feedPosts: Post[];
  notifications: Notification[];
  messages: Message[];
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  lastFeedFetch: number | null;
  postsLoading: boolean;
  postsError: any;
  hasMorePosts: boolean;
  deletedPostIds: string[];
  isSupabaseActive: boolean;
  isChatOpen: boolean;
  activeChatId: string | null;
  isAuthModalOpen: boolean;
  authModalMessage: string;
  authModalAction: (() => void) | null;
  openAuthModal: (callback?: () => void, message?: string) => void;
  closeAuthModal: () => void;
  triggerFirebaseFallback: () => void;
  setIsChatOpen: (isOpen: boolean) => void;
  setActiveChatId: (id: string | null) => void;
  
  setCurrentUser: (user: any) => void;
  setFeedPosts: (posts: Post[]) => void;
  setDeletedPostIds: (ids: string[]) => void;
  addPostOptimistic: (post: Post) => void;
  updatePostOptimistic: (id: string, updates: Partial<Post>) => void;
  initMessageListener: (userId: string) => () => void;
  initNotificationListener: (userId: string) => () => void;
  fetchHomeFeed: (loadMore?: boolean, forceRefresh?: boolean) => Promise<void>;
  clearStore: () => void;
}

let messageUnsub: (() => void) | null = null;
let notifUnsub: (() => void) | null = null;
let initialMessageLoad = true;
const notifiedMessageIds = new Set<string>();

const handleIncomingMessageNotification = async (
  msg: any,
  currentUserId: string,
  stateGetter: () => GlobalState
) => {
  if (!msg || !msg.id || notifiedMessageIds.has(msg.id)) return;
  if (msg.sender_id === currentUserId || msg.receiver_id !== currentUserId) return;
  if (msg.is_read) return;

  const msgTime = msg.created_at ? new Date(msg.created_at).getTime() : Date.now();
  if (Math.abs(Date.now() - msgTime) > 15 * 60 * 1000) return;

  notifiedMessageIds.add(msg.id);
  if (notifiedMessageIds.size > 200) {
    const firstKey = notifiedMessageIds.values().next().value;
    if (firstKey) notifiedMessageIds.delete(firstKey);
  }

  const { isChatOpen, activeChatId } = stateGetter();
  if (isChatOpen && activeChatId === msg.sender_id) {
    playNotificationSound();
    return;
  }

  let senderName = msg.sender_name;
  let senderUsername = msg.sender_username;
  let senderAvatar = msg.sender_avatar;

  if (!senderName) {
    try {
      const { localDB } = await import('@/lib/dexie');
      const cached = await localDB.users.get(msg.sender_id);
      if (cached) {
        senderName = cached.display_name || cached.name || (cached.username ? `@${cached.username}` : 'User');
        senderUsername = cached.username;
        senderAvatar = cached.avatar_url || cached.avatar;
      } else {
        const snap = await getDoc(doc(db, 'profiles', msg.sender_id));
        if (snap.exists()) {
          const p = snap.data();
          senderName = p.display_name || p.name || (p.username ? `@${p.username}` : 'User');
          senderUsername = p.username;
          senderAvatar = p.avatar_url;
          localDB.users.put({ id: snap.id, username: p.username || '', display_name: senderName, avatar_url: p.avatar_url }).catch(() => {});
        }
      }
    } catch (e) {}
  }

  senderName = senderName || 'User';
  const usernameTag = (senderUsername && senderUsername !== msg.sender_id) ? ` (@${senderUsername})` : '';
  const title = `${senderName}${usernameTag}`;
  const body = msg.content || (msg.media_type ? `Sent a ${msg.media_type}` : 'Sent a message');
  const targetUrl = `/messages?user=${msg.sender_id}`;

  playNotificationSound();

  showNotification(title, {
    body,
    icon: senderAvatar || '/favicon.ico',
    data: { url: targetUrl, type: 'message', sender_id: msg.sender_id }
  });

  showInAppNotificationToast({
    title,
    body,
    avatar: senderAvatar,
    url: targetUrl,
    type: 'message',
    senderId: msg.sender_id
  });
};

export const useGlobalStore = create<GlobalState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      feedPosts: [],
      notifications: [],
      messages: [],
      unreadMessagesCount: 0,
      unreadNotificationsCount: 0,
      lastFeedFetch: null,
      postsLoading: false,
      postsError: null,
      hasMorePosts: true,
      deletedPostIds: [],
      isSupabaseActive: true,
      isChatOpen: false,
      activeChatId: null,
      isAuthModalOpen: false,
      authModalMessage: 'Join Next to like, comment and interact',
      authModalAction: null,
      openAuthModal: (callback?: () => void, message?: string) => set({
        isAuthModalOpen: true,
        authModalAction: callback || null,
        authModalMessage: message || 'Join Next to like, comment and interact'
      }),
      closeAuthModal: () => set({
        isAuthModalOpen: false,
        authModalAction: null
      }),
      setIsChatOpen: (isOpen: boolean) => set({ isChatOpen: isOpen }),
      setActiveChatId: (id: string | null) => set({ activeChatId: id }),

      triggerFirebaseFallback: () => {
        if (get().isSupabaseActive) {
          console.warn("⚠️ [Failover] Triggering Firebase Fallback for Messaging!");
          set({ isSupabaseActive: false });
        }
      },

      setCurrentUser: (user) => set({ currentUser: user }),

      setFeedPosts: (posts) => set({ feedPosts: posts, lastFeedFetch: Date.now() }),
      setDeletedPostIds: (ids) => set({ deletedPostIds: ids }),
      
      addPostOptimistic: (post) => set((state) => ({ 
        feedPosts: [post, ...state.feedPosts] 
      })),

      updatePostOptimistic: (id, updates) => set((state) => ({
        feedPosts: state.feedPosts.map(p => p.id === id ? { ...p, ...updates } : p)
      })),

      fetchHomeFeed: async (loadMore = false, forceRefresh = false) => {
        const { feedPosts } = get();

        // DELTA SYNC: No more 3-refresh logic. Just fetch smart incrementals if not loadMore.
        // We will do a regular fetch, but we do NOT clear localDB on start.
        try {
          set({ postsLoading: true, postsError: null });
          const activeDB = getActiveDB();
          let fetchedDocs: any[] = [];
          
          const profileCache = new Map();
          const getProfile = async (userId: string) => {
             if (!userId) return null;
             if (profileCache.has(userId)) return profileCache.get(userId);
             try {
               // STRICT ZERO-READ: Use Dexie if present!
               const localUser = await localDB.users.get(userId);
               if (localUser && (localUser.display_name || localUser.name)) {
                  const normalized = {
                    id: userId,
                    display_name: localUser.display_name || localUser.name || 'User',
                    name: localUser.display_name || localUser.name || 'User',
                    username: localUser.username || userId,
                    avatar_url: localUser.avatar_url || localUser.avatar || '',
                    avatar: localUser.avatar_url || localUser.avatar || '',
                    is_verified: !!localUser.is_verified,
                    email: localUser.email
                  };
                  profileCache.set(userId, normalized);
                  return normalized;
               }
               // Fetch from Firebase ONLY if completely missing
               const userDoc = await getDoc(doc(db, 'profiles', userId));
               const data = userDoc.exists() ? userDoc.data() : null;
               
               if (data) {
                 const normalized = {
                   id: userId,
                   display_name: data.display_name || data.name || 'User',
                   name: data.display_name || data.name || 'User',
                   username: data.username || userId,
                   avatar_url: data.avatar_url || data.avatar || '',
                   avatar: data.avatar_url || data.avatar || '',
                   is_verified: !!data.is_verified,
                   email: data.email
                 };
                 profileCache.set(userId, normalized);
                 localDB.users.put(normalized as any).catch(() => {});
                 return normalized;
               }
               return null;
             } catch (e) {
               console.warn("Profile fetch error for user:", userId, e);
               return { id: userId, display_name: 'User', name: 'User', avatar_url: '' };
             }
          };

          const fetchFromFirebase = async () => {
             // Instant hydration from Dexie for fast UI
             if (!loadMore && !forceRefresh) {
                try {
                  const localPosts = await localDB.posts.orderBy('created_at').reverse().limit(150).toArray();
                  if (localPosts.length > 0) {
                     // Shuffle local posts on first load
                     for (let i = localPosts.length - 1; i > 0; i--) {
                       const j = Math.floor(Math.random() * (i + 1));
                       [localPosts[i], localPosts[j]] = [localPosts[j], localPosts[i]];
                     }
                     set({ feedPosts: localPosts as any, postsLoading: false });
                  }
                } catch (dexErr) {}
             }

             // We fetch a larger pool of posts to allow for good randomization
             let q = query(collection(db, 'posts'), limit(150));
                
             let snap;
             try {
               snap = await getDocs(q);
             } catch (e: any) {
               console.warn("Error fetching posts:", e);
               const fallbackQ = query(collection(db, 'posts'), limit(150));
               snap = await getDocs(fallbackQ);
             }

             const rawDocs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

             // Shuffle the fetched posts array (Fisher-Yates shuffle)
             for (let i = rawDocs.length - 1; i > 0; i--) {
               const j = Math.floor(Math.random() * (i + 1));
               [rawDocs[i], rawDocs[j]] = [rawDocs[j], rawDocs[i]];
             }
             
             fetchedDocs = rawDocs;
          };

          const fetchFromSupabase = async () => {
             let supaQuery = supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(20);
             if (loadMore && feedPosts.length > 0) {
                const lastPost = feedPosts[feedPosts.length - 1];
                let dateVal = new Date().toISOString();
                if (lastPost.created_at) {
                   dateVal = typeof lastPost.created_at === 'string' ? lastPost.created_at : 
                     (lastPost.created_at.toDate ? lastPost.created_at.toDate().toISOString() : dateVal);
                }
                supaQuery = supaQuery.lt('created_at', dateVal);
             }
             const { data, error } = await supaQuery;
             if (error) throw error;
             if (data) fetchedDocs = data;
          };

          try {
            if (activeDB === 'firebase') {
              try {
                await fetchFromFirebase();
              } catch (err) {
                console.warn("Firebase fetch failed, switching DB:", err);
                switchDB('firebase');
                await fetchFromSupabase();
              }
            } else {
              try {
                await fetchFromSupabase();
              } catch (err) {
                console.warn("Supabase fetch failed, switching DB:", err);
                switchDB('supabase');
                await fetchFromFirebase();
              }
            }
          } catch (err) {
             console.error("Both databases failed.", err);
             throw err;
          }

          if (fetchedDocs.length === 0 && loadMore) {
             set({ hasMorePosts: false, postsLoading: false });
             return;
          }

          const populatedPosts = await Promise.all(fetchedDocs.map(async (data) => {
            // Read embedded like_count, comment_count, author_name, and author_photo directly from each post doc
            let profiles = await getProfile(data.user_id);
            if (!profiles && data.author_name) {
              profiles = {
                display_name: data.author_name,
                avatar_url: data.author_photo,
                username: data.author_username || 'user'
              };
            }
            return { 
              ...data, 
              profiles, 
              comments: [], // Comments are lazy loaded on demand 
              likes: []     // Likes are lazy loaded on demand
            };
          })) as Post[];
          
          // Batch Fetch Data Normalization: Dual Video Source
          const feedVideos = populatedPosts.map(p => {
             let videoType: 'CLOUDINARY' | 'YOUTUBE' | 'NONE' = 'NONE';
             let youtubeId = '';
             let mediaUrl = p.video_url || p.image_url || '';
             
             if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
               videoType = 'YOUTUBE';
               const match = mediaUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
               if (match) youtubeId = match[1];
             } else if (p.video_url) {
               videoType = 'CLOUDINARY';
             }

             return {
                id: p.id,
                videoType,
                mediaUrl,
                youtubeId,
                thumbnailUrl: p.image_url || '',
                caption: p.content || '',
                author: p.profiles?.display_name || 'Unknown',
                timestamp: typeof p.created_at === 'string' ? p.created_at : (p.created_at?.toDate ? p.created_at.toDate().toISOString() : new Date().toISOString())
             };
          }).filter(v => v.videoType !== 'NONE');

          if (feedVideos.length > 0) {
             try {
               await import('@/lib/dexie').then(async ({ localDB }) => {
                 // Delta Sync: Don't clear, just bulk put and manage LRU cap (50)
                 await localDB.feed_videos.bulkPut(feedVideos as any);
                 const totalVideos = await localDB.feed_videos.count();
                 if (totalVideos > 50) {
                   const all = await localDB.feed_videos.orderBy('timestamp').toArray();
                   const toRemove = all.slice(0, totalVideos - 50);
                   const idsToRemove = toRemove.map(item => item.id).filter(Boolean);
                   if (idsToRemove.length > 0) await localDB.feed_videos.bulkDelete(idsToRemove);
                 }
                 
                 // Full content caching for main feed
                 const offlinePosts = populatedPosts.map(p => ({
                   ...p,
                   created_at: typeof p.created_at === 'string' ? p.created_at : (p.created_at?.toDate ? p.created_at.toDate().toISOString() : new Date().toISOString())
                 }));
                 await localDB.posts.clear(); // Clear so random posts don't just grow forever
                 await localDB.posts.bulkPut(offlinePosts as any);
               });
             } catch (e) {
               console.warn("feed_videos bulkPut error", e);
             }
          }
          
          set((state) => ({ 
            feedPosts: loadMore ? [...state.feedPosts, ...populatedPosts] : populatedPosts, 
            lastFeedFetch: Date.now(), 
            hasMorePosts: false,
            postsLoading: false
          }));
        } catch (error: any) {
          console.error("Error fetching home feed:", error);
          set({ postsLoading: false, postsError: error });
        }
      },

      initMessageListener: (userId: string) => {
        if (messageUnsub) return messageUnsub;
        initialMessageLoad = true;
        
        // 1. Check local Dexie first for instant load
        localDB.messages.count().then(async count => {
          if (count > 0) {
            const localMsgs = await localDB.messages.toArray();
            const unread = localMsgs.filter(m => m.is_read === false).length;
            set({ messages: localMsgs, unreadMessagesCount: unread });
          }

          // 2. Fetch initial messages from Supabase and Firebase
          const fetchInitialMessages = async () => {
            let fetchedMsgs: any[] = [];

            if (get().isSupabaseActive) {
              try {
                const { data: supaMsgs, error: supaErr } = await supabase
                  .from('messages')
                  .select('*')
                  .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
                  .order('created_at', { ascending: false })
                  .limit(50);
  
                if (!supaErr && supaMsgs) {
                  fetchedMsgs = supaMsgs.map(m => ({
                    ...m,
                    content: m.content || m.text
                  }));
                }
              } catch (err) {
                console.warn("Supabase initial messages fetch error:", err);
              }
            }

            // Also fallback/augment with Firebase if needed
            if (fetchedMsgs.length === 0) {
              try {
                const qFb = query(
                  collection(db, 'messages'),
                  where('receiver_id', '==', userId),
                  limit(50)
                );
                const snap = await getDocs(qFb);
                fetchedMsgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
              } catch (e) {
                console.warn("Firebase initial messages fetch error:", e);
              }
            }

            if (fetchedMsgs.length > 0) {
              const unread = fetchedMsgs.filter(m => m.is_read === false && m.receiver_id === userId).length;
              set({ messages: fetchedMsgs, unreadMessagesCount: unread });
              try {
                localDB.messages.bulkPut(fetchedMsgs as any[]);
              } catch (e) {}
            }
          };

          fetchInitialMessages().then(() => {
            initialMessageLoad = false;
            const unsubs: Array<() => void> = [];

            // 3. Setup Listener: Supabase Realtime
            if (get().isSupabaseActive) {
              const globalChannel = supabase.channel(`global-user-messages:${userId}`)
                .on(
                  'postgres_changes',
                  {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                  },
                  async (payload: any) => {
                    const data = payload.new;
                    if (!data) return;
                    if (data.sender_id !== userId && data.receiver_id !== userId) return;
                    if (data.deleted_for_everyone || (data.deleted_for || []).includes(userId)) return;
  
                    const formattedMsg = {
                      id: data.id,
                      ...data,
                      content: data.content || data.text
                    };
  
                    set((state) => {
                      const exists = state.messages.some(m => m.id === formattedMsg.id);
                      const updated = exists ? state.messages.map(m => m.id === formattedMsg.id ? formattedMsg : m) : [formattedMsg, ...state.messages];
                      const unread = updated.filter(m => m.is_read === false && m.receiver_id === userId).length;
                      return { messages: updated, unreadMessagesCount: unread };
                    });

                    // Trigger instant notification for incoming messages
                    if (!initialMessageLoad && data.sender_id !== userId && data.receiver_id === userId) {
                      handleIncomingMessageNotification(formattedMsg, userId, get);
                    }
  
                    try {
                      localDB.messages.put(formattedMsg as any);
                      // If we receive a new message, un-hide the chat if it was deleted
                      const contactId = formattedMsg.sender_id === userId ? formattedMsg.receiver_id : formattedMsg.sender_id;
                      if (contactId) {
                        const deletedKey = 'deleted_chats_' + userId;
                        const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
                        if (deletedIds.includes(contactId)) {
                          const newIds = deletedIds.filter((id: string) => id !== contactId);
                          localStorage.setItem(deletedKey, JSON.stringify(newIds));
                          // Trigger re-render of contacts query globally
                          import('@tanstack/react-query').then(({ QueryClient }) => {
                            window.dispatchEvent(new Event('chat_undeleted'));
                          });
                        }
                      }
                    } catch (e) {}
                  }
                )
                .subscribe();

              unsubs.push(() => {
                supabase.removeChannel(globalChannel);
              });
            }
            
            // 4. Setup Listener: Firebase Firestore onSnapshot (guaranteed delivery)
            try {
              const qMessages = query(
                collection(db, 'messages'), 
                where('receiver_id', '==', userId),
                limit(50)
              );
              
              const fbUnsub = onSnapshot(qMessages, async (snapshot) => {
                const msgs = snapshot.docs.map(document => ({ id: document.id, ...document.data() })) as Message[];
                const unread = msgs.filter(m => m.is_read === false && m.receiver_id === userId).length;
                
                set((state) => {
                  const map = new Map<string, any>();
                  state.messages.forEach(m => map.set(m.id, m));
                  msgs.forEach(m => map.set(m.id, { ...map.get(m.id), ...m }));
                  const merged = Array.from(map.values());
                  return { messages: merged, unreadMessagesCount: unread };
                });

                if (!initialMessageLoad) {
                  snapshot.docChanges().forEach((change) => {
                    if (change.type === 'added') {
                      const msgData = { id: change.doc.id, ...change.doc.data() } as any;
                      if (msgData.sender_id !== userId && msgData.receiver_id === userId && !msgData.is_read) {
                        handleIncomingMessageNotification(msgData, userId, get);
                      }
                    }
                  });
                }
                
                if (msgs.length > 0) {
                  try {
                    localDB.messages.bulkPut(msgs as any[]);
                    // Un-hide chats for new messages
                    msgs.forEach(msg => {
                      const contactId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
                      if (contactId) {
                        const deletedKey = 'deleted_chats_' + userId;
                        const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
                        if (deletedIds.includes(contactId)) {
                          const newIds = deletedIds.filter((id: string) => id !== contactId);
                          localStorage.setItem(deletedKey, JSON.stringify(newIds));
                          window.dispatchEvent(new Event('chat_undeleted'));
                        }
                      }
                    });
                  } catch (e) {}
                }
              }, (err) => {
                console.warn("Global message listener snapshot warning:", err);
              });

              unsubs.push(fbUnsub);
            } catch (fbErr) {
              console.warn("Firebase global message listener setup error:", fbErr);
            }

            messageUnsub = () => {
              unsubs.forEach(u => {
                try { u(); } catch (e) {}
              });
              messageUnsub = null;
            };
          });
        });

        return () => {
          if (messageUnsub) {
            messageUnsub();
            messageUnsub = null;
          }
        };
      },

      initNotificationListener: (userId: string) => {
        if (notifUnsub) return notifUnsub;

        // Query notifications by user_id without composite index requirements
        const qNotifs = query(
          collection(db, 'notifications'),
          where('user_id', '==', userId),
          limit(50)
        );

        let initialNotifLoad = true;
        notifUnsub = onSnapshot(qNotifs, (snapshot) => {
          const rawDocs = snapshot.docs.map(document => ({ id: document.id, ...document.data() })) as Notification[];
          const notifs = rawDocs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
          const unread = notifs.filter(n => n.is_read === false).length;
          set({ notifications: notifs, unreadNotificationsCount: unread });

          if (initialNotifLoad) {
            initialNotifLoad = false;
            return;
          }

          snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
              const n = change.doc.data() as any;
              if (n.is_read) return;

              const notifTime = n.created_at ? new Date(n.created_at).getTime() : Date.now();
              if (Math.abs(Date.now() - notifTime) > 15 * 60 * 1000) return;

              let senderName = n.sender_name;
              let senderUsername = n.sender_username;
              let senderAvatar = n.sender_avatar;

              if (!senderName && n.sender_id) {
                try {
                  const pDoc = await getDoc(doc(db, 'profiles', n.sender_id));
                  if (pDoc.exists()) {
                    const pData = pDoc.data();
                    senderName = pData.display_name || pData.name || (pData.username ? `@${pData.username}` : 'User');
                    senderUsername = pData.username;
                    senderAvatar = pData.avatar_url;
                  }
                } catch (e) {}
              }

              senderName = senderName || 'User';
              const usernameTag = (senderUsername && senderUsername !== n.sender_id) ? ` (@${senderUsername})` : '';
              let title = `${senderName}${usernameTag}`;
              let body = 'interacted with you';
              let targetUrl = '/';

              if (n.type === 'message') {
                body = n.content || (n.media_type ? `Sent a ${n.media_type}` : 'Sent you a message');
                targetUrl = `/messages?user=${n.sender_id}`;
              } else if (n.type === 'like') {
                body = 'liked your post';
                targetUrl = n.post_id ? `/post/${n.post_id}` : '/';
              } else if (n.type === 'comment') {
                body = n.content ? `commented: "${n.content.slice(0, 35)}..."` : 'commented on your post';
                targetUrl = n.post_id ? `/post/${n.post_id}` : '/';
              } else if (n.type === 'friend_request') {
                body = 'sent you a friend request';
                targetUrl = '/friends';
              } else if (n.type === 'friend_accept') {
                body = 'accepted your friend request';
                targetUrl = '/friends';
              }

              // Only show if user isn't actively chatting with this user right now
              const { isChatOpen, activeChatId } = get();
              if (n.type === 'message' && isChatOpen && activeChatId === n.sender_id) {
                playNotificationSound();
                return;
              }

              playNotificationSound();

              showNotification(title, {
                body,
                icon: senderAvatar || '/favicon.ico',
                data: { url: targetUrl, type: n.type, sender_id: n.sender_id }
              });

              showInAppNotificationToast({
                title,
                body,
                avatar: senderAvatar,
                url: targetUrl,
                type: n.type,
                senderId: n.sender_id
              });
            }
          });
        }, (error) => {
          console.warn("Notifications snapshot listener error (handled):", error?.message || error);
        });

        // Module 2: Global Delete & Cache Invalidation Engine (Real-Time Active Client Removal)
        const qDeleted = query(collection(db, 'deleted_posts'), limit(20));
        const deletedUnsub = onSnapshot(qDeleted, (snapshot) => {
          snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
              const deletedId = change.doc.id; // Using doc.id as the postId, or change.doc.data().postId
              const data = change.doc.data();
              const targetId = data.postId || deletedId;
              
              // 1. Delete from IndexedDB
              import('@/lib/dexie').then(({ localDB }) => {
                localDB.feed_videos.delete(targetId);
                localDB.posts.delete(targetId);
              });
              
              // 2. Update UI
              set(state => ({
                feedPosts: state.feedPosts.filter(p => p.id !== targetId),
                deletedPostIds: [...new Set([...(state.deletedPostIds || []), targetId])]
              }));
            }
          });
        }, (error) => {
          console.warn("Deleted posts snapshot listener error (handled):", error?.message || error);
        });

        return () => {
          if (notifUnsub) {
            notifUnsub();
            notifUnsub = null;
          }
          if (deletedUnsub) {
            deletedUnsub();
          }
        };
      },

      clearStore: () => {
        if (messageUnsub) messageUnsub();
        if (notifUnsub) notifUnsub();
        messageUnsub = null;
        notifUnsub = null;
        set({
          currentUser: null,
          feedPosts: [],
          notifications: [],
          messages: [],
          unreadMessagesCount: 0,
          unreadNotificationsCount: 0,
          lastFeedFetch: null
        });
      }
    }),
    {
      name: 'next_media_global_store',
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({ 
        currentUser: state.currentUser, 
        feedPosts: state.feedPosts, 
        lastFeedFetch: state.lastFeedFetch,
        messages: state.messages,
        notifications: state.notifications,
        unreadMessagesCount: state.unreadMessagesCount,
        unreadNotificationsCount: state.unreadNotificationsCount
      }),
    }
  )
);
