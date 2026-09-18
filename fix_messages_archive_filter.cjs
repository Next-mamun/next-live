const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

const regex = /const filteredForDeletion = contactsWithMessages\.filter\(c => !deletedIds\.includes\(c\.id\)\);/;
const replacement = `const archivedIds = JSON.parse(localStorage.getItem('archived_chats') || '[]');
        const filteredForDeletion = contactsWithMessages.filter(c => !deletedIds.includes(c.id) && !archivedIds.includes(c.id));`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/pages/Messages.tsx', code);
console.log('Modified Messages.tsx with archive filter');
