import Dexie, { Table } from 'dexie';

export interface LocalUser {
  id: string;
  name?: string;
  display_name?: string;
  username: string;
  avatar?: string; // Base64, Cloudinary, or Dicebear
  avatar_url?: string;
  email?: string;
  cover_url?: string;
  bio?: string;
  is_verified?: boolean;
  verification_document_url?: string;
  verification_status?: "none" | "pending" | "approved" | "rejected";
  created_at?: string;
}

export interface LocalFriend {
  id: string;          // User ID
  friendship_id: string; // Firestore document ID
  name: string;
  username: string;
  avatar: string; // Base64
  status: string; // 'accepted', 'pending', etc.
  is_pending?: boolean;
}

export interface LocalMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string | number;
  media_url?: string;
  is_read: boolean;
  deleted_for?: string[];
  deleted_for_everyone?: boolean;
  local_media_b64?: string; // Stored offline media
}

export interface LocalPost {
  id: string;
  user_id: string;
  content: string;
  created_at: string | number;
  image_url?: string;
  video_url?: string;
  likes: string[];
  profiles?: any;
}

export interface FeedVideo {
  id: string;
  videoType: 'CLOUDINARY' | 'YOUTUBE' | 'NONE';
  mediaUrl?: string;
  youtubeId?: string;
  thumbnailUrl?: string;
  caption?: string;
  author?: string;
  timestamp: string;
}


export interface LocalSavedContent {
  id: string;
  media_url?: string;
  media_type?: string;
  text?: string;
  author_name?: string;
  author_avatar?: string;
  saved_at: number;
}

export interface LocalConversation {
  id: string; // partner ID or group ID
  partner_id: string;
  display_name: string;
  name?: string;
  username?: string;
  avatar?: string;
  avatar_url?: string;
  is_verified?: boolean;
  is_group?: boolean;
  last_message?: any;
  last_message_text?: string;
  last_message_time?: string | number;
  last_sender_id?: string;
  unread_count?: number;
  updated_at: string | number;
}

export class AppDatabase extends Dexie {
  users!: Table<LocalUser, string>;
  friends!: Table<LocalFriend, string>;
  messages!: Table<LocalMessage, string>;
  conversations!: Table<LocalConversation, string>;
  posts!: Table<LocalPost, string>;
  feed_videos!: Table<FeedVideo, string>;
  saved_content!: Table<LocalSavedContent, string>;
  app_meta!: Table<{key: string, value: any}, string>;

  constructor() {
    super('NextAppDB');
    // Dexie.js Schema Persistence - Version 5 with WhatsApp-style permanent conversations table
    this.version(5).stores({
      conversations: 'id, partner_id, updated_at, last_message_time',
      saved_content: 'id, saved_at',
      users: 'id, username',
      friends: 'id, username, friendship_id, status',
      messages: 'id, sender_id, receiver_id, created_at, chat_id',
      posts: 'id, user_id, created_at',
      feed_videos: 'id, videoType, mediaUrl, youtubeId, thumbnailUrl, caption, author, timestamp',
      app_meta: 'key'
    });
    this.version(4).stores({
      saved_content: 'id, saved_at',
      users: 'id, username',
      friends: 'id, username, friendship_id, status',
      messages: 'id, sender_id, receiver_id, created_at',
      posts: 'id, user_id, created_at',
      feed_videos: 'id, videoType, mediaUrl, youtubeId, thumbnailUrl, caption, author, timestamp',
      app_meta: 'key'
    });
    this.version(3).stores({
      users: 'id, username',
      friends: 'id, username, friendship_id, status',
      messages: 'id, sender_id, receiver_id, created_at',
      posts: 'id, user_id, created_at',
      feed_videos: 'id, videoType, mediaUrl, youtubeId, thumbnailUrl, caption, author, timestamp',
      app_meta: 'key'
    });
  }
}

export const localDB = new AppDatabase();

const memoryProfileCache = new Map<string, any>();

export const getUserProfile = async (userId: string) => {
  if (!userId) return null;
  if (memoryProfileCache.has(userId)) return memoryProfileCache.get(userId);

  try {
    // 1. Check local IndexedDB first (Zero Firestore Read cost)
    const localUser = await localDB.users.get(userId);
    if (localUser && (localUser.display_name || localUser.name)) {
      const normalized = {
        id: userId,
        display_name: localUser.display_name || localUser.name || 'User',
        name: localUser.display_name || localUser.name || 'User',
        username: localUser.username || userId,
        avatar_url: localUser.avatar_url || localUser.avatar || '',
        avatar: localUser.avatar_url || localUser.avatar || '',
        is_verified: Boolean(localUser.is_verified),
        email: localUser.email
      };
      memoryProfileCache.set(userId, normalized);
      return normalized;
    }

    // 2. Check Supabase profiles first (zero Firestore reads)
    const { fetchProfileSmart } = await import('./profileSync');
    const data = await fetchProfileSmart(userId);

    if (data) {
      const normalized = {
        id: userId,
        display_name: data.display_name || data.name || 'User',
        name: data.display_name || data.name || 'User',
        username: data.username || userId,
        avatar_url: data.avatar_url || data.avatar || '',
        avatar: data.avatar_url || data.avatar || '',
        is_verified: Boolean(data.is_verified),
        email: data.email
      };
      memoryProfileCache.set(userId, normalized);
      localDB.users.put(normalized as any).catch(() => {});
      return normalized;
    }
    return null;
  } catch (e) {
    console.warn("getUserProfile error for user:", userId, e);
    return { id: userId, display_name: 'User', name: 'User', username: 'user', avatar_url: '' };
  }
};

// Utility to convert Image URL/File to Base64
export const getBase64Image = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);
  try {
    if (!url || url.startsWith('data:image')) return url;
    const response = await fetch(url, { mode: 'cors', signal: controller.signal });
    if (!response.ok) return url;
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Failed to convert image to base64, returning original URL", error);
    return url;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * WhatsApp-Style Permanent Conversation Persistence in IndexedDB
 * Ensures users who chatted NEVER disappear from the Inbox even across reloads or network drops.
 */
export const saveLocalConversation = async (conv: Partial<LocalConversation> & { id: string }): Promise<LocalConversation | null> => {
  if (!conv.id) return null;
  try {
    const existing = await localDB.conversations.get(conv.id);
    const resolvedLastMsg = conv.last_message || existing?.last_message;
    const resolvedLastMsgTime =
      conv.last_message_time ||
      conv.last_message?.created_at ||
      existing?.last_message_time ||
      '';
    const parsedTimeMs = resolvedLastMsgTime ? new Date(resolvedLastMsgTime).getTime() : 0;
    const updated: LocalConversation = {
      id: conv.id,
      partner_id: conv.partner_id || conv.id,
      display_name: conv.display_name || conv.name || existing?.display_name || 'User',
      name: conv.name || conv.display_name || existing?.name || 'User',
      username: conv.username || existing?.username || '',
      avatar: conv.avatar || conv.avatar_url || existing?.avatar || '',
      avatar_url: conv.avatar_url || conv.avatar || existing?.avatar_url || '',
      is_verified: conv.is_verified ?? existing?.is_verified ?? false,
      is_group: conv.is_group ?? existing?.is_group ?? false,
      last_message: resolvedLastMsg,
      last_message_text: conv.last_message_text ?? (typeof resolvedLastMsg === 'string' ? resolvedLastMsg : (resolvedLastMsg?.text || resolvedLastMsg?.content || existing?.last_message_text || '')),
      last_message_time: resolvedLastMsgTime,
      last_sender_id: conv.last_sender_id || conv.last_message?.sender_id || existing?.last_sender_id || '',
      unread_count: conv.unread_count ?? existing?.unread_count ?? 0,
      updated_at: !isNaN(parsedTimeMs) && parsedTimeMs > 0 ? parsedTimeMs : (existing?.updated_at || 0)
    };
    await localDB.conversations.put(updated);
    return updated;
  } catch (err) {
    console.warn("Error saving conversation to Dexie:", err);
    return null;
  }
};

export const removeLocalConversation = async (id: string): Promise<void> => {
  if (!id) return;
  try {
    await localDB.conversations.delete(id);
  } catch (err) {
    console.warn("Error deleting conversation from Dexie:", err);
  }
};
