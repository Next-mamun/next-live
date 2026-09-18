import re

with open('src/pages/Feed.tsx', 'r') as f:
    content = f.read()

replacement = """  useEffect(() => {
    // Generate fresh session seed and fetch dynamic feed on entry
    setFeedRandomSeed(Math.random());
    
    // Shuffle on new session to ensure dynamic feeling without burning extra reads if TTL is active
    const isNewSession = !sessionStorage.getItem('session_feed_shuffled');
    if (isNewSession) {
      sessionStorage.setItem('session_feed_shuffled', 'true');
      useGlobalStore.setState(s => ({
        feedPosts: [...s.feedPosts].sort(() => Math.random() - 0.5)
      }));
      // On brand new session, force refresh to get latest data from FB
      fetchHomeFeed(false, true);
    } else {
      fetchHomeFeed(false);
    }
  }, [fetchHomeFeed]);"""

content = re.sub(
    r'  useEffect\(\(\) => \{\n    // Generate fresh session seed and fetch dynamic feed on entry\n    setFeedRandomSeed\(Math\.random\(\)\);\n    fetchHomeFeed\(false\);\n  \}, \[fetchHomeFeed\]\);',
    replacement,
    content,
    flags=re.DOTALL
)

with open('src/pages/Feed.tsx', 'w') as f:
    f.write(content)
