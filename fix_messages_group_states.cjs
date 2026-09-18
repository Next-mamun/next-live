const fs = require('fs');
let code = fs.readFileSync('src/pages/Messages.tsx', 'utf-8');
code = code.replace("const [groupName, setGroupName] = useState('');", "const [groupName, setGroupName] = useState('');\n  const [groupAvatarFile, setGroupAvatarFile] = useState<File | null>(null);\n  const [groupAvatarPreview, setGroupAvatarPreview] = useState('');");
fs.writeFileSync('src/pages/Messages.tsx', code);
