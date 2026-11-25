import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { supabase } from './supabase';
import { localDB, saveLocalConversation } from './dexie';
import { safeLocalGet, safeLocalRemove, safeLocalSet } from './safeStorage';

const DB_SWITCH_KEY = 'next_media_db_fallback';
const DB_SWITCH_EXPIRY = 2 * 60 * 1000; // 2 minutes temporary fallback only

export const getActiveDB = (): 'firebase' | 'supabase' => {
  try {
    const data = safeLocalGet(DB_SWITCH_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Date.now() - parsed.timestamp < DB_SWITCH_EXPIRY) {
        return parsed.db;
      } else {
        safeLocalRemove(DB_SWITCH_KEY);
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
  return 'firebase';
};

export const clearDBFallback = () => {
  safeLocalRemove(DB_SWITCH_KEY);
};

export const switchDB = (from: 'firebase' | 'supabase') => {
  const currentDB = getActiveDB();
  if (currentDB === from) {
    const nextDB = currentDB === 'firebase' ? 'supabase' : 'firebase';
    try {
      safeLocalSet(DB_SWITCH_KEY, JSON.stringify({
        db: nextDB,
        timestamp: Date.now()
      }));
      console.warn(`Switched active database to: ${nextDB}`);
    } catch (e) {}
  }
};

export const dualWritePost = async (postData: any) => {
  // 1. Write to Firebase
  let postRef;
  try {
    postRef = await addDoc(collection(db, 'posts'), postData);
  } catch (err) {
    console.error("Firebase write failed:", err);
  }

  // 2. Write to Supabase (Backup with schema-safe fields)
  try {
    let createdIso = new Date().toISOString();
    if (postData.created_at && typeof postData.created_at === 'string') {
      createdIso = postData.created_at;
    } else if (postData.created_at?.toDate) {
      try { createdIso = postData.created_at.toDate().toISOString(); } catch {}
    }

    const userId = postData.user_id || postData.userId;
    const basePayload: Record<string, any> = {
      id: postRef?.id || crypto.randomUUID(),
      user_id: userId,
      content: postData.content || '',
      media_url: postData.media_url || postData.image_url || postData.video_url || null,
      media_type: postData.media_type || 'text',
      created_at: createdIso,
    };

    const fullPayload = postData.category
      ? { ...basePayload, category: postData.category }
      : basePayload;

    const { error } = await supabase.from('posts').insert(fullPayload);
    if (error && postData.category && (error.message || '').toLowerCase().includes('category')) {
      const { error: retryErr } = await supabase.from('posts').insert(basePayload);
      if (retryErr && !postRef) throw retryErr;
    } else if (error) {
      console.warn('Supabase dual-write warning (posts):', error.message || error);
      if (!postRef) throw error;
    }
  } catch (error) {
    console.error('Supabase dual-write catch (posts):', error);
    if (!postRef) throw error;
  }
  return postRef || { id: 'supa-' + Date.now().toString() };
};

/**
 * Writes a chat message directly to Dexie (instant local cache) and Supabase `messages` (100% Supabase, no Firestore).
 */
export const writeSupabaseMessage = async (messageData: any) => {
  const msgRefId = messageData.id || crypto.randomUUID();

  let createdAtStr = new Date().toISOString();
  if (messageData.created_at && typeof messageData.created_at === 'string') {
    createdAtStr = messageData.created_at;
  } else if (messageData.created_at?.toDate) {
    createdAtStr = messageData.created_at.toDate().toISOString();
  } else if (typeof messageData.local_created_at === 'string') {
    createdAtStr = messageData.local_created_at;
  }

  const isGroup = typeof messageData.receiver_id === 'string' && messageData.receiver_id.startsWith('group_');
  const chatId = isGroup
    ? messageData.receiver_id
    : (messageData.chat_id || messageData.chatId || [messageData.sender_id, messageData.receiver_id].sort().join('_'));

  let textContent = messageData.text || '';
  if (!textContent && messageData.content) {
    if (typeof messageData.content === 'string') {
      if (messageData.content.includes('"JSON_PAYLOAD"')) {
        try {
          const parsed = JSON.parse(messageData.content);
          textContent = parsed.text || '';
        } catch (e) {
          textContent = messageData.content;
        }
      } else {
        textContent = messageData.content;
      }
    }
  }

  const payload: any = {
    ...messageData,
    id: msgRefId,
    text: textContent || messageData.text || (typeof messageData.content === 'string' ? messageData.content : ''),
    content: messageData.content || textContent || '',
    chatId: chatId,
    chat_id: chatId,
    is_read: Boolean(messageData.is_read),
    deleted_for: Array.isArray(messageData.deleted_for) ? messageData.deleted_for : [],
    deleted_for_everyone: Boolean(messageData.deleted_for_everyone),
    created_at: createdAtStr,
    synced: true
  };

  // 1. Dexie Local DB Write for immediate local persistence
  try {
    await localDB.messages.put(payload as any);
    const partnerId = payload.receiver_id;
    if (partnerId) {
      saveLocalConversation({
        id: partnerId,
        partner_id: partnerId,
        last_message: payload,
        last_message_text: textContent || payload.content || '',
        last_message_time: createdAtStr,
        last_sender_id: payload.sender_id
      }).catch(console.warn);
    }
  } catch (err) {
    console.warn("Dexie local write error:", err);
  }

  // 2. Persist 100% to Supabase `messages`
  const supabaseRow: Record<string, any> = {
    id: msgRefId,
    sender_id: payload.sender_id,
    receiver_id: payload.receiver_id,
    text: payload.text,
    content: payload.content,
    chat_id: chatId,
    is_read: payload.is_read,
    media_url: payload.media_url || null,
    media_type: payload.media_type || null,
    deleted_for: payload.deleted_for,
    deleted_for_everyone: payload.deleted_for_everyone,
    created_at: createdAtStr
  };

  const { error } = await supabase.from('messages').insert(supabaseRow);
  if (error) {
    console.error('Supabase message insert error:', error);
    throw error;
  }

  return { id: msgRefId };
};

// Backwards-compatible export alias (now 100% Supabase + Dexie)
export const dualWriteMessage = writeSupabaseMessage;
