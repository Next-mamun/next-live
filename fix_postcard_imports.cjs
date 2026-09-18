const fs = require('fs');
let code = fs.readFileSync('src/components/PostCard.tsx', 'utf-8');
code = "import { MoreVertical, Flag, Bookmark } from 'lucide-react';\n" + code;
fs.writeFileSync('src/components/PostCard.tsx', code);
