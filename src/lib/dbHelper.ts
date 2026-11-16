import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { supabase } from './supabase';
import { localDB, saveLocalConversation } from './dexie';

const DB_SWITCH_KEY = 'next_media_db_fallback';
const DB_SWITCH_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export const getActiveDB = (): 'firebase' | 'supabase' => {
  try {
    const data = localStorage.getItem(DB_SWITCH_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Date.now() - parsed.timestamp < DB_SWITCH_EXPIRY) {
        return parsed.db;
      } else {
        localStorage.removeItem(DB_SWITCH_KEY);
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
  return 'firebase';
};

export const switchDB = (from: 'firebase' | 'supabase') => {
  const currentDB = getActiveDB();
  if (currentDB === from) {
    const nextDB = currentDB === 'firebase' ? 'supabase' : 'firebase';
    try {
      localStorage.setItem(DB_SWITCH_KEY, JSON.stringify({
        db: nextDB,
        timestamp: Date.now()
      }));
      console.warn(`Switched active database to: ${nextDB}`);
    } catch (e) {
      console.error("Failed to save DB fallback state", e);
    }
  }
};

export const dualWritePost = async (postData: any) => {
  // 1. Write to Firebase
  let postRef;
  try {
    postRef = await addDoc(collection(db, 'posts'), postData);
  } catch (err) {
    console.error("Firebase write failed, switching DB:", err);
    switchDB('firebase');
  }
  
  // 2. Write to Supabase (Backup)
  try {
    const supabaseData = { ...postData };
    if (supabaseData.created_at && typeof supabaseData.created_at !== 'string' && supabaseData.created_at.toDate) {
       supabaseData.created_at = supabaseData.created_at.toDate().toISOString();
    } else if (!supabaseData.created_at || supabaseData.created_at?.isEqual) {
       supabaseData.created_at = new Date().toISOString();
    }

    if (!supabaseData.user_id && supabaseData.userId) {
      supabaseData.user_id = supabaseData.userId;
    }
    
    const payload: any = {
      ...supabaseData
    };

    if (postRef?.id) {
      payload.id = postRef.id;
    } else {
      payload.id = crypto.randomUUID();
    }

    delete payload.views;
    delete payload.source_type;
    delete payload.youtube_id;
    delete payload.firebase_id;

    const { error } = await supabase.from('posts').insert(payload);
    if (error) {
      console.warn('Supabase dual-write error (posts):', error.message || error);
      if (!postRef) throw error; // If Firebase also failed, throw the error
    } else {
      console.log('Successfully written to Supabase posts!');
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
