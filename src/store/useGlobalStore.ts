import { localDB } from "@/lib/dexie";
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { idbStorage } from './idbStorage';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, getDocsFromServer, getDoc, doc, startAfter, or } from 'firebase/firestore';
import { toast } from 'sonner';
import { clearDBFallback, getActiveDB, switchDB } from '@/lib/dbHelper';
import { supabase } from '@/lib/supabase';
import { playNotificationSound, showNotification, showInAppNotificationToast, isMessageAlertsEnabled, isMentionAlertsEnabled } from '@/services/notificationService';
import { fetchProfileSmart, fetchProfilesBatchSmart, migrateUserMessagesOnce } from '@/lib/profileSync';
import { getSafeMessagePreview, isChatMuted } from '@/lib/utils';

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

export interface PendingLiveProposal {
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  timestamp: number;
}

const PENDING_LIVE_PROPOSALS_KEY = 'next_pending_live_proposals';
const LIVE_PROPOSAL_TTL_MS = 2 * 60 * 1000;

const readStoredLiveProposals = (): Record<string, PendingLiveProposal> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(PENDING_LIVE_PROPOSALS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cleaned: Record<string, PendingLiveProposal> = {};
    Object.entries(parsed || {}).forEach(([k, v]: [string, any]) => {
      if (v && v.senderId && now - Number(v.timestamp || 0) < LIVE_PROPOSAL_TTL_MS) {
        cleaned[k] = v;
      }
    });
    return cleaned;
  } catch (_) {
    return {};
  }
};

const writeStoredLiveProposals = (map: Record<string, PendingLiveProposal>) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_LIVE_PROPOSALS_KEY, JSON.stringify(map));
  } catch (_) {}
};

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
  pendingLiveProposals: Record<string, PendingLiveProposal>;
  setPendingLiveProposal: (proposal: PendingLiveProposal) => void;
  clearPendingLiveProposal: (senderId: string) => void;
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
const INITIAL_FEED_POOL = 25;
const FEED_PAGE_SIZE = 20;
let lastFirebaseFeedDoc: any = null;
let firebaseFeedOrderSupported = true;
let activeFeedFetchPromise: Promise<void> | null = null;

const countUnreadMessages = (msgs: any[], userId: string): number => {
  return msgs.filter(
    (m) =>
      m &&
      m.is_read === false &&
      m.receiver_id === userId &&
      m.sender_id !== userId &&
      !m.deleted_for_everyone &&
      !(Array.isArray(m.deleted_for) && m.deleted_for.includes(userId))
  ).length;
};

const handleIncomingMessageNotification = async (
  msg: any,
  currentUserId: string,
  stateGetter: () => GlobalState
) => {
  if (!msg || !msg.id || notifiedMessageIds.has(msg.id)) return;
  if (msg.sender_id === currentUserId || msg.receiver_id !== currentUserId) return;
  if (msg.is_read) return;
  if (isChatMuted(msg.sender_id)) return;
  if (!isMessageAlertsEnabled()) return;

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
      const cached = await localDB.users.get(msg.sender_id);
      if (cached) {
        senderName = cached.display_name || cached.name || (cached.username ? `@${cached.username}` : 'User');
        senderUsername = cached.username;
        senderAvatar = cached.avatar_url || cached.avatar;
      } else {
        const p = await fetchProfileSmart(msg.sender_id);
        if (p) {
          senderName = p.display_name || p.name || (p.username ? `@${p.username}` : 'User');
          senderUsername = p.username;
          senderAvatar = p.avatar_url || p.avatar;
        }
      }
    } catch (e) {}
  }

  senderName = senderName || 'User';
  const usernameTag = (senderUsername && senderUsername !== msg.sender_id) ? ` (@${senderUsername})` : '';
  const title = `${senderName}${usernameTag}`;
  const body = getSafeMessagePreview(msg);
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
    senderId: msg.sender_id,
    dedupeKey: `msg_${msg.id}`
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
      pendingLiveProposals: readStoredLiveProposals(),
      setPendingLiveProposal: (proposal) => {
        if (!proposal?.senderId) return;
        const current = get().pendingLiveProposals || {};
        const next = { ...current, [proposal.senderId]: proposal };
        writeStoredLiveProposals(next);
        set({ pendingLiveProposals: next });
      },
      clearPendingLiveProposal: (senderId) => {
        if (!senderId) return;
        const current = get().pendingLiveProposals || {};
        if (!current[senderId]) return;
        const next = { ...current };
        delete next[senderId];
        writeStoredLiveProposals(next);
        set({ pendingLiveProposals: next });
      },
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
        // Messaging is 100% Supabase; keep isSupabaseActive true.
        if (!get().isSupabaseActive) {
          set({ isSupabaseActive: true });
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
        if (!loadMore && !forceRefresh && activeFeedFetchPromise) {
          return activeFeedFetchPromise;
        }

        const runFetch = async () => {
          const { feedPosts, deletedPostIds } = get();
          const deletedSet = new Set(deletedPostIds || []);

          try {
            set({ postsLoading: true, postsError: null });

            // 1. Instant hydration from Dexie on initial paint regardless of activeDB
            if (!loadMore && !forceRefresh && feedPosts.length === 0) {
              try {
                const localPosts = await localDB.posts.orderBy('created_at').reverse().limit(INITIAL_FEED_POOL).toArray();
                const visibleLocal = localPosts.filter((p: any) => p?.id && !deletedSet.has(p.id));
                if (visibleLocal.length > 0) {
                  set({ feedPosts: visibleLocal as any, hasMorePosts: true });
                }
              } catch {}
            }

            const activeDB = getActiveDB();
            let fetchedDocs: any[] = [];
            let usedDB: 'firebase' | 'supabase' = activeDB;

            const profileCache = new Map();
            const fetchLimit = loadMore ? FEED_PAGE_SIZE : INITIAL_FEED_POOL;

            const fetchFromFirebase = async () => {
              if (!loadMore) {
                lastFirebaseFeedDoc = null;
                firebaseFeedOrderSupported = true;
              }

              let snap: any;
              try {
                let q = query(collection(db, 'posts'), orderBy('created_at', 'desc'), limit(fetchLimit));
                if (loadMore && lastFirebaseFeedDoc) {
                  q = query(collection(db, 'posts'), orderBy('created_at', 'desc'), startAfter(lastFirebaseFeedDoc), limit(fetchLimit));
                }
                snap = await getDocs(q);
                // If local persistence cache returned empty on initial load, force a server fetch
                if (!loadMore && snap.docs.length === 0) {
                  snap = await getDocsFromServer(q).catch(() => snap);
                }
                if (snap.docs.length > 0) {
                  lastFirebaseFeedDoc = snap.docs[snap.docs.length - 1];
                }
              } catch (e: any) {
                console.warn("Error fetching ordered posts, falling back to unordered:", e);
                firebaseFeedOrderSupported = false;
                const fallbackQ = query(collection(db, 'posts'), limit(INITIAL_FEED_POOL));
                snap = await getDocs(fallbackQ);
                if (!loadMore && snap.docs.length === 0) {
                  snap = await getDocsFromServer(fallbackQ).catch(() => snap);
                }
              }

              fetchedDocs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
            };

            const fetchFromSupabase = async () => {
              let supaQuery = supabase.from('posts').select('*').order('created_at', { ascending: false }).limit(fetchLimit);
              if (loadMore && feedPosts.length > 0) {
                const lastPost = feedPosts[feedPosts.length - 1];
                let dateVal = new Date().toISOString();
                if (lastPost.created_at) {
                  dateVal = typeof lastPost.created_at === 'string'
                    ? lastPost.created_at
                    : (lastPost.created_at.toDate ? lastPost.created_at.toDate().toISOString() : dateVal);
                }
                supaQuery = supaQuery.lt('created_at', dateVal);
              }
              const { data, error } = await supaQuery;
              if (error) throw error;
              fetchedDocs = Array.isArray(data) ? data : [];
            };

            const runWithTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
              Promise.race([
                promise,
                new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)),
              ]);

            if (activeDB === 'firebase') {
              try {
                await runWithTimeout(fetchFromFirebase(), 12000, 'Firebase feed');
                if (!loadMore && fetchedDocs.length === 0) {
                  await runWithTimeout(fetchFromSupabase(), 8000, 'Supabase feed empty fallback');
                  if (fetchedDocs.length > 0) usedDB = 'supabase';
                } else {
                  usedDB = 'firebase';
                  clearDBFallback();
                }
              } catch (fbErr) {
                console.warn("Firebase fetch failed/timed out, trying Supabase:", fbErr);
                switchDB('firebase');
                try {
                  await runWithTimeout(fetchFromSupabase(), 8000, 'Supabase feed fallback');
                  usedDB = 'supabase';
                } catch (supaErr) {
                  console.error("Both Firebase and Supabase feed fetches failed.", fbErr, supaErr);
                  throw fbErr;
                }
              }
            } else {
              try {
                await runWithTimeout(fetchFromSupabase(), 7000, 'Supabase feed');
                if (!loadMore && fetchedDocs.length === 0) {
                  // Supabase has no posts yet — always fall back to Firebase so Home Feed is never stuck empty!
                  await runWithTimeout(fetchFromFirebase(), 12000, 'Firebase feed empty fallback');
                  if (fetchedDocs.length > 0) {
                    usedDB = 'firebase';
                    clearDBFallback();
                  }
                } else {
                  usedDB = 'supabase';
                }
              } catch (supaErr) {
                console.warn("Supabase fetch failed/timed out, switching back to Firebase:", supaErr);
                switchDB('supabase');
                await runWithTimeout(fetchFromFirebase(), 12000, 'Firebase feed fallback');
                usedDB = 'firebase';
                if (fetchedDocs.length > 0) clearDBFallback();
              }
            }

            if (deletedSet.size > 0) {
              fetchedDocs = fetchedDocs.filter((d: any) => d?.id && !deletedSet.has(d.id));
            }

            if (fetchedDocs.length === 0 && loadMore) {
              set({ hasMorePosts: false, postsLoading: false });
              return;
            }

            // If remote unexpectedly returned 0 docs on initial load when we already have cached posts, keep cached posts
            if (!loadMore && fetchedDocs.length === 0 && get().feedPosts.length > 0) {
              set({ postsLoading: false, hasMorePosts: false });
              return;
            }

            // Fast local Dexie lookup first (<10ms) so authors appear immediately
            const uniqueUserIds = Array.from(new Set(fetchedDocs.map((d) => d.user_id).filter(Boolean)));
            if (uniqueUserIds.length > 0) {
              try {
                const cachedUsers = await localDB.users.where('id').anyOf(uniqueUserIds).toArray();
                cachedUsers.forEach((u: any) => {
                  if (u?.id) profileCache.set(u.id, u);
                });
              } catch {}
            }

            const missingUserIds = uniqueUserIds.filter((id) => !profileCache.has(id));
            let backgroundProfilePromise: Promise<Map<string, any>> | null = null;

            if (missingUserIds.length > 0) {
              backgroundProfilePromise = fetchProfilesBatchSmart(missingUserIds).catch(() => new Map<string, any>());
              try {
                // Wait up to 2.5s for batch profiles, then render posts immediately even if network is slow
                const fastProfiles = await Promise.race([
                  backgroundProfilePromise,
                  new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
                ]);
                if (fastProfiles) {
                  fastProfiles.forEach((prof, uid) => {
                    profileCache.set(uid, prof);
                  });
                  backgroundProfilePromise = null;
                }
              } catch {}
            }

            const buildPopulatedPosts = (docsList: any[], profMap: Map<string, any>) =>
              docsList.map((data) => {
                let profiles = profMap.get(data.user_id) || null;
                if (!profiles && data.author_name) {
                  profiles = {
                    id: data.user_id,
                    display_name: data.author_name,
                    name: data.author_name,
                    avatar_url: data.author_avatar || data.author_photo || '',
                    username: data.author_username || 'user',
                    is_verified: Boolean(data.author_verified),
                  };
                }
                return {
                  ...data,
                  profiles,
                  comments: Array.isArray(data.comments) ? data.comments : [],
                  likes: Array.isArray(data.likes) ? data.likes : [],
                };
              }) as Post[];

            const populatedPosts = buildPopulatedPosts(fetchedDocs, profileCache);

            // Batch Fetch Data Normalization: Dual Video Source
            const feedVideos = populatedPosts.map((p) => {
              let videoType: 'CLOUDINARY' | 'YOUTUBE' | 'NONE' = 'NONE';
              let youtubeId = '';
              const mediaUrl = p.video_url || p.image_url || p.media_url || '';

              if (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be')) {
                videoType = 'YOUTUBE';
                const match = mediaUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
                if (match) youtubeId = match[1];
              } else if (p.video_url || p.media_type === 'video') {
                videoType = 'CLOUDINARY';
              }

              return {
                id: p.id,
                videoType,
                mediaUrl,
                youtubeId,
                thumbnailUrl: p.thumbnail_url || p.image_url || '',
                caption: p.content || '',
                author: p.profiles?.display_name || 'Unknown',
                timestamp: typeof p.created_at === 'string'
                  ? p.created_at
                  : (p.created_at?.toDate ? p.created_at.toDate().toISOString() : new Date().toISOString()),
              };
            }).filter((v) => v.videoType !== 'NONE');

            if (feedVideos.length > 0 || populatedPosts.length > 0) {
              setTimeout(() => {
                import('@/lib/dexie').then(async ({ localDB }) => {
                  try {
                    if (feedVideos.length > 0) {
                      await localDB.feed_videos.bulkPut(feedVideos as any);
                      const totalVideos = await localDB.feed_videos.count();
                      if (totalVideos > 50) {
                        const all = await localDB.feed_videos.orderBy('timestamp').toArray();
                        const toRemove = all.slice(0, totalVideos - 50);
                        const idsToRemove = toRemove.map((item) => item.id).filter(Boolean);
                        if (idsToRemove.length > 0) await localDB.feed_videos.bulkDelete(idsToRemove);
                      }
                    }
                    if (populatedPosts.length > 0) {
                      const offlinePosts = populatedPosts.map((p) => ({
                        ...p,
                        created_at: typeof p.created_at === 'string'
                          ? p.created_at
                          : (p.created_at?.toDate ? p.created_at.toDate().toISOString() : new Date().toISOString()),
                      }));
                      if (!loadMore) {
                        await localDB.posts.clear();
                      }
                      await localDB.posts.bulkPut(offlinePosts as any);
                    }
                  } catch (e) {
                    console.warn("feed cache bulkPut error", e);
                  }
                }).catch(() => {});
              }, 250);
            }

            const hasMore = usedDB === 'firebase'
              ? (firebaseFeedOrderSupported && fetchedDocs.length >= fetchLimit)
              : fetchedDocs.length >= fetchLimit;

            set((state) => {
              const combined = loadMore ? [...state.feedPosts, ...populatedPosts] : populatedPosts;
              const deduped = Array.from(new Map(combined.map((p) => [p.id, p])).values());
              return {
                feedPosts: deduped,
                lastFeedFetch: Date.now(),
                hasMorePosts: hasMore,
                postsLoading: false,
                postsError: null,
              };
            });

            // Finish enriching any slow profiles in the background without holding up the feed
            if (backgroundProfilePromise) {
              backgroundProfilePromise.then((lateProfiles) => {
                if (!lateProfiles || lateProfiles.size === 0) return;
                set((state) => ({
                  feedPosts: state.feedPosts.map((p) => {
                    const late = lateProfiles.get(p.user_id);
                    return late ? { ...p, profiles: late } : p;
                  }),
                }));
              }).catch(() => {});
            }
          } catch (error: any) {
            console.error("Error fetching home feed:", error);
            // Only show error screen if we have zero posts to display
            const hasCached = get().feedPosts.length > 0;
            set({ postsLoading: false, postsError: hasCached ? null : error });
          }
        };

        if (!loadMore && !forceRefresh) {
          activeFeedFetchPromise = runFetch().finally(() => {
            activeFeedFetchPromise = null;
          });
          return activeFeedFetchPromise;
        }
        return runFetch();
      },

      initMessageListener: (userId: string) => {
        if (messageUnsub) return messageUnsub;
        initialMessageLoad = true;
        let cancelled = false;
        let activeGlobalChannel: any = null;

        const cleanup = () => {
          cancelled = true;
          if (activeGlobalChannel) {
            supabase.removeChannel(activeGlobalChannel);
            activeGlobalChannel = null;
          }
          messageUnsub = null;
        };
        messageUnsub = cleanup;

        // 1. Check local Dexie first for instant load
        localDB.messages.count().then(async count => {
          if (cancelled) return;
          if (count > 0) {
            const localMsgs = await localDB.messages.toArray();
            if (cancelled) return;
            const unread = countUnreadMessages(localMsgs, userId);
            set({ messages: localMsgs, unreadMessagesCount: unread });
          }

          // 2. Fetch initial messages 100% from Supabase (1:1 + groups user belongs to)
          const fetchInitialMessages = async () => {
            try {
              const { data: userGroups } = await supabase
                .from('profiles')
                .select('id')
                .eq('is_group', true)
                .contains('members', [userId]);
              const groupIds = (userGroups || []).map((g: any) => g.id).filter(Boolean);

              const directPromise = supabase
                .from('messages')
                .select('*')
                .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
                .order('created_at', { ascending: false })
                .limit(100);

              const groupPromise = groupIds.length > 0
                ? supabase
                    .from('messages')
                    .select('*')
                    .in('receiver_id', groupIds)
                    .order('created_at', { ascending: false })
                    .limit(50)
                : Promise.resolve({ data: [] as any[], error: null });

              const [directRes, groupRes] = await Promise.all([directPromise, groupPromise]);
              const combinedMap = new Map<string, any>();

              [...(directRes.data || []), ...(groupRes.data || [])].forEach((m: any) => {
                combinedMap.set(m.id, { ...m, content: m.content || m.text });
              });

              const fetchedMsgs = Array.from(combinedMap.values())
                .filter((m: any) => !m.deleted_for_everyone && !(m.deleted_for || []).includes(userId))
                .sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

              if (fetchedMsgs.length > 0 && !cancelled) {
                const unread = countUnreadMessages(fetchedMsgs, userId);
                set({ messages: fetchedMsgs, unreadMessagesCount: unread });
                localDB.messages.bulkPut(fetchedMsgs as any[]).catch(() => {});
              }
            } catch (err) {
              console.warn("Supabase initial messages fetch error:", err);
            }
          };

          setTimeout(() => {
            if (cancelled) return;
            migrateUserMessagesOnce(userId)
              .then((imported) => {
                if (imported && !cancelled) {
                  fetchInitialMessages();
                }
              })
              .catch(() => {});
          }, 3000);

          fetchInitialMessages().then(() => {
            if (cancelled) return;
            initialMessageLoad = false;

            // 3. Setup Listener: 100% Supabase Realtime (INSERT, UPDATE, DELETE)
            activeGlobalChannel = supabase.channel(`global-user-messages:${userId}`)
              .on(
                'postgres_changes',
                {
                  event: '*',
                  schema: 'public',
                  table: 'messages',
                },
                async (payload: any) => {
                  if (payload.eventType === 'DELETE') {
                    const delId = payload.old?.id;
                    if (!delId) return;
                    set((state) => {
                      const updated = state.messages.filter(m => m.id !== delId);
                      return { messages: updated, unreadMessagesCount: countUnreadMessages(updated, userId) };
                    });
                    localDB.messages.delete(delId).catch(() => {});
                    return;
                  }

                  const data = payload.new;
                  if (!data) return;
                  const isGroupMsg = typeof data.receiver_id === 'string' && data.receiver_id.startsWith('group_');
                  if (!isGroupMsg && data.sender_id !== userId && data.receiver_id !== userId) return;

                  if (data.deleted_for_everyone || (data.deleted_for || []).includes(userId)) {
                    set((state) => {
                      const updated = state.messages.filter(m => m.id !== data.id);
                      return { messages: updated, unreadMessagesCount: countUnreadMessages(updated, userId) };
                    });
                    localDB.messages.delete(data.id).catch(() => {});
                    return;
                  }

                  const formattedMsg = {
                    id: data.id,
                    ...data,
                    content: data.content || data.text
                  };

                  set((state) => {
                    const exists = state.messages.some(m => m.id === formattedMsg.id);
                    const updated = exists
                      ? state.messages.map(m => m.id === formattedMsg.id ? formattedMsg : m)
                      : [formattedMsg, ...state.messages];
                    return { messages: updated, unreadMessagesCount: countUnreadMessages(updated, userId) };
                  });

                  // Trigger instant notification for newly inserted incoming messages
                  if (
                    payload.eventType === 'INSERT' &&
                    !initialMessageLoad &&
                    data.sender_id !== userId &&
                    data.receiver_id === userId
                  ) {
                    handleIncomingMessageNotification(formattedMsg, userId, get);
                  }

                  try {
                    localDB.messages.put(formattedMsg as any);
                    if (payload.eventType === 'INSERT') {
                      const contactId = isGroupMsg
                        ? formattedMsg.receiver_id
                        : (formattedMsg.sender_id === userId ? formattedMsg.receiver_id : formattedMsg.sender_id);
                      if (contactId) {
                        const deletedKey = 'deleted_chats_' + userId;
                        const deletedIds = JSON.parse(localStorage.getItem(deletedKey) || '[]');
                        if (deletedIds.includes(contactId)) {
                          const newIds = deletedIds.filter((id: string) => id !== contactId);
                          localStorage.setItem(deletedKey, JSON.stringify(newIds));
                          window.dispatchEvent(new Event('chat_undeleted'));
                        }
                      }
                    }
                  } catch (e) {}
                }
              )
              .subscribe();
          });
        });

        return cleanup;
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
                  const pData = await fetchProfileSmart(n.sender_id);
                  if (pData) {
                    senderName = pData.display_name || pData.name || (pData.username ? `@${pData.username}` : 'User');
                    senderUsername = pData.username;
                    senderAvatar = pData.avatar_url || pData.avatar;
                  }
                } catch (e) {}
              }

              senderName = senderName || 'User';
              const usernameTag = (senderUsername && senderUsername !== n.sender_id) ? ` (@${senderUsername})` : '';
              let title = `${senderName}${usernameTag}`;
              let body = 'interacted with you';
              let targetUrl = '/';

              if (n.type === 'message') {
                if (isChatMuted(n.sender_id) || !isMessageAlertsEnabled()) return;
                body = getSafeMessagePreview(n);
                targetUrl = `/messages?user=${n.sender_id}`;
              } else if (n.type === 'mention') {
                if (!isMentionAlertsEnabled()) return;
                body = n.content ? `mentioned you: "${n.content.slice(0, 35)}..."` : 'mentioned you in a post';
                targetUrl = n.post_id ? `/post/${n.post_id}` : '/';
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
                senderId: n.sender_id,
                dedupeKey: n.notif_id ? `msg_${n.notif_id}` : `notif_${change.doc.id}`
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
