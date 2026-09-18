const fs = require('fs');
let code = fs.readFileSync('src/pages/Login.tsx', 'utf-8');

code = code.replace(
/setError\('Invalid username or password'\);/g,
`if (err.code === 'auth/network-request-failed') {
          setError('Network error: Please check your internet connection and disable ad-blockers.');
        } else {
          setError('Invalid username or password');
        }`
);

fs.writeFileSync('src/pages/Login.tsx', code);
