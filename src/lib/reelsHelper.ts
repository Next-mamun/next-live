import { localDB, getUserProfile } from '@/lib/dexie';

export const populateReelsWithProfiles = async (reelsList: any[]) => {
  if (!reelsList || reelsList.length === 0) return reelsList;
  try {
    const userIds = Array.from(new Set(reelsList.map(r => r.user_id).filter(Boolean)));
    if (userIds.length === 0) return reelsList;

    // Load cached users from IndexedDB (Dexie) with zero network read cost
    const cachedUsers = await localDB.users.where('id').anyOf(userIds).toArray().catch(() => []);
    const userMap = new Map<string, any>();
    cachedUsers.forEach(u => {
      userMap.set(u.id, u);
    });

    // Check if any missing and resolve from dexie helper / firebase
    const missingIds = userIds.filter(id => !userMap.has(id));
    if (missingIds.length > 0) {
      await Promise.all(
        missingIds.slice(0, 10).map(async (uid) => {
          try {
            const prof = await getUserProfile(uid);
            if (prof) userMap.set(uid, prof);
          } catch (e) {}
        })
      );
    }

    return reelsList.map(r => {
      const u: any = userMap.get(r.user_id);
      if (u) {
        const name = u.display_name || u.name || r.profiles?.display_name || 'User';
        const uname = u.username || r.profiles?.username || 'user';
        const avatar = u.avatar_url || u.avatar || r.profiles?.avatar_url || '';
        const verified = Boolean(u.is_verified ?? r.profiles?.is_verified);
        return {
          ...r,
          author: name,
          author_name: name,
          author_username: uname,
          author_avatar: avatar,
          profiles: {
            ...r.profiles,
            id: r.user_id,
            display_name: name,
            name: name,
            username: uname,
            avatar_url: avatar,
            avatar: avatar,
            is_verified: verified,
          }
        };
      }
      return r;
    });
  } catch (err) {
    console.warn('Error populating reels profiles:', err);
    return reelsList;
  }
};

export const formatReelDoc = (d: any, sourceCollection: string = 'posts') => {
  const data = typeof d.data === 'function' ? d.data() : (d.data || d);
  const id = d.id || data.id;

  const likesCount = Number(data.likesCount ?? (Array.isArray(data.likes) ? data.likes.length : 0)) || 0;
  const commentsCount = Number(data.commentsCount ?? (Array.isArray(data.comments) ? data.comments.length : 0)) || 0;
  const views = Number(data.views) || 0;

  const authorName = data.author_name || data.author || data.profiles?.display_name || data.profiles?.name || 'User';
  const authorAvatar = data.author_avatar || data.author_photo || data.profiles?.avatar_url || data.profiles?.avatar || '';
  const authorUsername = data.author_username || data.profiles?.username || 'user';
  const isVerified = Boolean(data.author_verified || data.profiles?.is_verified);

  const mediaUrl = data.media_url || data.mediaUrl || data.video_url || '';
  const content = data.content || data.caption || '';
  const sourceType = data.source_type || (mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be') ? 'youtube' : 'local');
  const youtubeId = data.youtube_id || data.youtubeId || null;

  return {
    id,
    user_id: data.user_id || '',
    content,
    caption: content,
    media_url: mediaUrl,
    mediaUrl,
    media_type: 'video',
    source_type: sourceType,
    youtube_id: youtubeId,
    youtubeId,
    thumbnail_url: data.thumbnail_url || data.thumbnailUrl || '',
    thumbnailUrl: data.thumbnail_url || data.thumbnailUrl || '',
    created_at: typeof data.created_at === 'string' ? data.created_at : (data.created_at?.toDate ? data.created_at.toDate().toISOString() : (data.timestamp || new Date().toISOString())),
    timestamp: typeof data.timestamp === 'string' ? data.timestamp : (data.created_at || new Date().toISOString()),
    views,
    likesCount,
    commentsCount,
    likes: Array.isArray(data.likes) ? data.likes : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
    profiles: {
      id: data.user_id || '',
      display_name: authorName,
      name: authorName,
      username: authorUsername,
      avatar_url: authorAvatar,
      avatar: authorAvatar,
      is_verified: isVerified,
    },
    author: authorName,
    author_name: authorName,
    author_avatar: authorAvatar,
    author_username: authorUsername,
    source_collection: sourceCollection,
  };
};
