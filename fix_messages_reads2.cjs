const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');
const lines = code.split('\n');

lines[889] = "         queryClient.invalidateQueries({ queryKey: ['contacts'] });"; // unsubFriendships
lines[1039] = "            queryClient.invalidateQueries({ queryKey: ['contacts'] });"; // block/unblock

fs.writeFileSync('src/pages/Messages.tsx', lines.join('\n'));
