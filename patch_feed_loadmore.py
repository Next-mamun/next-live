import re

with open('src/pages/Feed.tsx', 'r') as f:
    content = f.read()

replacement = """  useEffect(() => {
    // If hasMorePosts is false because we don't paginate the randomized pool, 
    // we don't need to observe for load more unless we want to trigger a refresh.
    // For now we just skip the observer if no more posts are available.
    if (!hasMorePosts) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMorePosts && !postsLoading) {
        handleLoadMore();
      }
    }, { threshold: 0.1 });"""

content = re.sub(r'  useEffect\(\(\) => \{\n    const observer = new IntersectionObserver\(\(entries\) => \{\n      if \(entries\[0\]\.isIntersecting && hasMorePosts && !postsLoading\) \{\n        handleLoadMore\(\);\n      \}\n    \}, \{ threshold: 0\.1 \}\);', replacement, content, flags=re.DOTALL)

with open('src/pages/Feed.tsx', 'w') as f:
    f.write(content)
