import React, { useState, useEffect, useMemo } from 'react';
import { UserMinus, MessageSquare, Check, X, UserPlus, Search, Ban } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import {
  backfillPublicProfilesOnce,
  fetchProfilesBatchSmart,
  migrateUserFriendshipsOnce,
  cacheUserInDexie,
  fetchUserFriendshipsSmart,
  sendFriendRequestSmart,
  updateFriendshipStatusSmart,
  deleteFriendshipSmart,
  blockUserSmart,
} from '@/lib/profileSync';
import { useNavigate } from 'react-router-dom';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { redis } from '@/lib/redis';
import { triggerNotification } from '@/services/notificationService';
import { localDB, LocalFriend } from '@/lib/dexie';

const Friends: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'discover' | 'blocked'>('discover');
  const [dexieSeedData, setDexieSeedData] = useState<{ requests: any[]; friends: any[]; discovery: any[]; blockedUsers: any[] } | undefined>(undefined);

  const [localPendingRequests, setLocalPendingRequests] = useState<Record<string, boolean>>({});
  const [localCancelledRequests, setLocalCancelledRequests] = useState<Record<string, boolean>>({});
  const [localAcceptedRequests, setLocalAcceptedRequests] = useState<Record<string, boolean>>({});
  const [localDeletedRequests, setLocalDeletedRequests] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedSearch('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(trimmed);
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Instant (<10ms) Dexie hydration so Friends page never flashes empty skeleton when cached
  useEffect(() => {
    if (!currentUser?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const [cachedFriends, cachedUsers] = await Promise.all([
          localDB.friends.toArray(),
          localDB.users.limit(60).toArray()
        ]);
        if (cancelled || (cachedFriends.length === 0 && cachedUsers.length === 0)) return;

        const frsFallback = cachedFriends
          .filter(f => f.status === 'accepted')
          .map(f => ({ id: f.id, friendship_id: f.friendship_id, display_name: f.name, username: f.username, avatar_url: f.avatar }));
        const reqsFallback = cachedFriends
          .filter(f => f.status === 'pending' && !f.is_pending)
          .map(f => ({ id: f.id, friendship_id: f.friendship_id, display_name: f.name, username: f.username, avatar_url: f.avatar }));
        const blksFallback = cachedFriends
          .filter(f => f.status === 'blocked')
          .map(f => ({ id: f.id, friendship_id: f.friendship_id, display_name: f.name, username: f.username, avatar_url: f.avatar }));
        const relatedSet = new Set([currentUser.id, ...cachedFriends.map(f => f.id)]);
        const pendingSent = cachedFriends
          .filter(f => f.status === 'pending' && f.is_pending)
          .map(f => ({ id: f.id, friendship_id: f.friendship_id, display_name: f.name, username: f.username, avatar_url: f.avatar, is_pending: true }));
        const discFallback = [
          ...pendingSent,
          ...cachedUsers
            .filter((u: any) => u.id && !u.is_group && !String(u.id).startsWith('group_') && !relatedSet.has(u.id))
            .map((u: any) => ({ id: u.id, display_name: u.display_name || u.name, username: u.username, avatar_url: u.avatar_url || u.avatar, is_verified: u.is_verified }))
        ];

        if (!cancelled) {
          setDexieSeedData({ requests: reqsFallback, friends: frsFallback, blockedUsers: blksFallback, discovery: discFallback });
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id) return;

    Promise.all([
      backfillPublicProfilesOnce(),
      migrateUserFriendshipsOnce(currentUser.id)
    ])
      .then(([profChanged, relChanged]) => {
        if (profChanged || relChanged) {
          queryClient.invalidateQueries({ queryKey: ['friends'] });
        }
      })
      .catch(() => {});

    const channel = supabase
      .channel(`friends-realtime-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friendships' },
        (payload: any) => {
          const row = payload.new || payload.old;
          if (
            !row ||
            !row.sender_id ||
            row.sender_id === currentUser.id ||
            row.receiver_id === currentUser.id
          ) {
            queryClient.invalidateQueries({ queryKey: ['friends'] });
            queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
            queryClient.invalidateQueries({ queryKey: ['friendsCount'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.id, queryClient]);

  const { data: friendsData, isLoading: loading } = useQuery({
    queryKey: ['friends', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return { requests: [], friends: [], discovery: [], blockedUsers: [], relatedIds: [currentUser?.id].filter(Boolean) };

      const cacheKey = `friends_cache_${currentUser.id}`;

      // Fetch friendships & lightweight discover profiles in parallel (never select('*') or 150 rows sequentially)
      const [relRes, profRes] = await Promise.all([
        fetchUserFriendshipsSmart(currentUser.id),
        supabase
          .from('profiles')
          .select('id,display_name,username,avatar_url,is_verified,is_group,created_at')
          .neq('id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(60)
      ]);

      const { rows: allRel, error: relErr } = relRes;
      const { data: profData, error: profErr } = profRes;

      if (relErr) console.warn('Friendships query error:', relErr.message || relErr);
      if (profErr) console.warn('Supabase profiles query error:', profErr.message);

      if (relErr && profErr && dexieSeedData) {
        return dexieSeedData;
      }

      const allProf = (profData || [])
        .filter((p: any) => !p.is_group && !String(p.id).startsWith('group_'));

      const profMap = new Map(allProf.map((p: any) => [p.id, p]));

      const missingProfIds = allRel
        .map(rel => (rel.sender_id === currentUser.id ? rel.receiver_id : rel.sender_id))
        .filter(id => id && !profMap.has(id));

      if (missingProfIds.length > 0) {
        const fetchedMap = await fetchProfilesBatchSmart(missingProfIds);
        fetchedMap.forEach((p, id) => profMap.set(id, p));
      }

      const reqs: any[] = [];
      const frs: any[] = [];
      const blks: any[] = [];
      const disc: any[] = [];

      const relatedIds = new Set<string>([currentUser.id]);
      const dexieUpdates: LocalFriend[] = [];

      allRel.forEach(rel => {
        const otherId = rel.sender_id === currentUser.id ? rel.receiver_id : rel.sender_id;
        const otherProf = profMap.get(otherId);
        if (!otherProf) return;

        relatedIds.add(otherId);

        dexieUpdates.push({
          id: otherProf.id,
          friendship_id: rel.id,
          name: otherProf.display_name || '',
          username: otherProf.username || '',
          avatar: otherProf.avatar_url || '',
          status: rel.status,
          is_pending: rel.status === 'pending' && rel.sender_id === currentUser.id
        });

        if (rel.status === 'accepted') {
          frs.push({ ...otherProf, friendship_id: rel.id });
        } else if (rel.status === 'pending') {
          if (rel.receiver_id === currentUser.id) {
            reqs.push({ ...otherProf, friendship_id: rel.id, profiles: otherProf });
          } else {
            disc.push({ ...otherProf, friendship_id: rel.id, is_pending: true });
          }
        } else if (rel.status === 'blocked') {
          if (rel.sender_id === currentUser.id) {
            blks.push({ ...otherProf, friendship_id: rel.id });
          }
        }
      });

      allProf.forEach((p: any) => {
        if (!relatedIds.has(p.id)) {
          disc.push(p);
        }
      });

      const uniqueById = (list: any[]) => {
        const map = new Map();
        list.forEach(item => {
          if (!map.has(item.id)) map.set(item.id, item);
        });
        return Array.from(map.values());
      };

      const result = {
        requests: uniqueById(reqs),
        friends: uniqueById(frs),
        blockedUsers: uniqueById(blks),
        discovery: uniqueById(disc),
        relatedIds: Array.from(relatedIds)
      };

      // Persist Dexie & Redis strictly in background so UI paints in 0ms without blocking on avatar conversions
      setTimeout(() => {
        try {
          allProf.slice(0, 40).forEach((p: any) => cacheUserInDexie(p));
          if (!relErr) {
            localDB.friends.clear()
              .then(() => {
                if (dexieUpdates.length > 0) {
                  return localDB.friends.bulkPut(dexieUpdates).then(() => undefined);
                }
                return undefined;
              })
              .catch(() => {});
          }
          redis.setex(cacheKey, 60, JSON.stringify(result)).catch(() => {});
        } catch (_) {}
      }, 40);

      return result;
    },
    placeholderData: dexieSeedData,
    staleTime: 60 * 1000,
    gcTime: Infinity,
  });

  // Lightweight debounced remote search ONLY when user types >= 2 chars (never blocks keystrokes or re-fetches friendships)
  const { data: remoteSearchResults = [], isFetching: isSearchingRemote } = useQuery({
    queryKey: ['friends-remote-search', currentUser?.id, debouncedSearch],
    enabled: Boolean(currentUser?.id && debouncedSearch.length >= 2),
    queryFn: async () => {
      if (!currentUser?.id || !debouncedSearch) return [];
      const sq = debouncedSearch.replace(/[%_,()]/g, '').trim();
      if (!sq) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id,display_name,username,avatar_url,is_verified,is_group')
        .neq('id', currentUser.id)
        .or(`display_name.ilike.%${sq}%,username.ilike.%${sq}%`)
        .limit(30);
      if (error) return [];
      return (data || []).filter((p: any) => !p.is_group && !String(p.id).startsWith('group_'));
    },
    staleTime: 30 * 1000,
  });

  const baseData = friendsData || dexieSeedData || { requests: [], friends: [], discovery: [], blockedUsers: [] };
  const { requests = [], friends = [], discovery = [], blockedUsers = [] } = baseData;

  const filterBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (list: any[]) => {
      if (!q) return list;
      return list.filter((p) => {
        const target = p.profiles || p;
        const name = (target.display_name || '').toLowerCase();
        const user = (target.username || '').toLowerCase();
        return name.includes(q) || user.includes(q);
      });
    };
  }, [searchQuery]);

  const displayedRequests = useMemo(
    () => filterBySearch(requests.filter((r: any) => !localAcceptedRequests[r.friendship_id] && !localDeletedRequests[r.friendship_id])),
    [filterBySearch, requests, localAcceptedRequests, localDeletedRequests]
  );

  const acceptedFriends = useMemo(
    () => requests
      .filter((r: any) => localAcceptedRequests[r.friendship_id])
      .map((r: any) => ({
        id: r.id,
        display_name: r.profiles?.display_name || r.display_name,
        username: r.profiles?.username || r.username,
        avatar_url: r.profiles?.avatar_url || r.avatar_url,
        is_verified: r.profiles?.is_verified || r.is_verified,
        friendship_id: r.friendship_id
      })),
    [requests, localAcceptedRequests]
  );

  const displayedFriends = useMemo(
    () => filterBySearch([...friends, ...acceptedFriends].filter((f: any) => !localDeletedRequests[f.friendship_id])),
    [filterBySearch, friends, acceptedFriends, localDeletedRequests]
  );

  const displayedBlocked = useMemo(
    () => filterBySearch(blockedUsers),
    [filterBySearch, blockedUsers]
  );

  const displayedDiscovery = useMemo(() => {
    const existingIds = new Set<string>([
      ...friends.map((f: any) => f.id),
      ...requests.map((r: any) => r.id),
      ...blockedUsers.map((b: any) => b.id),
      ...discovery.map((d: any) => d.id),
    ]);

    const extraRemote = (remoteSearchResults || []).filter((p: any) => p?.id && !existingIds.has(p.id));
    const combined = extraRemote.length > 0 ? [...discovery, ...extraRemote] : discovery;

    return filterBySearch(combined)
      .map((p: any) => {
        let isPending = p.is_pending;
        if (localPendingRequests[p.id]) isPending = true;
        if (localCancelledRequests[p.id]) isPending = false;
        return { ...p, is_pending: isPending };
      })
      .filter((p: any) => !localDeletedRequests[p.friendship_id || p.id]);
  }, [friends, requests, blockedUsers, discovery, remoteSearchResults, filterBySearch, localPendingRequests, localCancelledRequests, localDeletedRequests]);

  const handleStatus = async (id: string, status: 'accepted' | 'delete' | 'blocked') => {
    if (status === 'delete') {
      try {
        await localDB.friends.where('friendship_id').equals(id).delete();
      } catch (e) {
        console.warn('Failed to delete from localDB', e);
      }
      setLocalDeletedRequests(prev => ({ ...prev, [id]: true }));
      if ((window as any).cinemaPeers) {
        Object.values((window as any).cinemaPeers).forEach((peer: any) => {
          if (peer?.open) peer.send({ type: 'DELETE_SYNC', id });
        });
      }
      if ((window as any).meetPeers) {
        Object.values((window as any).meetPeers).forEach((peer: any) => {
          if (peer?.open) peer.send({ type: 'DELETE_SYNC', id });
        });
      }
    } else if (status === 'accepted') {
      setLocalAcceptedRequests(prev => ({ ...prev, [id]: true }));
    }

    const previousData = queryClient.getQueryData(['friends', currentUser?.id]);
    queryClient.setQueryData(['friends', currentUser?.id], (old: any) => {
      if (!old) return old;
      if (status === 'delete') {
        return {
          ...old,
          requests: old.requests.filter((r: any) => r.friendship_id !== id),
          friends: old.friends.filter((f: any) => f.friendship_id !== id)
        };
      }
      if (status === 'accepted') {
        const acceptedReq = old.requests.find((r: any) => r.friendship_id === id);
        if (!acceptedReq) return old;
        return {
          ...old,
          requests: old.requests.filter((r: any) => r.friendship_id !== id),
          friends: [...old.friends, { ...acceptedReq, friendship_id: id }]
        };
      }
      return old;
    });

    try {
      if (status === 'delete') {
        await deleteFriendshipSmart(id);
      } else {
        const friendship = await updateFriendshipStatusSmart(id, status);

        if (status === 'accepted' && friendship) {
          const otherId = friendship.sender_id === currentUser?.id ? friendship.receiver_id : friendship.sender_id;
          const senderName = currentUser?.display_name || currentUser?.username || 'Someone';
          const usernameTag = currentUser?.username ? ` (@${currentUser.username})` : '';

          await addDoc(collection(db, 'notifications'), {
            user_id: otherId,
            sender_id: currentUser?.id,
            sender_name: senderName,
            sender_username: currentUser?.username || '',
            sender_avatar: currentUser?.avatar_url || '',
            type: 'friend_accept',
            is_read: false,
            created_at: new Date().toISOString()
          });

          triggerNotification(
            otherId,
            `${senderName}${usernameTag}`,
            'accepted your friend request!',
            {
              type: 'friend_accept',
              sender_id: currentUser?.id,
              sender_name: senderName,
              sender_username: currentUser?.username || '',
              sender_avatar: currentUser?.avatar_url || '',
              url: '/friends'
            }
          );

          queryClient.invalidateQueries({ queryKey: ['notifications', otherId] });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendsCount'] });
    } catch (err) {
      console.error('Error updating status:', err);
      if (status === 'accepted') {
        setLocalAcceptedRequests(prev => ({ ...prev, [id]: false }));
      } else if (status === 'delete') {
        setLocalDeletedRequests(prev => ({ ...prev, [id]: false }));
      }
      queryClient.setQueryData(['friends', currentUser?.id], previousData);
    }
  };

  const sendRequest = async (targetId: string) => {
    if (!currentUser?.id) return;
    setLocalPendingRequests(prev => ({ ...prev, [targetId]: true }));
    setLocalCancelledRequests(prev => ({ ...prev, [targetId]: false }));

    const tempId = 'temp-' + Date.now();
    const previousData = queryClient.getQueryData(['friends', currentUser.id]);
    queryClient.setQueryData(['friends', currentUser.id], (old: any) => {
      if (!old) return old;
      const targetUser = old.discovery.find((u: any) => u.id === targetId);
      if (!targetUser) return old;
      return {
        ...old,
        discovery: old.discovery.map((u: any) =>
          u.id === targetId ? { ...u, is_pending: true, friendship_id: tempId } : u
        )
      };
    });

    try {
      const inserted = await sendFriendRequestSmart(currentUser.id, targetId);

      if (inserted?.id) {
        queryClient.setQueryData(['friends', currentUser.id], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            discovery: old.discovery.map((u: any) =>
              u.id === targetId ? { ...u, is_pending: true, friendship_id: inserted.id } : u
            )
          };
        });
      }

      const senderName = currentUser?.display_name || currentUser?.username || 'Someone';
      const usernameTag = currentUser?.username ? ` (@${currentUser.username})` : '';

      await addDoc(collection(db, 'notifications'), {
        user_id: targetId,
        sender_id: currentUser.id,
        sender_name: senderName,
        sender_username: currentUser?.username || '',
        sender_avatar: currentUser?.avatar_url || '',
        type: 'friend_request',
        is_read: false,
        created_at: new Date().toISOString()
      });

      triggerNotification(
        targetId,
        `${senderName}${usernameTag}`,
        'sent you a friend request!',
        {
          type: 'friend_request',
          sender_id: currentUser.id,
          sender_name: senderName,
          sender_username: currentUser?.username || '',
          sender_avatar: currentUser?.avatar_url || '',
          url: '/friends'
        }
      );

      queryClient.invalidateQueries({ queryKey: ['notifications', targetId] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    } catch (err) {
      console.error('Error sending request:', err);
      setLocalPendingRequests(prev => ({ ...prev, [targetId]: false }));
      queryClient.setQueryData(['friends', currentUser.id], previousData);
    }
  };

  const cancelRequest = async (friendshipId: string, targetUserId?: string) => {
    const targetInDiscovery = discovery.find((u: any) =>
      (friendshipId && u.friendship_id === friendshipId) || (targetUserId && u.id === targetUserId)
    );
    const resolvedTargetId = targetUserId || targetInDiscovery?.id;

    if (resolvedTargetId) {
      setLocalPendingRequests(prev => ({ ...prev, [resolvedTargetId]: false }));
      setLocalCancelledRequests(prev => ({ ...prev, [resolvedTargetId]: true }));
    }

    queryClient.setQueryData(['friends', currentUser?.id], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        discovery: old.discovery.map((u: any) =>
          (u.friendship_id === friendshipId || (resolvedTargetId && u.id === resolvedTargetId))
            ? { ...u, is_pending: false, friendship_id: null }
            : u
        ),
        requests: old.requests.filter((u: any) => u.friendship_id !== friendshipId)
      };
    });

    try {
      await deleteFriendshipSmart(friendshipId, currentUser?.id, resolvedTargetId);
      queryClient.invalidateQueries({ queryKey: ['friends'] });
    } catch (e) {
      if (resolvedTargetId) {
        setLocalPendingRequests(prev => ({ ...prev, [resolvedTargetId]: true }));
        setLocalCancelledRequests(prev => ({ ...prev, [resolvedTargetId]: false }));
      }
    }
  };

  const blockUser = async (targetId: string, friendshipId?: string) => {
    if (!currentUser?.id) return;
    try {
      await blockUserSmart(currentUser.id, targetId, friendshipId);
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
    } catch (e) {
      console.error('Error blocking user:', e);
    }
  };

  const unblockUser = async (friendshipId: string) => {
    try {
      await deleteFriendshipSmart(friendshipId);
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
    } catch (e) {
      console.error('Error unblocking user:', e);
    }
  };

  return (
    <div className="max-w-[1000px] mx-auto py-8 px-4 pb-24">
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white">Friends Center</h1>
        
        <div className="flex items-center gap-2 bg-white dark:bg-black p-2 rounded-full shadow-sm border border-gray-200 dark:border-gray-800 w-full md:w-auto">
            <Search size={20} className="text-gray-400 ml-2" />
            <input 
                type="text" 
                placeholder="Find friends..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none px-2 py-1 w-full md:w-64 text-gray-900 dark:text-white placeholder-gray-500"
            />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-4 mb-6 scrollbar-hide">
        <button onClick={() => setActiveTab('discover')} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all ${activeTab === 'discover' ? 'bg-[#1877F2] text-white shadow-md' : 'bg-white dark:bg-black text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-800'}`}>
            Discover
        </button>
        <button onClick={() => setActiveTab('friends')} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all ${activeTab === 'friends' ? 'bg-[#1877F2] text-white shadow-md' : 'bg-white dark:bg-black text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-800'}`}>
            My Friends <span className="ml-1 opacity-80 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">{displayedFriends.length}</span>
        </button>
        <button onClick={() => setActiveTab('requests')} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all ${activeTab === 'requests' ? 'bg-[#1877F2] text-white shadow-md' : 'bg-white dark:bg-black text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-800'}`}>
            Requests <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${displayedRequests.length > 0 ? 'bg-red-500 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{displayedRequests.length}</span>
        </button>
        <button onClick={() => setActiveTab('blocked')} className={`px-6 py-2 rounded-full font-bold whitespace-nowrap transition-all ${activeTab === 'blocked' ? 'bg-[#1877F2] text-white shadow-md' : 'bg-white dark:bg-black text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-800'}`}>
            Blocked
        </button>
      </div>

      {loading && !friendsData && !dexieSeedData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white dark:bg-black border border-gray-100 dark:border-gray-800 rounded-2xl p-4 flex flex-col items-center text-center animate-pulse">
                <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-800 mb-3"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-2/3 mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2 mb-4"></div>
                <div className="w-full h-10 bg-gray-200 dark:bg-gray-800 rounded-xl"></div>
              </div>
            ))}
          </div>
      ) : (
        <>
            {activeTab === 'requests' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-300">
                    {displayedRequests.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-gray-400 font-medium">No pending friend requests.</div>
                    ) : displayedRequests.map((r: any) => (
                    <div key={r.id} className="bg-white dark:bg-black border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-5 flex flex-col items-center transition-all hover:shadow-md">
                        <div onClick={() => navigate(`/profile/${r.profiles?.username || r.username || r.id}`)} className="cursor-pointer">
                            <ProfileAvatar userId={r.profiles?.id || r.id || ''} defaultAvatar={r.profiles?.avatar_url || r.avatar_url || undefined} name={r.profiles?.display_name || r.display_name || r.profiles?.username || r.username || 'User'} className="w-24 h-24 rounded-full object-cover shadow-lg border-2 border-white dark:border-gray-700 mb-4" />
                        </div>
                        <p className="font-bold text-gray-900 dark:text-white text-lg mb-4 flex items-center gap-1">
                          {r.profiles?.display_name || r.display_name}
                          {(r.profiles?.is_verified || r.is_verified) && <VerifiedBadge />}
                        </p>
                        <div className="flex gap-2 w-full">
                        <button onClick={() => handleStatus(r.friendship_id, 'accepted')} className="flex-1 bg-[#1877F2] text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm hover:bg-[#166fe5] transition-all"><Check size={18}/> Accept</button>
                        <button onClick={() => handleStatus(r.friendship_id, 'delete')} className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300 px-4 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-800 transition-all"><X size={18}/></button>
                        </div>
                    </div>
                    ))}
                </div>
            )}

            {activeTab === 'discover' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in duration-300">
                    {displayedDiscovery.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-gray-400 font-medium">
                          {isSearchingRemote ? 'Searching users...' : 'No new users found. Try searching!'}
                        </div>
                    ) : displayedDiscovery.map((p: any) => (
                    <div key={p.id} className="bg-white dark:bg-black border border-gray-100 dark:border-gray-800 rounded-2xl p-4 flex flex-col items-center text-center transition-all hover:shadow-md relative group">
                        <div onClick={() => navigate(`/profile/${p.username || p.id}`)} className="cursor-pointer">
                            <ProfileAvatar userId={p.id} defaultAvatar={p.avatar_url || undefined} name={p.display_name || p.username || 'User'} className="w-20 h-20 rounded-full object-cover shadow-md mb-3 border-2 border-white dark:border-gray-700" />
                        </div>
                        <p className="font-bold text-gray-900 dark:text-white truncate w-full flex items-center justify-center gap-1">
                          {p.display_name}
                          {p.is_verified && <VerifiedBadge />}
                        </p>
                        <p className="text-xs text-gray-500 mb-4 font-medium italic">@{p.username}</p>
                        {p.is_pending ? (
                            <button onClick={() => cancelRequest(p.friendship_id, p.id)} className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all">
                                <X size={16}/> Cancel Request
                            </button>
                        ) : (
                            <button onClick={() => sendRequest(p.id)} className="w-full bg-[#f0f2f5] dark:bg-gray-900 text-gray-800 dark:text-white py-2 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-all">
                                <UserPlus size={16}/> Add Friend
                            </button>
                        )}
                        <button onClick={() => blockUser(p.id)} className="absolute top-2 right-2 p-1.5 text-gray-300 hover:text-red-500 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all opacity-0 group-hover:opacity-100" title="Block User">
                            <Ban size={16} />
                        </button>
                    </div>
                    ))}
                </div>
            )}

            {activeTab === 'friends' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
                    {displayedFriends.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-gray-400 font-medium">You haven't added any friends yet.</div>
                    ) : displayedFriends.map((f: any) => (
                    <div key={f.id} className="bg-white dark:bg-black border border-gray-100 dark:border-gray-800 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all group">
                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate(`/profile/${f.username || f.id}`)}>
                        <ProfileAvatar userId={f.id} defaultAvatar={f.avatar_url || undefined} name={f.display_name || f.username || 'User'} className="w-16 h-16 rounded-full border shadow-sm object-cover" />
                        <div>
                            <p className="font-bold text-gray-900 dark:text-white text-lg group-hover:text-[#1877F2] transition-colors flex items-center gap-1">
                              {f.display_name}
                              {f.is_verified && <VerifiedBadge />}
                            </p>
                            <p className="text-sm text-gray-500 font-bold">Connected Friend</p>
                        </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => navigate('/messages', { state: { userId: f.id } })} className="bg-[#f0f2f5] dark:bg-gray-900 p-3 rounded-full hover:bg-[#1877F2] hover:text-white transition-all text-[#1877F2]" title="Message"><MessageSquare size={20}/></button>
                            <button onClick={() => handleStatus(f.friendship_id, 'delete')} className="bg-[#f0f2f5] dark:bg-gray-900 p-3 rounded-full hover:bg-red-50 hover:text-red-600 transition-all text-gray-400" title="Unfriend"><UserMinus size={20}/></button>
                            <button onClick={() => blockUser(f.id, f.friendship_id)} className="bg-[#f0f2f5] dark:bg-gray-900 p-3 rounded-full hover:bg-red-50 hover:text-red-600 transition-all text-gray-400" title="Block"><Ban size={20}/></button>
                        </div>
                    </div>
                    ))}
                </div>
            )}

            {activeTab === 'blocked' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
                    {displayedBlocked.length === 0 ? (
                        <div className="col-span-full text-center py-20 text-gray-400 font-medium">No blocked users.</div>
                    ) : displayedBlocked.map((f: any) => (
                    <div key={f.id} className="bg-white dark:bg-black border border-gray-100 dark:border-gray-800 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                        <div className="flex items-center gap-4 opacity-50">
                        <ProfileAvatar userId={f.id} defaultAvatar={f.avatar_url || undefined} name={f.display_name || f.username || 'User'} className="w-12 h-12 rounded-full border shadow-sm object-cover grayscale" />
                        <div>
                            <p className="font-bold text-gray-900 dark:text-white">{f.display_name}</p>
                            <p className="text-xs text-red-500 font-bold">Blocked</p>
                        </div>
                        </div>
                        <button onClick={() => unblockUser(f.friendship_id)} className="bg-gray-100 dark:bg-gray-900 px-4 py-2 rounded-xl font-bold hover:bg-gray-200 dark:hover:bg-gray-800 transition-all text-gray-600 dark:text-gray-300 text-sm">Unblock</button>
                    </div>
                    ))}
                </div>
            )}
        </>
      )}
    </div>
  );
};

export default Friends;
