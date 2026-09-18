const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');

// Replace invalidateQueries(['contacts']) inside unsubMessages listener
code = code.replace(/queryClient\.invalidateQueries\(\{ queryKey: \['contacts'\] \}\);/g, `// Avoid fetching contacts repeatedly`);

fs.writeFileSync('src/pages/Messages.tsx', code);
