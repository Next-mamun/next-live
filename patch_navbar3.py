import re

with open('src/components/Navbar.tsx', 'r') as f:
    content = f.read()

# We need a small fix to handle the event bubbling / default link behavior
replacement = """  const handleNotificationClick = async (e: React.MouseEvent, notif: any) => {
    setShowNotifications(false);
    if (!notif.id.toString().startsWith('msg-')) {
      try { await updateDoc(doc(db, 'notifications', notif.id), { is_read: true }); } catch(e) {}
    } else if (notif.type === 'message' && notif.real_msg_id) {
      e.preventDefault(); // Prevent standard link so we can control navigation
      // Navigate using the notification's link with the state passed to open the chat window directly.
      navigate('/messages', { state: { userId: notif.sender_id } });

      const store = useGlobalStore.getState();
      const updatedMessages = store.messages.map(m => 
        m.sender_id === notif.sender_id ? { ...m, is_read: true } : m
      );
      const unreadCount = updatedMessages.filter(m => m.is_read === false && m.receiver_id === currentUser?.id).length;
      useGlobalStore.setState({ messages: updatedMessages, unreadMessagesCount: unreadCount });
      
      try { await updateDoc(doc(db, 'messages', notif.real_msg_id), { is_read: true }); } catch(e) {}
    }
  };"""

content = re.sub(r'  const handleNotificationClick = async \(notif: any\) => \{.*?    \}\n  \};', replacement, content, flags=re.DOTALL)

# update onClick to pass event
content = content.replace("onClick={() => handleNotificationClick(notif)}", "onClick={(e) => handleNotificationClick(e, notif)}")

with open('src/components/Navbar.tsx', 'w') as f:
    f.write(content)
