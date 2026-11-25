import { supabase } from './supabase';
import { db } from './firebase';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import { localDB } from './dexie';
import { safeLocalGet, safeLocalSet } from './safeStorage';

const toIsoStringSafe = (val: any): string => {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    try { return val.toDate().toISOString(); } catch { return new Date().toISOString(); }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  if (typeof val === 'number') return new Date(val).toISOString();
  return new Date().toISOString();
};

export const buildSupabaseProfilePayload = (profile: any, includeExtended = true): Record<string, any> => {
  const id = profile?.id || profile?.uid;
  const payload: Record<string, any> = { id };

  const username = profile?.username;
  if (typeof username === 'string' && username.trim()) {
    payload.username = username.trim().toLowerCase();
  }

  const displayName = profile?.display_name || profile?.displayName || profile?.name;
  if (typeof displayName === 'string' && displayName.trim()) {
    payload.display_name = displayName.trim();
  }

  const avatarUrl = profile?.avatar_url ?? profile?.avatar ?? profile?.photoURL;
  if (typeof avatarUrl === 'string') {
    payload.avatar_url = avatarUrl;
  }

  if (typeof profile?.bio === 'string') {
    payload.bio = profile.bio;
  }

  if (typeof profile?.fcm_token === 'string' || profile?.fcm_token === null) {
    payload.fcm_token = profile.fcm_token;
  }

  if (profile?.created_at) {
    payload.created_at = toIsoStringSafe(profile.created_at);
  }

  if (includeExtended) {
    if (typeof profile?.cover_url === 'string') payload.cover_url = profile.cover_url;
    if (typeof profile?.email === 'string') payload.email = profile.email;
    if (typeof profile?.is_group === 'boolean') payload.is_group = profile.is_group;
    if (Array.isArray(profile?.members)) payload.members = profile.members;
    if (profile?.admin_id !== undefined) payload.admin_id = profile.admin_id;
    payload.updated_at = new Date().toISOString();
  }

  return payload;
};

/**
 * Upserts a Firebase profile into Supabase `profiles` keeping id, username, display_name, avatar_url, etc. identical.
 * Safe against partial schemas and legacy duplicate usernames.
 */
export const syncProfileToSupabase = async (profile: any): Promise<boolean> => {
  const id = profile?.id || profile?.uid;
  if (!id) return false;

  const fullPayload = buildSupabaseProfilePayload(profile, true);

  try {
    const { error } = await supabase.from('profiles').upsert(fullPayload, { onConflict: 'id' });
    if (!error) return true;

    const msg = (error.message || '').toLowerCase();

    // If extended columns don't exist yet before SQL migration, fall back to base columns
    if (msg.includes('column') && msg.includes('does not exist')) {
      const basePayload = buildSupabaseProfilePayload(profile, false);
      const { error: baseErr } = await supabase.from('profiles').upsert(basePayload, { onConflict: 'id' });
      if (!baseErr) return true;
      console.warn('Supabase base profile sync warning:', baseErr.message);
      return false;
    }

    // If legacy username uniqueness conflict occurs, preserve row with suffixed username in Supabase
    if (error.code === '23505' || msg.includes('unique') || msg.includes('duplicate')) {
      const retryPayload = {
        ...fullPayload,
        username: `${fullPayload.username || 'user'}_${String(id).slice(0, 4).toLowerCase()}`
      };
      const { error: retryErr } = await supabase.from('profiles').upsert(retryPayload, { onConflict: 'id' });
      if (!retryErr) return true;
    }

    console.warn('Supabase profile sync warning:', error.message);
    return false;
  } catch (err) {
    console.warn('Supabase profile sync exception:', err);
    return false;
  }
};

/**
 * Checks username availability across BOTH Supabase and Firestore.
 */
export const isUsernameTaken = async (rawUsername: string): Promise<boolean> => {
  const clean = rawUsername.trim().toLowerCase();
  if (!clean) return true;

  try {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', clean)
      .limit(1);
    if (data && data.length > 0) return true;
  } catch {
    // Continue to Firestore check
  }

  try {
    const q = query(collection(db, 'profiles'), where('username', '==', clean), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return true;
  } catch {
    // Ignore quota errors
  }

  return false;
};

/**
 * Generates a unique username (useful for Google Sign-In where email prefixes can collide).
 */
export const ensureUniqueUsername = async (rawBase: string, currentUserId?: string): Promise<string> => {
  const sanitized = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, '')
    .slice(0, 24) || 'user';

  let candidate = sanitized;
  for (let attempt = 0; attempt < 5; attempt++) {
    let taken = false;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', candidate)
        .limit(1);
      if (data && data.length > 0 && data[0].id !== currentUserId) {
        taken = true;
      }
    } catch {}

    if (!taken) {
      try {
        const q = query(collection(db, 'profiles'), where('username', '==', candidate), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty && snap.docs[0].id !== currentUserId) {
          taken = true;
        }
      } catch {}
    }

    if (!taken) return candidate;
    const suffix = Math.random().toString(36).substring(2, 6);
    candidate = `${sanitized.slice(0, 19)}_${suffix}`;
  }

  return `${sanitized.slice(0, 16)}_${Date.now().toString(36).slice(-4)}`;
};

/**
 * Cache normalized user in Dexie localDB.
 */
export const cacheUserInDexie = async (p: any) => {
  if (!p?.id) return;
  try {
    const disp = p.display_name || p.name || (p.username ? `@${p.username}` : 'User');
    await localDB.users.put({
      id: p.id,
      name: disp,
      display_name: disp,
      username: p.username || '',
      avatar: p.avatar_url || p.avatar || '',
      avatar_url: p.avatar_url || p.avatar || '',
      cover_url: p.cover_url || '',
      bio: p.bio || '',
      email: p.email || '',
      is_verified: Boolean(p.is_verified),
      created_at: p.created_at ? toIsoStringSafe(p.created_at) : undefined,
    });
  } catch {}
};

/**
 * Fetches a profile from Dexie -> Supabase -> (fallback only if missing) Firestore, then syncs back to Supabase.
 */
export const fetchProfileSmart = async (userId: string): Promise<any | null> => {
  if (!userId) return null;

  try {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (data) {
      await cacheUserInDexie(data);
      return data;
    }
  } catch {}

  try {
    const fbSnap = await getDoc(doc(db, 'profiles', userId));
    if (fbSnap.exists()) {
      const profile = { id: fbSnap.id, ...fbSnap.data() };
      await cacheUserInDexie(profile);
      syncProfileToSupabase(profile).catch(() => {});
      return profile;
    }
  } catch {}

  return null;
};

/**
 * Batch fetches missing profiles from Supabase first, falling back to Firestore only for IDs missing in Supabase.
 */
export const fetchProfilesBatchSmart = async (ids: string[]): Promise<Map<string, any>> => {
  const result = new Map<string, any>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return result;

  // 1. Query Supabase in chunks
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50);
    try {
      const { data } = await supabase.from('profiles').select('*').in('id', chunk);
      if (data) {
        data.forEach((p: any) => {
          result.set(p.id, p);
          cacheUserInDexie(p);
        });
      }
    } catch {}
  }

  // 2. Any IDs missing from Supabase -> lazy backfill from Firestore once
  const stillMissing = uniqueIds.filter(id => !result.has(id));
  if (stillMissing.length > 0) {
    for (let i = 0; i < stillMissing.length; i += 10) {
      const chunk = stillMissing.slice(i, i + 10);
      try {
        const q = query(collection(db, 'profiles'), where('__name__', 'in', chunk));
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const prof = { id: d.id, ...d.data() };
          result.set(d.id, prof);
          cacheUserInDexie(prof);
          syncProfileToSupabase(prof).catch(() => {});
        });
      } catch {}
    }
  }

  return result;
};

const BACKFILL_PROFILES_KEY = 'supa_profiles_backfill_v1';

/**
 * One-time background backfill of public Firestore profiles into Supabase so Discover & Search work for all legacy users.
 * Returns true if any new profiles were inserted into Supabase.
 */
export const backfillPublicProfilesOnce = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (safeLocalGet(BACKFILL_PROFILES_KEY) === 'done') return false;

  try {
    const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
    const snap = await getDocs(query(collection(db, 'profiles'), limit(300)));
    if (snap.empty) {
      safeLocalSet(BACKFILL_PROFILES_KEY, 'done');
      return false;
    }

    const fbProfiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (count !== null && count >= fbProfiles.length) {
      safeLocalSet(BACKFILL_PROFILES_KEY, 'done');
      return false;
    }

    const { data: existingSupa } = await supabase.from('profiles').select('id');
    const existingIds = new Set((existingSupa || []).map((r: any) => r.id));
    const missing = fbProfiles.filter(p => !existingIds.has(p.id));

    let syncedAny = false;
    for (let i = 0; i < missing.length; i += 50) {
      const chunk = missing.slice(i, i + 50);
      const payloads = chunk.map(p => buildSupabaseProfilePayload(p, true));
      const { error } = await supabase
        .from('profiles')
        .upsert(payloads, { onConflict: 'id', ignoreDuplicates: true });

      if (!error) {
        syncedAny = true;
      } else {
        // Fallback per-row only if a batch hits schema or unique username conflict
        for (const prof of chunk) {
          const ok = await syncProfileToSupabase(prof);
          if (ok) syncedAny = true;
        }
      }
    }

    safeLocalSet(BACKFILL_PROFILES_KEY, 'done');
    return syncedAny;
  } catch (err) {
    console.warn('Background profile backfill warning:', err);
    return false;
  }
};

/**
 * One-time per-user migration of legacy Firestore friendships into Supabase (idempotent).
 * Returns true if any legacy friendships were newly imported.
 */
export const migrateUserFriendshipsOnce = async (userId: string): Promise<boolean> => {
  if (!userId || typeof window === 'undefined') return false;
  const flagKey = `supa_friends_migrated_v1_${userId}`;
  if (safeLocalGet(flagKey) === 'done') return false;

  try {
    const [sendSnap, recvSnap] = await Promise.all([
      getDocs(query(collection(db, 'friendships'), where('sender_id', '==', userId), limit(200))).catch(() => null),
      getDocs(query(collection(db, 'friendships'), where('receiver_id', '==', userId), limit(200))).catch(() => null),
    ]);

    const legacyRels: any[] = [];
    const seenIds = new Set<string>();
    const partnerIds = new Set<string>();

    [sendSnap, recvSnap].forEach(snap => {
      if (!snap) return;
      snap.docs.forEach(d => {
        if (seenIds.has(d.id)) return;
        seenIds.add(d.id);
        const data = d.data();
        if (data.sender_id && data.receiver_id && data.status) {
          legacyRels.push(data);
          partnerIds.add(data.sender_id);
          partnerIds.add(data.receiver_id);
        }
      });
    });

    let importedAny = false;
    if (legacyRels.length > 0) {
      await fetchProfilesBatchSmart(Array.from(partnerIds));

      const { data: existing, error: existingErr } = await supabase
        .from('friendships')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

      if (existingErr && isSupabaseUuidMismatch(existingErr)) {
        markFriendshipsSchemaUuidOnly();
        return false;
      }

      const existingPairs = new Set(
        (existing || []).map((r: any) => [r.sender_id, r.receiver_id].sort().join('_'))
      );

      const toInsert = legacyRels
        .filter(r => !existingPairs.has([r.sender_id, r.receiver_id].sort().join('_')))
        .map(r => ({
          sender_id: r.sender_id,
          receiver_id: r.receiver_id,
          status: ['pending', 'accepted', 'blocked'].includes(r.status) ? r.status : 'pending',
          created_at: toIsoStringSafe(r.created_at),
        }));

      if (toInsert.length > 0) {
        for (const row of toInsert) {
          const { error } = await supabase.from('friendships').insert(row);
          if (!error) {
            importedAny = true;
          } else if (isSupabaseUuidMismatch(error)) {
            markFriendshipsSchemaUuidOnly();
            return false;
          } else if (error.code !== '23505') {
            console.warn('Legacy friendship insert warning:', error.message);
          }
        }
      }
    }

    safeLocalSet(flagKey, 'done');
    return importedAny;
  } catch (err) {
    console.warn('Legacy friendship migration warning:', err);
    return false;
  }
};

/**
 * One-time per-user migration of legacy Firestore messages into Supabase (idempotent).
 * Returns true if any legacy messages were newly imported.
 */
export const migrateUserMessagesOnce = async (userId: string): Promise<boolean> => {
  if (!userId || typeof window === 'undefined') return false;
  const flagKey = `supa_msgs_migrated_v1_${userId}`;
  if (safeLocalGet(flagKey) === 'done') return false;

  try {
    const [sendSnap, recvSnap] = await Promise.all([
      getDocs(query(collection(db, 'messages'), where('sender_id', '==', userId), limit(100))).catch(() => null),
      getDocs(query(collection(db, 'messages'), where('receiver_id', '==', userId), limit(100))).catch(() => null),
    ]);

    const legacyMsgs: any[] = [];
    const seen = new Set<string>();
    [sendSnap, recvSnap].forEach(snap => {
      if (!snap) return;
      snap.docs.forEach(d => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        const m = d.data();
        if (!m.sender_id || !m.receiver_id) return;
        const chatId = m.chat_id || m.chatId || [m.sender_id, m.receiver_id].sort().join('_');
        legacyMsgs.push({
          id: d.id,
          chat_id: chatId,
          sender_id: m.sender_id,
          receiver_id: m.receiver_id,
          text: m.text || (typeof m.content === 'string' ? m.content : ''),
          content: typeof m.content === 'string' ? m.content : (m.text || ''),
          media_url: m.media_url || null,
          media_type: m.media_type || null,
          is_read: Boolean(m.is_read),
          deleted_for: Array.isArray(m.deleted_for) ? m.deleted_for : [],
          deleted_for_everyone: Boolean(m.deleted_for_everyone),
          created_at: toIsoStringSafe(m.local_created_at || m.created_at),
        });
      });
    });

    let importedAny = false;
    if (legacyMsgs.length > 0) {
      const { error } = await supabase.from('messages').upsert(legacyMsgs, { onConflict: 'id', ignoreDuplicates: true });
      if (!error) importedAny = true;
    }

    safeLocalSet(flagKey, 'done');
    return importedAny;
  } catch (err) {
    console.warn('Legacy messages migration warning:', err);
    return false;
  }
};

// --- Smart Friendships Layer (Supabase primary + automatic Firestore fallback on 22P02 UUID schema mismatch) ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let friendshipsUuidMismatchAt = 0;

export const isUuidString = (val?: string | null): boolean => Boolean(val && UUID_REGEX.test(val));

export const isSupabaseUuidMismatch = (error: any): boolean => {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return code === '22P02' || msg.includes('invalid input syntax for type uuid');
};

const markFriendshipsSchemaUuidOnly = () => {
  friendshipsUuidMismatchAt = Date.now();
};

const shouldSkipSupabaseFriendships = (idA?: string | null, idB?: string | null): boolean => {
  const recentlyDetected = Date.now() - friendshipsUuidMismatchAt < 60_000;
  if (!recentlyDetected) return false;
  if (idA && !isUuidString(idA)) return true;
  if (idB && !isUuidString(idB)) return true;
  return false;
};

const fetchFriendshipsFromFirestore = async (userId: string): Promise<any[]> => {
  const [sendSnap, recvSnap] = await Promise.all([
    getDocs(query(collection(db, 'friendships'), where('sender_id', '==', userId), limit(300))).catch(() => null),
    getDocs(query(collection(db, 'friendships'), where('receiver_id', '==', userId), limit(300))).catch(() => null),
  ]);
  const map = new Map<string, any>();
  [sendSnap, recvSnap].forEach(snap => {
    if (!snap) return;
    snap.docs.forEach(d => {
      if (!map.has(d.id)) {
        map.set(d.id, { id: d.id, ...d.data(), _source: 'firebase' });
      }
    });
  });
  return Array.from(map.values());
};

export const fetchUserFriendshipsSmart = async (
  userId: string
): Promise<{ rows: any[]; error: any; source: 'supabase' | 'firebase' }> => {
  if (!userId) return { rows: [], error: null, source: 'supabase' };

  if (!shouldSkipSupabaseFriendships(userId)) {
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    if (!error) {
      return { rows: data || [], error: null, source: 'supabase' };
    }
    if (!isSupabaseUuidMismatch(error)) {
      return { rows: [], error, source: 'supabase' };
    }
    markFriendshipsSchemaUuidOnly();
  }

  try {
    const fbRows = await fetchFriendshipsFromFirestore(userId);
    return { rows: fbRows, error: null, source: 'firebase' };
  } catch (fbErr) {
    return { rows: [], error: fbErr, source: 'firebase' };
  }
};

export const getFriendshipBetweenSmart = async (userA: string, userB: string): Promise<any | null> => {
  if (!userA || !userB) return null;

  if (!shouldSkipSupabaseFriendships(userA, userB)) {
    const { data, error } = await supabase
      .from('friendships')
      .select('*')
      .or(`and(sender_id.eq.${userA},receiver_id.eq.${userB}),and(sender_id.eq.${userB},receiver_id.eq.${userA})`)
      .limit(1)
      .maybeSingle();

    if (!error) return data || null;
    if (!isSupabaseUuidMismatch(error)) return null;
    markFriendshipsSchemaUuidOnly();
  }

  const fbRows = await fetchFriendshipsFromFirestore(userA);
  return fbRows.find(
    r => (r.sender_id === userA && r.receiver_id === userB) || (r.sender_id === userB && r.receiver_id === userA)
  ) || null;
};

export const getAcceptedFriendsCountSmart = async (userId: string): Promise<number> => {
  if (!userId) return 0;

  if (!shouldSkipSupabaseFriendships(userId)) {
    const { count, error } = await supabase
      .from('friendships')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

    if (!error) return count || 0;
    if (!isSupabaseUuidMismatch(error)) return 0;
    markFriendshipsSchemaUuidOnly();
  }

  try {
    const fbRows = await fetchFriendshipsFromFirestore(userId);
    return fbRows.filter(r => r.status === 'accepted').length;
  } catch {
    return 0;
  }
};

export const sendFriendRequestSmart = async (
  senderId: string,
  receiverId: string
): Promise<{ id: string; sender_id: string; receiver_id: string; status: string } | null> => {
  if (!senderId || !receiverId) return null;
  const nowIso = new Date().toISOString();

  if (!shouldSkipSupabaseFriendships(senderId, receiverId)) {
    const { data, error } = await supabase
      .from('friendships')
      .insert({ sender_id: senderId, receiver_id: receiverId, status: 'pending', created_at: nowIso })
      .select()
      .single();

    if (!error && data) return data;
    if (error?.code === '23505') return null;
    if (!isSupabaseUuidMismatch(error)) throw error;
    markFriendshipsSchemaUuidOnly();
  }

  const existing = await getFriendshipBetweenSmart(senderId, receiverId);
  if (existing) return existing;

  const ref = await addDoc(collection(db, 'friendships'), {
    sender_id: senderId,
    receiver_id: receiverId,
    status: 'pending',
    created_at: nowIso,
  });
  return { id: ref.id, sender_id: senderId, receiver_id: receiverId, status: 'pending' };
};

export const updateFriendshipStatusSmart = async (
  friendshipId: string,
  status: 'accepted' | 'pending' | 'blocked',
  senderId?: string,
  receiverId?: string
): Promise<any> => {
  const tryFirebase = !isUuidString(friendshipId) || shouldSkipSupabaseFriendships(senderId, receiverId);

  if (!tryFirebase) {
    const updatePayload: any = { status };
    if (senderId && receiverId) {
      updatePayload.sender_id = senderId;
      updatePayload.receiver_id = receiverId;
    }
    const { data, error } = await supabase
      .from('friendships')
      .update(updatePayload)
      .eq('id', friendshipId)
      .select()
      .maybeSingle();

    if (!error) return data;
    if (!isSupabaseUuidMismatch(error)) throw error;
    markFriendshipsSchemaUuidOnly();
  }

  const docRef = doc(db, 'friendships', friendshipId);
  const updatePayload: any = { status };
  if (senderId && receiverId) {
    updatePayload.sender_id = senderId;
    updatePayload.receiver_id = receiverId;
  }
  await updateDoc(docRef, updatePayload);
  const snap = await getDoc(docRef);
  return snap.exists() ? { id: snap.id, ...snap.data() } : { id: friendshipId, ...updatePayload };
};

export const deleteFriendshipSmart = async (
  friendshipId?: string | null,
  senderId?: string,
  receiverId?: string
): Promise<void> => {
  if (friendshipId && !String(friendshipId).startsWith('temp-')) {
    if (isUuidString(friendshipId) && !shouldSkipSupabaseFriendships(senderId, receiverId)) {
      const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
      if (!error) return;
      if (!isSupabaseUuidMismatch(error)) throw error;
      markFriendshipsSchemaUuidOnly();
    }
    await deleteDoc(doc(db, 'friendships', friendshipId)).catch(() => {});
    return;
  }

  if (senderId && receiverId) {
    if (!shouldSkipSupabaseFriendships(senderId, receiverId)) {
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('sender_id', senderId)
        .eq('receiver_id', receiverId)
        .eq('status', 'pending');
      if (!error) return;
      if (!isSupabaseUuidMismatch(error)) throw error;
      markFriendshipsSchemaUuidOnly();
    }

    const q = query(
      collection(db, 'friendships'),
      where('sender_id', '==', senderId),
      where('receiver_id', '==', receiverId)
    );
    const snap = await getDocs(q).catch(() => null);
    if (snap && !snap.empty) {
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'friendships', d.id)).catch(() => {})));
    }
  }
};

export const blockUserSmart = async (
  blockerId: string,
  targetId: string,
  friendshipId?: string | null
): Promise<void> => {
  if (!blockerId || !targetId) return;
  const nowIso = new Date().toISOString();

  if (!shouldSkipSupabaseFriendships(blockerId, targetId)) {
    if (friendshipId && !String(friendshipId).startsWith('temp-') && isUuidString(friendshipId)) {
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'blocked', sender_id: blockerId, receiver_id: targetId })
        .eq('id', friendshipId);
      if (!error) return;
      if (!isSupabaseUuidMismatch(error)) throw error;
      markFriendshipsSchemaUuidOnly();
    } else {
      const { data: existing, error: findErr } = await supabase
        .from('friendships')
        .select('id')
        .or(`and(sender_id.eq.${blockerId},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${blockerId})`)
        .limit(1)
        .maybeSingle();

      if (!findErr) {
        if (existing?.id) {
          const { error: updErr } = await supabase
            .from('friendships')
            .update({ status: 'blocked', sender_id: blockerId, receiver_id: targetId })
            .eq('id', existing.id);
          if (!updErr) return;
        } else {
          const { error: insErr } = await supabase
            .from('friendships')
            .insert({ sender_id: blockerId, receiver_id: targetId, status: 'blocked', created_at: nowIso });
          if (!insErr) return;
        }
      } else if (!isSupabaseUuidMismatch(findErr)) {
        throw findErr;
      } else {
        markFriendshipsSchemaUuidOnly();
      }
    }
  }

  const existingFb = await getFriendshipBetweenSmart(blockerId, targetId);
  if (existingFb?.id) {
    await updateDoc(doc(db, 'friendships', existingFb.id), {
      status: 'blocked',
      sender_id: blockerId,
      receiver_id: targetId,
    });
  } else {
    await addDoc(collection(db, 'friendships'), {
      sender_id: blockerId,
      receiver_id: targetId,
      status: 'blocked',
      created_at: nowIso,
    });
  }
};

