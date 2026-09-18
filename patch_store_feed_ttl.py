import re

with open('src/store/useGlobalStore.ts', 'r') as f:
    content = f.read()

replacement = """      fetchHomeFeed: async (loadMore = false, forceRefresh = false) => {
        const { feedPosts, lastFeedFetch } = get();

        // TTL Logic: Skip if valid cache and not forced/loading more
        const now = Date.now();
        if (!loadMore && !forceRefresh && feedPosts.length > 0 && lastFeedFetch && (now - lastFeedFetch < 5 * 60 * 1000)) {
           return;
        }

        // DELTA SYNC: No more 3-refresh logic. Just fetch smart incrementals if not loadMore.
        // We will do a regular fetch, but we do NOT clear localDB on start."""

content = re.sub(
    r'      fetchHomeFeed: async \(loadMore = false, forceRefresh = false\) => \{\n        const \{ feedPosts \} = get\(\);\n\n        // DELTA SYNC: No more 3-refresh logic\. Just fetch smart incrementals if not loadMore\.\n        // We will do a regular fetch, but we do NOT clear localDB on start\.',
    replacement,
    content,
    flags=re.DOTALL
)

# Also reduce the limit in fetchFromFirebase from 150 to 50
content = re.sub(r'limit\(150\)', 'limit(50)', content)

# Also update the state update at the end of fetchHomeFeed to set lastFeedFetch
# Let's search for how feedPosts is set.
