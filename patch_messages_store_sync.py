import re

with open('src/pages/Messages.tsx', 'r') as f:
    content = f.read()

# Add storeMessages hook
replacement_hook = """  const { isSupabaseActive, messages: storeMessages } = useGlobalStore();

  // Sync incoming messages from global store to local chat view
  useEffect(() => {
    if (selectedChat && storeMessages.length > 0) {
      // Find messages that belong to the current active chat
      const relevantMsgs = storeMessages.filter(m => 
        selectedChat.is_group 
          ? m.receiver_id === selectedChat.id 
          : ((m.sender_id === currentUser?.id && m.receiver_id === selectedChat.id) || 
             (m.sender_id === selectedChat.id && m.receiver_id === currentUser?.id))
      );
      if (relevantMsgs.length > 0) {
        mergeIncomingMessages(relevantMsgs);
      }
    }
  }, [storeMessages, selectedChat]);"""

content = content.replace("const { isSupabaseActive } = useGlobalStore();", replacement_hook)

with open('src/pages/Messages.tsx', 'w') as f:
    f.write(content)
