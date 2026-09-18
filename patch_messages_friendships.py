import re

with open('src/pages/Messages.tsx', 'r') as f:
    content = f.read()

replacement = """    const fetchFriendships = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'friendships'),
            or(where('sender_id', '==', currentUser.id), where('receiver_id', '==', currentUser.id))
          )
        );
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Using global store instead or updating local state
      } catch (e) {}
    };"""

content = re.sub(
    r'    const fetchFriendships = async \(\) => \{\n      try \{\n        const snap = await getDocs\(\n          query\(\n            collection\(db, \'friendships\'\),\n            or\(where\(\'sender_id\', \'==\', currentUser\.id\), where\(\'receiver_id\', \'==\', currentUser\.id\)\)\n          \)\n        \);\n        const data = snap\.docs\.map\(d => \(\{ id: d\.id, \.\.\.d\.data\(\) \}\)\);\n        setFriendships\(data\);\n      \} catch \(e\) \{\}\n    \};',
    replacement,
    content
)

with open('src/pages/Messages.tsx', 'w') as f:
    f.write(content)
