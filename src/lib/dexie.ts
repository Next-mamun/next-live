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

export class AppDatabase extends Dexie {
  users!: Table<LocalUser, string>;
  friends!: Table<LocalFriend, string>;
  messages!: Table<LocalMessage, string>;
  posts!: Table<LocalPost, string>;
  feed_videos!: Table<FeedVideo, string>;
  saved_content!: Table<LocalSavedContent, string>;
  app_meta!: Table<{key: string, value: any}, string>;

  constructor() {
    super('NextAppDB');
    // Dexie.js Schema Persistence
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

    // 2. Lazy dynamic import of firebase to prevent circular deps
    const { db } = await import('./firebase');
    const { doc, getDoc } = await import('firebase/firestore');
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
  try {
    if (url.startsWith('data:image')) return url;
    const response = await fetch(url, { mode: 'cors' });
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
  }
};
