import re

with open('src/pages/Messages.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));\n        setFriendships(data);",
    "queryClient.invalidateQueries({ queryKey: ['contacts'] });"
)

with open('src/pages/Messages.tsx', 'w') as f:
    f.write(content)
