const profilesCache = { 'user1': { display_name: 'John' } };
const n = { sender_id: 'user1' };
const sender = profilesCache[n.sender_id] || null;
console.log(sender?.display_name || 'Someone');
