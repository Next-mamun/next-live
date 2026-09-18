const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// Find where contactsList is defined or mapped.
// Often it's sortedContacts.map((c) => ...)
// Let's modify the map to filter out archived ones.
// I'll search for sortedContacts.map(
const regex = /(sortedContacts\.map\(\(c\) => \{)/;
code = code.replace(regex, `
                const archived = JSON.parse(localStorage.getItem('archived_chats') || '[]');
                const filteredContacts = sortedContacts.filter(c => !archived.includes(c.id));
                return filteredContacts.map((c) => {
`);
// Now replace `sortedContacts.map` with the above.
// Wait, I didn't replace it correctly because I used `return filteredContacts.map`. That implies it's inside a function, but usually it's inside JSX like `{sortedContacts.map((c) => { ... })}`
