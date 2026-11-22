export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  cover_url?: string;
  bio?: string;
  is_verified?: boolean;
  verification_document_url?: string;
  verification_status?: 'none' | 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export type User = UserProfile;

export type StoryVisibility = 'public' | 'friends' | 'friends_except' | 'only_share';

export type StoryFilterPreset = 'none' | 'vivid' | 'warm' | 'cool' | 'bw' | 'vintage';

export interface StoryStickerOverlay {
  id: string;
  emoji: string;
  x: number;
  y: number;
  size: number;
}

export interface StoryTextOverlay {
  id: string;
  text: string;
  color: string;
  bg?: string;
  size: number;
  x: number;
  y: number;
}

export interface StoryDrawPath {
  color: string;
  width?: number;
  points: { x: number; y: number }[];
}

export interface StoryEditMetadata {
  filter?: StoryFilterPreset;
  muted?: boolean;
  trimStart?: number;
  trimEnd?: number;
  texts?: StoryTextOverlay[];
  stickers?: StoryStickerOverlay[];
  paths?: StoryDrawPath[];
  aspectRatio?: number;
}

export interface StoryViewItem {
  id: string;
  story_id: string;
  owner_id: string;
  user_id: string;
  viewer_name: string;
  viewer_username?: string;
  viewer_avatar?: string;
  reaction?: string;
  viewed_at: string;
  viewed_at_ms: number;
}

export interface Story {
  id: string;
  user_id: string;
  author_name?: string;
  author_username?: string;
  author_avatar?: string;
  author_verified?: boolean;
  media_url: string;
  media_type: 'image' | 'video' | 'text';
  caption?: string;
  text_content?: string;
  bg_style?: string;
  font_style?: 'sans' | 'serif' | 'mono' | 'bold';
  visibility: StoryVisibility;
  allowed_user_ids?: string[];
  excluded_user_ids?: string[];
  duration_hours: number;
  expires_at: string;
  expires_at_ms: number;
  created_at: string;
  created_at_ms: number;
  edit_metadata?: StoryEditMetadata | null;
  profiles?: User | null;
  story_views?: StoryViewItem[];
}

export interface Reel {
  id: string;
  user_id: string;
  caption: string;
  video_url: string;
  thumbnail_url?: string;
  source_type: 'local' | 'youtube' | 'facebook';
  youtube_id?: string;
  created_at: string;
  profiles: User;
  likes: any[];
  comments: any[];
  views?: number;
}
