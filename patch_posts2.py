import re

with open('src/store/useGlobalStore.ts', 'r') as f:
    content = f.read()

replacement = """          set((state) => ({ 
            feedPosts: loadMore ? [...state.feedPosts, ...populatedPosts] : populatedPosts, 
            lastFeedFetch: Date.now(), 
            hasMorePosts: false,
            postsLoading: false
          }));"""

content = re.sub(r'          set\(\(state\) => \(\{\s*feedPosts: loadMore \? \[\.\.\.state.feedPosts, \.\.\.populatedPosts\] : populatedPosts,\s*lastFeedFetch: Date\.now\(\),\s*hasMorePosts: populatedPosts.length === 100,\s*postsLoading: false\s*\}\)\);', replacement, content, flags=re.DOTALL)

with open('src/store/useGlobalStore.ts', 'w') as f:
    f.write(content)
