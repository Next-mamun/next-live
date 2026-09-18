sed -i 's/posts: Table<LocalPost, string>;/posts!: Table<LocalPost, string>;\n  feed_videos!: Table<FeedVideo, string>;/g' src/lib/dexie.ts
sed -i 's/posts: .id, user_id, created_at./posts: '"'"'id, user_id, created_at'"'"',\n      feed_videos: '"'"'id, videoType, mediaUrl, youtubeId, thumbnailUrl, caption, author, timestamp'"'"'/g' src/lib/dexie.ts
sed -i 's/this.version(1).stores/this.version(2).stores/g' src/lib/dexie.ts
