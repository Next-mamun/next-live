const fs = require('fs');

// Fix Sidebar
let sidebarCode = fs.readFileSync('src/components/Sidebar.tsx', 'utf-8');
sidebarCode = sidebarCode.replace(/import \{ useAuth \} from '\@\/lib\/authContext';\nimport \{ useGlobalStore \} from '\@\/store\/useGlobalStore';/, "import { useAuth } from '@/lib/authContext';");
if (!sidebarCode.includes("import { useGlobalStore }")) {
  sidebarCode = sidebarCode.replace(/import \{ useAuth \} from '\@\/lib\/authContext';/, "import { useAuth } from '@/lib/authContext';\nimport { useGlobalStore } from '@/store/useGlobalStore';");
}
fs.writeFileSync('src/components/Sidebar.tsx', sidebarCode);

// Fix Feed.tsx
let feedCode = fs.readFileSync('src/pages/Feed.tsx', 'utf-8');
// regex to remove duplicate staleTime: 1000 * 60 * 5,
const duplicateStaleRegex = /staleTime: 1000 \* 60 \* 5,\s*staleTime: 1000 \* 60 \* 5,/g;
feedCode = feedCode.replace(duplicateStaleRegex, "staleTime: 1000 * 60 * 5,");
// or just replace any occurrence of 2 consecutive ones
feedCode = feedCode.replace(/staleTime: 1000 \* 60 \* 5,\s*staleTime:\s*[^,]+,/g, "staleTime: 1000 * 60 * 5,");

// Let's manually replace multiple staleTime lines
const lines = feedCode.split('\n');
let newLines = [];
let hasStaleTime = false;
let inReelsQuery = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("queryKey: ['reels_ribbon'")) {
    inReelsQuery = true;
    hasStaleTime = false;
  }
  
  if (inReelsQuery && lines[i].includes("staleTime:")) {
    if (hasStaleTime) {
      continue; // Skip duplicate
    }
    hasStaleTime = true;
  }
  
  if (inReelsQuery && lines[i].includes("});")) {
    inReelsQuery = false;
  }
  newLines.push(lines[i]);
}
fs.writeFileSync('src/pages/Feed.tsx', newLines.join('\n'));

console.log('Fixed Sidebar and Feed');
