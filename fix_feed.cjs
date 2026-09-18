const fs = require('fs');
let code = fs.readFileSync('src/pages/Feed.tsx', 'utf-8');

// Adding staleTime to useQuery for reels ribbon
const regex = /queryKey: \['reels_ribbon', showAllReels\],/g;
code = code.replace(regex, `queryKey: ['reels_ribbon', showAllReels],
    staleTime: 1000 * 60 * 5, // 5 minutes cache`);

fs.writeFileSync('src/pages/Feed.tsx', code);
console.log('Modified Feed.tsx');
