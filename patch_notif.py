import re

with open('src/pages/Notifications.tsx', 'r') as f:
    content = f.read()

replacement = """  useEffect(() => {
    if (!currentUser) return;
    // Removed duplicate onSnapshot listener here. Global store handles real-time updates.
  }, [currentUser, queryClient]);"""

content = re.sub(
    r'  useEffect\(\(\) => \{\n    if \(!currentUser\) return;\n\n    const q = query\(collection\(db, \'notifications\'\), where\(\'user_id\', \'==\', currentUser\.id\)\);\n    const unsub = onSnapshot\(q, \(\) => \{\n        queryClient\.invalidateQueries\(\{ queryKey: \[\'notifications\', currentUser\?\.id\] \}\);\n    \}, \(error\) => \{\n      console\.warn\("notifications onSnapshot error:", error\);\n    \}\);\n\n    return \(\) => unsub\(\);\n  \}, \[currentUser, queryClient\]\);',
    replacement,
    content,
    flags=re.DOTALL
)

with open('src/pages/Notifications.tsx', 'w') as f:
    f.write(content)
