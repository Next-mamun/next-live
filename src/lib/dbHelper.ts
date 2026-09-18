import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { supabase } from './supabase';
import { localDB } from './dexie';
import { useGlobalStore } from '@/store/useGlobalStore';

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

export const dualWriteMessage = async (messageData: any) => {
  const msgRefId = messageData.id || crypto.randomUUID();
  
  let createdAtStr = new Date().toISOString();
  if (messageData.created_at && typeof messageData.created_at === 'string') {
    createdAtStr = messageData.created_at;
  } else if (messageData.created_at?.toDate) {
    createdAtStr = messageData.created_at.toDate().toISOString();
  }

  const chatId = messageData.chat_id || messageData.chatId || [messageData.sender_id, messageData.receiver_id].sort().join('_');

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
    text: textContent || messageData.text || messageData.content || '',
    chatId: chatId,
    chat_id: chatId,
    created_at: createdAtStr,
    synced: true
  };

  // 1. Dexie Local DB Write for immediate local persistence
  try {
    await localDB.messages.put(payload as any);
  } catch (err) {
    console.warn("Dexie local write error:", err);
  }

  // 2. True Dual-Write: Persist to Firebase Firestore AND Supabase simultaneously
  // Firebase Firestore write (Primary, persistent source of truth across all clients)
  const writeFirebase = async () => {
    try {
      const msgRef = doc(db, 'messages', msgRefId);
      const firebasePayload = { ...payload };
      delete firebasePayload.synced; // Clean up before sending to FB
      await setDoc(msgRef, firebasePayload);
      console.log(`✅ [Firebase Message Success]: ${msgRefId}`);
    } catch (firebaseErr) {
      console.error("Firebase message write error:", firebaseErr);
    }
  };

  // Supabase write (Realtime broadcast & query sync)
  const writeSupabase = async () => {
    try {
      const { error } = await supabase.from('messages').insert({
        id: msgRefId,
        sender_id: payload.sender_id,
        receiver_id: payload.receiver_id,
        text: payload.text,
        content: payload.content || payload.text,
        chat_id: chatId,
        is_read: payload.is_read || false,
        media_url: payload.media_url || null,
        media_type: payload.media_type || null,
        created_at: createdAtStr
      });
      if (error) throw error;
      console.log(`✅ [Supabase Message Success]: ${msgRefId}`);
    } catch (error) {
      console.warn('Supabase message insert warning:', error);
      useGlobalStore.getState().triggerFirebaseFallback();
    }
  };

  // Run both writes in parallel for guaranteed persistence across all devices
  await Promise.allSettled([writeFirebase(), writeSupabase()]);

  return { id: msgRefId };
};

