const fs = require('fs');
let code = fs.readFileSync('src/store/useGlobalStore.ts', 'utf-8');

const regex = /\.subscribe\(\(status: string, err: any\) => \{[\s\S]*?get\(\)\.initMessageListener\(userId\);[\s\S]*?\}\);/g;

code = code.replace(regex, `.subscribe((status: string, err: any) => {
                  console.log(\`🔌 [Global Store Realtime Channel Status]: \${status}\`, err || '');
                  // Supabase auto-reconnects on TIMED_OUT or CHANNEL_ERROR.
                });`);

fs.writeFileSync('src/store/useGlobalStore.ts', code);
console.log('Modified useGlobalStore.ts');
