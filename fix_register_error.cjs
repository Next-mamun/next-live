const fs = require('fs');
let code = fs.readFileSync('src/pages/Register.tsx', 'utf-8');

code = code.replace(
  /setError\(err\.message \|\| 'Registration failed'\);/,
  `if (err.code === 'auth/network-request-failed') {
        setError('Network error: Please check your internet connection and disable ad-blockers.');
      } else {
        setError(err.message || 'Registration failed');
      }`
);

fs.writeFileSync('src/pages/Register.tsx', code);
