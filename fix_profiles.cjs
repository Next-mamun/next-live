const fs = require('fs');
let code = fs.readFileSync('src/store/useGlobalStore.ts', 'utf-8');

// Replace the fallback logic
const regex = /let profiles = null;\s*if \(data\.author_name\) \{[\s\S]*?\} else \{\s*profiles = await getProfile\(data\.user_id\);\s*\}/m;
const replacement = `let profiles = await getProfile(data.user_id);
            if (!profiles && data.author_name) {
              profiles = {
                display_name: data.author_name,
                avatar_url: data.author_photo,
                username: data.author_username || 'user'
              };
            }`;

code = code.replace(regex, replacement);

fs.writeFileSync('src/store/useGlobalStore.ts', code);
