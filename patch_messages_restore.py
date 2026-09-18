import re

with open('src/pages/Messages.tsx', 'r') as f:
    content = f.read()

replacement = """    fetchFriendships();
  }, [selectedChat?.id, currentUser?.id]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeTypes = ["""

content = content.replace("    fetchFriendships();\n      const mimeTypes = [", replacement)

with open('src/pages/Messages.tsx', 'w') as f:
    f.write(content)
