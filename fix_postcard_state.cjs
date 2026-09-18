const fs = require('fs');
let code = fs.readFileSync('src/components/PostCard.tsx', 'utf-8');

if (!code.includes('const [showMenu, setShowMenu]')) {
  code = code.replace(
    'const [showComments, setShowComments] = useState(false);',
    `const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState('');`
  );
  fs.writeFileSync('src/components/PostCard.tsx', code);
  console.log('Added states to PostCard');
} else {
  console.log('States already exist in PostCard?');
}
