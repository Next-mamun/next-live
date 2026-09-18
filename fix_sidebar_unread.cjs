const fs = require('fs');
let code = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');

const regex = /const \{ data: totalUnread = 0 \} = useQuery\(\{[\s\S]*?enabled: !!currentUser,\s*\}\);/g;

code = code.replace(regex, `const totalUnread = useGlobalStore(state => state.unreadMessagesCount) || 0;`);
// add import for useGlobalStore
if (!code.includes("import { useGlobalStore }")) {
  code = code.replace(/import \{ useAuth \} from '\@\/lib\/authContext';/, "import { useAuth } from '@/lib/authContext';\nimport { useGlobalStore } from '@/store/useGlobalStore';");
}

fs.writeFileSync('src/components/Sidebar.tsx', code);
console.log('Modified Sidebar.tsx');
