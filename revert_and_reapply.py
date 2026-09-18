import re

with open('src/pages/Messages.tsx', 'r') as f:
    content = f.read()

# Revert top
content = re.sub(
    r'  const \{ isSupabaseActive, messages: storeMessages \} = useGlobalStore\(\);\n\n  // Sync incoming messages from global store to local chat view\n  useEffect\(\(\) => \{\n    if \(selectedChat && storeMessages\.length > 0\) \{\n      // Find messages that belong to the current active chat\n      const relevantMsgs = storeMessages\.filter\(m => \n        selectedChat\.is_group \n          \? m\.receiver_id === selectedChat\.id \n          : \(\(m\.sender_id === currentUser\?\.id && m\.receiver_id === selectedChat\.id\) \|\| \n             \(m\.sender_id === selectedChat\.id && m\.receiver_id === currentUser\?\.id\)\)\n      \);\n      if \(relevantMsgs\.length > 0\) \{\n        mergeIncomingMessages\(relevantMsgs\);\n      \}\n    \}\n  \}, \[storeMessages, selectedChat\]\);',
    '  const { isSupabaseActive } = useGlobalStore();',
    content,
    flags=re.DOTALL
)

# Apply below mergeIncomingMessages
hook = """
  // Sync incoming messages from global store to local chat view
  const { messages: storeMessages } = useGlobalStore();
  useEffect(() => {
    if (selectedChat && storeMessages.length > 0) {
      const relevantMsgs = storeMessages.filter(m => 
        selectedChat.is_group 
          ? m.receiver_id === selectedChat.id 
          : ((m.sender_id === currentUser?.id && m.receiver_id === selectedChat.id) || 
             (m.sender_id === selectedChat.id && m.receiver_id === currentUser?.id))
      );
      if (relevantMsgs.length > 0) mergeIncomingMessages(relevantMsgs);
    }
  }, [storeMessages, selectedChat]);
"""

content = re.sub(
    r'(    const mergeIncomingMessages = \(incomingMsgs: any\[\]\) => \{[\s\S]*?    \};\n)',
    r'\1' + hook,
    content
)

with open('src/pages/Messages.tsx', 'w') as f:
    f.write(content)
