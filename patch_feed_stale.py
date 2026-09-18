import re

with open('src/pages/Feed.tsx', 'r') as f:
    content = f.read()

content = content.replace("    },\\n    staleTime: 1000 * 60 * 5,\\n  });", "    }\\n  });")
content = content.replace("    },\\n    staleTime: 1000 * 60 * 5,\\n  });", "    }\\n  });")
content = re.sub(r'    \},\n    staleTime: 1000 \* 60 \* 5,\n  \}\);', r'    }\n  });', content)

with open('src/pages/Feed.tsx', 'w') as f:
    f.write(content)
