import re

with open('src/pages/Feed.tsx', 'r') as f:
    content = f.read()

replacement = """  const { data: reels = [] } = useQuery({
    queryKey: ['reels_ribbon', showAllReels],
    staleTime: 5 * 60 * 1000, // 5 minutes TTL
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {"""

content = re.sub(
    r'  const \{ data: reels = \[\] \} = useQuery\(\{\n    queryKey: \[\'reels_ribbon\', showAllReels\],\n    staleTime: 5 \* 60 \* 1000, // 5 minutes TTL\n    gcTime: 10 \* 60 \* 1000,\n    queryFn: async \(\) => \{',
    replacement,
    content
)

content = content.replace("    },\n    staleTime: 1000 * 60 * 5,\n  });", "    }\n  });")

with open('src/pages/Feed.tsx', 'w') as f:
    f.write(content)
