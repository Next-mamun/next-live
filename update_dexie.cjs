const fs = require('fs');
let code = fs.readFileSync('src/lib/dexie.ts', 'utf-8');

if (!code.includes('LocalSavedContent')) {
  const interfaceStr = `
export interface LocalSavedContent {
  id: string;
  media_url?: string;
  media_type?: string;
  text?: string;
  author_name?: string;
  author_avatar?: string;
  saved_at: number;
}
`;

  code = code.replace("export class AppDatabase", interfaceStr + "\nexport class AppDatabase");
  code = code.replace("feed_videos!: Table<FeedVideo, string>;", "feed_videos!: Table<FeedVideo, string>;\n  saved_content!: Table<LocalSavedContent, string>;");
  
  // Find the stores declaration and upgrade it
  code = code.replace("this.version(3).stores({", "this.version(4).stores({\n      saved_content: 'id, saved_at',\n      users: 'id, username',\n      friends: 'id, username, friendship_id, status',\n      messages: 'id, sender_id, receiver_id, created_at',\n      posts: 'id, user_id, created_at',\n      feed_videos: 'id, videoType, mediaUrl, youtubeId, thumbnailUrl, caption, author, timestamp',\n      app_meta: 'key'\n    });\n    this.version(3).stores({");
  
  fs.writeFileSync('src/lib/dexie.ts', code);
  console.log('Added saved_content to dexie.ts');
}
