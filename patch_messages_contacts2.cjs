const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// The replacement was accidentally matching the wrong queryClient block! Let's revert and fix it properly.
// The file is corrupted. We need to fetch from git to be safe, or manually patch the corrupted section.
