const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

const regex = /\.subscribe\(\(status: string, err: any\) => \{[\s\S]*?initializeChat\(\); \/\/ Retry initialization which will now use Firebase[\s\S]*?\}\);/g;

code = code.replace(regex, `.subscribe((status: string, err: any) => {
            console.log(\`🔌 [Chat Realtime Channel Status]: \${status}\`, err || '');
            // Supabase auto-reconnects on TIMED_OUT or CHANNEL_ERROR. 
            // We no longer manually tear down and recreate the channel because it causes loops and desyncs.
          });`);

fs.writeFileSync('src/pages/Messages.tsx', code);
console.log('Modified Messages.tsx');
