const fs = require('fs');
let code = fs.readFileSync('src/pages/CreatePost.tsx', 'utf-8');

code = code.replace(
/const \{ getRootProps, getInputProps, isDragActive \} = useDropzone\(\{[\s\S]*?onDrop,[\s\S]*?multiple: false,[\s\S]*?\}\);/,
`const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: { 'image/*': [], 'video/*': [] },
  });`
);

fs.writeFileSync('src/pages/CreatePost.tsx', code);
