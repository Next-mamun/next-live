import { db, auth, handleFirestoreError, OperationType } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
} from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import { localDB } from '@/lib/dexie';
import { fetchUserFriendshipsSmart, fetchProfilesBatchSmart } from '@/lib/profileSync';
import {
  Story,
  StoryEditMetadata,
  StoryFilterPreset,
  StoryViewItem,
  StoryVisibility,
  UserProfile,
} from '@/types';

export interface StatusDurationOption {
  hours: number;
  label: string;
  shortLabel: string;
  badge?: string;
}

export const STATUS_DURATION_OPTIONS: StatusDurationOption[] = [
  { hours: 24, label: '24 Hours', shortLabel: '24h', badge: 'Default' },
  { hours: 48, label: '2 Days', shortLabel: '2d' },
  { hours: 72, label: '3 Days', shortLabel: '3d' },
  { hours: 120, label: '5 Days', shortLabel: '5d' },
  { hours: 168, label: '7 Days', shortLabel: '7d', badge: 'Max' },
];

export interface StatusBgPreset {
  id: string;
  label: string;
  gradient: string;
  accent: string;
}

export const STATUS_BG_PRESETS: StatusBgPreset[] = [
  { id: 'next_blue', label: 'Next Blue', gradient: 'linear-gradient(135deg, #0b3b8c 0%, #1877F2 55%, #38bdf8 100%)', accent: '#1877F2' },
  { id: 'ocean', label: 'Deep Ocean', gradient: 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #60a5fa 100%)', accent: '#60a5fa' },
  { id: 'sunset', label: 'Sunset Glow', gradient: 'linear-gradient(135deg, #7c2d12 0%, #ea580c 50%, #fbbf24 100%)', accent: '#fbbf24' },
  { id: 'royal', label: 'Royal Violet', gradient: 'linear-gradient(135deg, #3b0764 0%, #7e22ce 55%, #ec4899 100%)', accent: '#ec4899' },
  { id: 'berry', label: 'Berry Rose', gradient: 'linear-gradient(135deg, #881337 0%, #e11d48 60%, #fb7185 100%)', accent: '#fb7185' },
  { id: 'midnight', label: 'Midnight', gradient: 'linear-gradient(135deg, #09090b 0%, #18181b 55%, #3f3f46 100%)', accent: '#a1a1aa' },
  { id: 'sky_indigo', label: 'Sky Indigo', gradient: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 50%, #0284c7 100%)', accent: '#38bdf8' },
  { id: 'gold', label: 'Amber Gold', gradient: 'linear-gradient(135deg, #451a03 0%, #b45309 55%, #f59e0b 100%)', accent: '#f59e0b' },
];

export const STORY_FILTER_CSS: Record<StoryFilterPreset, string> = {
  none: '',
  vivid: 'saturate(1.45) contrast(1.1)',
  warm: 'sepia(0.28) saturate(1.25) brightness(1.03)',
  cool: 'hue-rotate(15deg) saturate(1.1) contrast(1.06) brightness(1.02)',
  bw: 'grayscale(1) contrast(1.2)',
  vintage: 'sepia(0.55) contrast(0.92) brightness(1.05)',
};

export interface StatusPrivacyConfig {
  visibility: StoryVisibility;
  allowed_user_ids: string[];
  excluded_user_ids: string[];
}

export interface StatusGroup {
  userId: string;
  user: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string;
    is_verified?: boolean;
  };
  stories: Story[];
  hasUnviewed: boolean;
  latestCreatedAtMs: number;
  isOwn: boolean;
}

const MAX_STORY_HOURS = 168; // 7 days
const MIN_STORY_HOURS = 24;  // 24 hours

export const clampStatusDurationHours = (hours?: number): number => {
  const num = Number(hours);
  if (!Number.isFinite(num) || num <= 0) return MIN_STORY_HOURS;
  return Math.min(MAX_STORY_HOURS, Math.max(MIN_STORY_HOURS, Math.round(num)));
};

export const getStatusCreatedAtMs = (story: Partial<Story>): number => {
  if (typeof story.created_at_ms === 'number' && Number.isFinite(story.created_at_ms)) {
    return story.created_at_ms;
  }
  const raw: any = story.created_at;
  if (!raw) return Date.now();
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') {
    try { return raw.toMillis(); } catch { return Date.now(); }
  }
  if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
};

export const getStatusExpiresAtMs = (story: Partial<Story>): number => {
  if (typeof story.expires_at_ms === 'number' && Number.isFinite(story.expires_at_ms)) {
    return story.expires_at_ms;
  }
  if (story.expires_at) {
    const parsed = new Date(story.expires_at).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  const hours = clampStatusDurationHours(story.duration_hours);
  return getStatusCreatedAtMs(story) + hours * 60 * 60 * 1000;
};

export const isStoryExpired = (story: Partial<Story>, nowMs = Date.now()): boolean => {
  return nowMs >= getStatusExpiresAtMs(story);
};

export const formatRemainingStatusTime = (expiresAtMs: number, nowMs = Date.now()): string => {
  const diff = expiresAtMs - nowMs;
  if (diff <= 0) return 'Expired';
  const totalMinutes = Math.floor(diff / (60 * 1000));
  const totalHours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  if (days >= 1) {
    return remHours > 0 ? `${days}d ${remHours}h left` : `${days}d left`;
  }
  if (totalHours >= 1) {
    return `${totalHours}h left`;
  }
  return `${Math.max(1, totalMinutes)}m left`;
};

export const formatRelativeStatusTime = (createdAtMs: number, nowMs = Date.now()): string => {
  const diff = Math.max(0, nowMs - createdAtMs);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export const getPrivacySummaryLabel = (
  visibility: StoryVisibility,
  allowedCount = 0,
  excludedCount = 0
): string => {
  switch (visibility) {
    case 'public':
      return 'Public (Everyone)';
    case 'friends_except':
      return excludedCount > 0 ? `Friends except ${excludedCount}` : 'Friends except...';
    case 'only_share':
      return allowedCount > 0 ? `Only ${allowedCount} selected` : 'Only selected...';
    case 'friends':
    default:
      return 'My Friends';
  }
};

export const getSavedStatusPrivacy = (userId?: string | null): StatusPrivacyConfig => {
  const fallback: StatusPrivacyConfig = {
    visibility: 'friends',
    allowed_user_ids: [],
    excluded_user_ids: [],
  };
  if (!userId || typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(`next_status_privacy_${userId}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const vis = ['public', 'friends', 'friends_except', 'only_share'].includes(parsed?.visibility)
      ? (parsed.visibility as StoryVisibility)
      : 'friends';
    return {
      visibility: vis,
      allowed_user_ids: Array.isArray(parsed?.allowed_user_ids) ? parsed.allowed_user_ids.slice(0, 200) : [],
      excluded_user_ids: Array.isArray(parsed?.excluded_user_ids) ? parsed.excluded_user_ids.slice(0, 200) : [],
    };
  } catch {
    return fallback;
  }
};

export const saveStatusPrivacy = (userId: string, config: StatusPrivacyConfig): void => {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      `next_status_privacy_${userId}`,
      JSON.stringify({
        visibility: config.visibility,
        allowed_user_ids: (config.allowed_user_ids || []).slice(0, 200),
        excluded_user_ids: (config.excluded_user_ids || []).slice(0, 200),
      })
    );
  } catch {}
};

export const getBgPresetStyle = (bgId?: string): string => {
  const found = STATUS_BG_PRESETS.find((b) => b.id === bgId);
  return found ? found.gradient : STATUS_BG_PRESETS[0].gradient;
};

/**
 * Fetches current user's accepted friends + optional search users for WhatsApp Status Privacy picker.
 */
export const fetchStatusAudienceContacts = async (
  currentUserId: string
): Promise<{ friends: UserProfile[]; discoverableUsers: UserProfile[] }> => {
  if (!currentUserId) return { friends: [], discoverableUsers: [] };

  let friendIds: string[] = [];
  let blockedIds = new Set<string>();

  try {
    const { rows } = await fetchUserFriendshipsSmart(currentUserId);
    rows.forEach((r: any) => {
      const partnerId = r.sender_id === currentUserId ? r.receiver_id : r.sender_id;
      if (!partnerId) return;
      if (r.status === 'accepted') friendIds.push(partnerId);
      else if (r.status === 'blocked') blockedIds.add(partnerId);
    });
  } catch {}

  if (friendIds.length === 0) {
    try {
      const localFriends = await localDB.friends.toArray();
      localFriends.forEach((f) => {
        if (f.id && f.status === 'accepted') friendIds.push(f.id);
        else if (f.id && f.status === 'blocked') blockedIds.add(f.id);
      });
    } catch {}
  }

  const uniqueFriendIds = Array.from(new Set(friendIds)).filter((id) => id !== currentUserId && !blockedIds.has(id));
  const profileMap = uniqueFriendIds.length > 0 ? await fetchProfilesBatchSmart(uniqueFriendIds) : new Map();

  const friends: UserProfile[] = uniqueFriendIds
    .map((id) => {
      const p = profileMap.get(id);
      return {
        id,
        username: p?.username || 'user',
        display_name: p?.display_name || p?.name || p?.username || 'Friend',
        avatar_url: p?.avatar_url || p?.avatar || '',
        is_verified: Boolean(p?.is_verified),
        created_at: p?.created_at || '',
      } as UserProfile;
    })
    .sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));

  let discoverableUsers: UserProfile[] = [];
  try {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, is_verified, created_at')
      .eq('is_group', false)
      .limit(80);
    if (Array.isArray(data)) {
      const friendSet = new Set(uniqueFriendIds);
      discoverableUsers = data
        .filter((u: any) => u?.id && u.id !== currentUserId && !friendSet.has(u.id) && !blockedIds.has(u.id) && !String(u.id).startsWith('group_'))
        .map((u: any) => ({
          id: u.id,
          username: u.username || 'user',
          display_name: u.display_name || u.username || 'User',
          avatar_url: u.avatar_url || '',
          is_verified: Boolean(u.is_verified),
          created_at: u.created_at || '',
        }));
    }
  } catch {}

  return { friends, discoverableUsers };
};

/**
 * Deletes an expired or user-removed story + cleans up its view records safely.
 */
export const deleteStoryById = async (storyId: string, ownerId: string): Promise<void> => {
  if (!storyId || !ownerId) return;
  try {
    await deleteDoc(doc(db, 'stories', storyId));
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      try { handleFirestoreError(err, OperationType.DELETE, `stories/${storyId}`); } catch {}
    }
  }

  try {
    const qViews = query(collection(db, 'story_views'), where('owner_id', '==', ownerId), limit(100));
    const snap = await getDocs(qViews);
    const matching = snap.docs.filter((d) => d.data()?.story_id === storyId);
    await Promise.all(matching.map((d) => deleteDoc(doc(db, 'story_views', d.id)).catch(() => {})));
  } catch {}
};

const cleanupExpiredStoriesForOwner = async (expiredOwnStories: Story[], ownerId: string) => {
  if (!ownerId || expiredOwnStories.length === 0) return;
  await Promise.all(
    expiredOwnStories.slice(0, 15).map((s) => deleteStoryById(s.id, ownerId))
  );
};

/**
 * Builds an upload/create payload for Firestore `stories`.
 * Used for text statuses directly and for image/video statuses once media URL is ready.
 */
export const buildStoryDocumentPayload = async (params: {
  user: UserProfile;
  mediaUrl: string;
  mediaType: 'image' | 'video' | 'text';
  caption?: string;
  textContent?: string;
  bgStyle?: string;
  fontStyle?: 'sans' | 'serif' | 'mono' | 'bold';
  visibility: StoryVisibility;
  allowedUserIds?: string[];
  excludedUserIds?: string[];
  durationHours: number;
  editMetadata?: StoryEditMetadata | null;
}) => {
  const safeHours = clampStatusDurationHours(params.durationHours);
  const createdAtMs = Date.now();
  const expiresAtMs = createdAtMs + safeHours * 60 * 60 * 1000;

  const cleanExcluded = Array.from(new Set((params.excludedUserIds || []).filter((id) => id && id !== params.user.id))).slice(0, 200);
  let cleanAllowed = Array.from(new Set((params.allowedUserIds || []).filter((id) => id && id !== params.user.id))).slice(0, 200);

  // For "friends_except", compute allowed_user_ids = accepted friends minus excluded users so Firestore rules enforce exclusion server-side!
  if (params.visibility === 'friends_except') {
    try {
      const { friends } = await fetchStatusAudienceContacts(params.user.id);
      const excludedSet = new Set(cleanExcluded);
      cleanAllowed = friends
        .map((f) => f.id)
        .filter((fid) => fid && !excludedSet.has(fid))
        .slice(0, 200);
    } catch {
      cleanAllowed = [];
    }
  }

  return {
    user_id: params.user.id,
    author_name: (params.user.display_name || params.user.username || 'User').slice(0, 120),
    author_username: (params.user.username || 'user').slice(0, 64),
    author_avatar: (params.user.avatar_url || '').slice(0, 2048),
    author_verified: Boolean(params.user.is_verified),
    media_url: (params.mediaUrl || '').slice(0, 800000),
    media_type: params.mediaType,
    caption: (params.caption || '').trim().slice(0, 1000),
    text_content: (params.textContent || '').trim().slice(0, 1000),
    bg_style: (params.bgStyle || STATUS_BG_PRESETS[0].id).slice(0, 128),
    font_style: params.fontStyle || 'bold',
    visibility: params.visibility,
    allowed_user_ids: cleanAllowed,
    excluded_user_ids: cleanExcluded,
    duration_hours: safeHours,
    expires_at: new Date(expiresAtMs).toISOString(),
    expires_at_ms: expiresAtMs,
    created_at: new Date(createdAtMs).toISOString(),
    created_at_ms: createdAtMs,
    edit_metadata: params.editMetadata || null,
  };
};

export const createTextStatusDirect = async (params: {
  user: UserProfile;
  textContent: string;
  bgStyle: string;
  fontStyle?: 'sans' | 'serif' | 'mono' | 'bold';
  caption?: string;
  visibility: StoryVisibility;
  allowedUserIds?: string[];
  excludedUserIds?: string[];
  durationHours: number;
  editMetadata?: StoryEditMetadata | null;
}): Promise<string> => {
  const payload = await buildStoryDocumentPayload({
    user: params.user,
    mediaUrl: '',
    mediaType: 'text',
    caption: params.caption || '',
    textContent: params.textContent,
    bgStyle: params.bgStyle,
    fontStyle: params.fontStyle || 'bold',
    visibility: params.visibility,
    allowedUserIds: params.allowedUserIds,
    excludedUserIds: params.excludedUserIds,
    durationHours: params.durationHours,
    editMetadata: params.editMetadata || null,
  });

  try {
    const docRef = await addDoc(collection(db, 'stories'), payload);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('next_status_updated'));
    }
    return docRef.id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, 'stories');
    throw err;
  }
};

export const updateStorySettings = async (
  storyId: string,
  ownerId: string,
  updates: {
    visibility: StoryVisibility;
    allowed_user_ids?: string[];
    excluded_user_ids?: string[];
    caption?: string;
    duration_hours?: number;
    created_at_ms?: number;
  }
): Promise<void> => {
  if (!storyId || !ownerId) return;

  const cleanExcluded = Array.from(new Set((updates.excluded_user_ids || []).filter((id) => id && id !== ownerId))).slice(0, 200);
  let cleanAllowed = Array.from(new Set((updates.allowed_user_ids || []).filter((id) => id && id !== ownerId))).slice(0, 200);

  if (updates.visibility === 'friends_except') {
    try {
      const { friends } = await fetchStatusAudienceContacts(ownerId);
      const excludedSet = new Set(cleanExcluded);
      cleanAllowed = friends
        .map((f) => f.id)
        .filter((fid) => fid && !excludedSet.has(fid))
        .slice(0, 200);
    } catch {
      cleanAllowed = [];
    }
  }

  const patch: Record<string, any> = {
    visibility: updates.visibility,
    allowed_user_ids: cleanAllowed,
    excluded_user_ids: cleanExcluded,
  };

  if (updates.caption !== undefined) {
    patch.caption = String(updates.caption).slice(0, 1000);
  }
  if (updates.duration_hours !== undefined) {
    const safeHours = clampStatusDurationHours(updates.duration_hours);
    const baseMs = updates.created_at_ms || Date.now();
    const newExpiresMs = baseMs + safeHours * 60 * 60 * 1000;
    patch.duration_hours = safeHours;
    patch.expires_at_ms = newExpiresMs;
    patch.expires_at = new Date(newExpiresMs).toISOString();
  }

  try {
    await updateDoc(doc(db, 'stories', storyId), patch);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('next_status_updated'));
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `stories/${storyId}`);
    throw err;
  }
};

/**
 * Fetches all active (non-expired) statuses visible to the current user (or public for guests),
 * auto-cleans expired statuses belonging to the user, and groups them WhatsApp-style.
 */
export const fetchActiveStatusGroups = async (currentUserId?: string | null): Promise<{
  groups: StatusGroup[];
  viewedStoryIds: Set<string>;
  myViewsByStoryId: Record<string, StoryViewItem[]>;
}> => {
  const nowMs = Date.now();
  const rawStoriesMap = new Map<string, Story>();

  // 1. Accepted & blocked friendships for privacy filtering
  const acceptedFriendIds = new Set<string>();
  const blockedUserIds = new Set<string>();

  if (currentUserId) {
    try {
      const { rows } = await fetchUserFriendshipsSmart(currentUserId);
      rows.forEach((r: any) => {
        const partnerId = r.sender_id === currentUserId ? r.receiver_id : r.sender_id;
        if (!partnerId) return;
        if (r.status === 'accepted') acceptedFriendIds.add(partnerId);
        else if (r.status === 'blocked') blockedUserIds.add(partnerId);
      });
    } catch {}
  }

  // 2. Query Firestore with single-field filters (no composite index required!)
  const queriesToRun: Promise<void>[] = [];

  queriesToRun.push(
    getDocs(query(collection(db, 'stories'), where('visibility', '==', 'public'), limit(60)))
      .then((snap) => {
        snap.docs.forEach((d) => {
          rawStoriesMap.set(d.id, normalizeStoryDoc(d.id, d.data()));
        });
      })
      .catch((err) => {
        if (err?.code === 'permission-denied') {
          try { handleFirestoreError(err, OperationType.LIST, 'stories'); } catch {}
        }
      })
  );

  if (currentUserId && auth.currentUser?.uid) {
    queriesToRun.push(
      getDocs(query(collection(db, 'stories'), where('user_id', '==', currentUserId), limit(40)))
        .then((snap) => {
          snap.docs.forEach((d) => {
            rawStoriesMap.set(d.id, normalizeStoryDoc(d.id, d.data()));
          });
        })
        .catch(() => {})
    );

    queriesToRun.push(
      getDocs(query(collection(db, 'stories'), where('visibility', '==', 'friends'), limit(60)))
        .then((snap) => {
          snap.docs.forEach((d) => {
            rawStoriesMap.set(d.id, normalizeStoryDoc(d.id, d.data()));
          });
        })
        .catch(() => {})
    );

    queriesToRun.push(
      getDocs(query(collection(db, 'stories'), where('allowed_user_ids', 'array-contains', currentUserId), limit(50)))
        .then((snap) => {
          snap.docs.forEach((d) => {
            rawStoriesMap.set(d.id, normalizeStoryDoc(d.id, d.data()));
          });
        })
        .catch(() => {})
    );
  }

  await Promise.all(queriesToRun);

  const allRaw = Array.from(rawStoriesMap.values());

  // 3. Auto-delete own expired stories seamlessly
  if (currentUserId) {
    const ownExpired = allRaw.filter((s) => s.user_id === currentUserId && isStoryExpired(s, nowMs));
    if (ownExpired.length > 0) {
      cleanupExpiredStoriesForOwner(ownExpired, currentUserId).catch(() => {});
    }
  }

  // 4. Strictly filter active + privacy-authorized stories
  const visibleStories = allRaw.filter((s) => {
    if (isStoryExpired(s, nowMs)) return false;
    if (!s.user_id) return false;
    if (currentUserId && blockedUserIds.has(s.user_id)) return false;

    const isOwner = Boolean(currentUserId && s.user_id === currentUserId);
    if (isOwner) return true;

    const vis = s.visibility || 'public';
    if (vis === 'public') return true;
    if (!currentUserId) return false;

    if (vis === 'friends') {
      return acceptedFriendIds.has(s.user_id);
    }
    if (vis === 'friends_except') {
      const excluded = Array.isArray(s.excluded_user_ids) ? s.excluded_user_ids : [];
      return acceptedFriendIds.has(s.user_id) && !excluded.includes(currentUserId);
    }
    if (vis === 'only_share') {
      const allowed = Array.isArray(s.allowed_user_ids) ? s.allowed_user_ids : [];
      return allowed.includes(currentUserId);
    }
    return false;
  });

  // 5. Fetch view receipts & reactions
  const viewedStoryIds = new Set<string>();
  const myViewsByStoryId: Record<string, StoryViewItem[]> = {};

  if (currentUserId && auth.currentUser?.uid) {
    await Promise.all([
      getDocs(query(collection(db, 'story_views'), where('user_id', '==', currentUserId), limit(200)))
        .then((snap) => {
          snap.docs.forEach((d) => {
            const v = d.data();
            if (v?.story_id) viewedStoryIds.add(v.story_id);
          });
        })
        .catch(() => {}),
      getDocs(query(collection(db, 'story_views'), where('owner_id', '==', currentUserId), limit(200)))
        .then((snap) => {
          snap.docs.forEach((d) => {
            const v = d.data() as any;
            if (!v?.story_id) return;
            const item: StoryViewItem = {
              id: d.id,
              story_id: v.story_id,
              owner_id: v.owner_id,
              user_id: v.user_id,
              viewer_name: v.viewer_name || 'User',
              viewer_username: v.viewer_username || '',
              viewer_avatar: v.viewer_avatar || '',
              reaction: v.reaction || undefined,
              viewed_at: v.viewed_at || new Date().toISOString(),
              viewed_at_ms: typeof v.viewed_at_ms === 'number' ? v.viewed_at_ms : Date.now(),
            };
            if (!myViewsByStoryId[v.story_id]) myViewsByStoryId[v.story_id] = [];
            myViewsByStoryId[v.story_id].push(item);
          });
        })
        .catch(() => {}),
    ]);
  }

  Object.keys(myViewsByStoryId).forEach((sid) => {
    myViewsByStoryId[sid].sort((a, b) => b.viewed_at_ms - a.viewed_at_ms);
  });

  // 6. Enrich author profiles cleanly
  const userIds = Array.from(new Set(visibleStories.map((s) => s.user_id).filter(Boolean)));
  const profileMap = userIds.length > 0 ? await fetchProfilesBatchSmart(userIds).catch(() => new Map()) : new Map();

  // 7. Group by author chronologically (oldest -> newest within a user's sequence, like WhatsApp)
  const grouped = new Map<string, Story[]>();
  visibleStories.forEach((story) => {
    const arr = grouped.get(story.user_id) || [];
    const enrichedStory: Story = {
      ...story,
      story_views: myViewsByStoryId[story.id] || [],
    };
    arr.push(enrichedStory);
    grouped.set(story.user_id, arr);
  });

  const groups: StatusGroup[] = [];
  grouped.forEach((storiesArr, uid) => {
    storiesArr.sort((a, b) => a.created_at_ms - b.created_at_ms);
    const sample = storiesArr[storiesArr.length - 1];
    const prof = profileMap.get(uid);
    const isOwn = Boolean(currentUserId && uid === currentUserId);
    const hasUnviewed = !isOwn && storiesArr.some((st) => !viewedStoryIds.has(st.id));

    groups.push({
      userId: uid,
      user: {
        id: uid,
        display_name: prof?.display_name || prof?.name || sample.author_name || 'User',
        username: prof?.username || sample.author_username || 'user',
        avatar_url: prof?.avatar_url || prof?.avatar || sample.author_avatar || '',
        is_verified: Boolean(prof?.is_verified ?? sample.author_verified),
      },
      stories: storiesArr,
      hasUnviewed,
      latestCreatedAtMs: sample.created_at_ms,
      isOwn,
    });
  });

  // Sort: Own -> Unviewed newest -> Viewed newest
  groups.sort((a, b) => {
    if (a.isOwn !== b.isOwn) return a.isOwn ? -1 : 1;
    if (a.hasUnviewed !== b.hasUnviewed) return a.hasUnviewed ? -1 : 1;
    return b.latestCreatedAtMs - a.latestCreatedAtMs;
  });

  return { groups, viewedStoryIds, myViewsByStoryId };
};

const normalizeStoryDoc = (id: string, data: any): Story => {
  const createdAtMs = getStatusCreatedAtMs(data);
  const durationHours = clampStatusDurationHours(data?.duration_hours);
  const expiresAtMs = getStatusExpiresAtMs({ ...data, created_at_ms: createdAtMs, duration_hours: durationHours });

  return {
    id,
    user_id: data?.user_id || '',
    author_name: data?.author_name || '',
    author_username: data?.author_username || '',
    author_avatar: data?.author_avatar || '',
    author_verified: Boolean(data?.author_verified),
    media_url: data?.media_url || '',
    media_type: data?.media_type === 'video' ? 'video' : data?.media_type === 'text' ? 'text' : 'image',
    caption: data?.caption || '',
    text_content: data?.text_content || '',
    bg_style: data?.bg_style || 'next_blue',
    font_style: data?.font_style || 'bold',
    visibility: (['public', 'friends', 'friends_except', 'only_share'].includes(data?.visibility)
      ? data.visibility
      : 'public') as StoryVisibility,
    allowed_user_ids: Array.isArray(data?.allowed_user_ids) ? data.allowed_user_ids : [],
    excluded_user_ids: Array.isArray(data?.excluded_user_ids) ? data.excluded_user_ids : [],
    duration_hours: durationHours,
    expires_at: data?.expires_at || new Date(expiresAtMs).toISOString(),
    expires_at_ms: expiresAtMs,
    created_at: typeof data?.created_at === 'string' ? data.created_at : new Date(createdAtMs).toISOString(),
    created_at_ms: createdAtMs,
    edit_metadata: data?.edit_metadata || null,
    story_views: [],
  };
};

export const recordStoryView = async (
  story: Story,
  viewer: UserProfile,
  reaction?: string
): Promise<void> => {
  if (!story?.id || !viewer?.id || !story.user_id) return;
  if (story.user_id === viewer.id) return; // Don't count self-views

  const viewId = `${story.id}_${viewer.id}`.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  const nowMs = Date.now();
  const payload: Record<string, any> = {
    story_id: story.id,
    owner_id: story.user_id,
    user_id: viewer.id,
    viewer_name: (viewer.display_name || viewer.username || 'User').slice(0, 120),
    viewer_username: (viewer.username || '').slice(0, 64),
    viewer_avatar: (viewer.avatar_url || '').slice(0, 2048),
    viewed_at: new Date(nowMs).toISOString(),
    viewed_at_ms: nowMs,
  };
  if (reaction) {
    payload.reaction = reaction.slice(0, 32);
  }

  try {
    await setDoc(doc(db, 'story_views', viewId), payload, { merge: true });
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      try { handleFirestoreError(err, OperationType.WRITE, `story_views/${viewId}`); } catch {}
    }
  }
};
