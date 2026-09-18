const fs = require('fs');
let code = fs.readFileSync('src/pages/Feed.tsx', 'utf-8');

code = code.replace(
  /const \[feedRandomSeed\] = useState\(\(\) => Math\.random\(\)\);/,
  `const [feedRandomSeed, setFeedRandomSeed] = useState(() => Math.random());`
);

code = code.replace(
  /const handleRefreshFeed = \(\) => \{\s*fetchHomeFeed\(false, true\);/g,
  `const handleRefreshFeed = () => {
    setFeedRandomSeed(Math.random());
    fetchHomeFeed(false, true);`
);

fs.writeFileSync('src/pages/Feed.tsx', code);
