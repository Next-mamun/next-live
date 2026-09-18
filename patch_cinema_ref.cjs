const fs = require('fs');
let code = fs.readFileSync('src/pages/Cinema.tsx', 'utf8');

// replace localStream with (window as any).cinemaLocalStream in setLocalStream
code = code.replace(/setLocalStream\(stream\);/g, `setLocalStream(stream); (window as any).cinemaLocalStream = stream;`);

// replace localStream in call.answer
code = code.replace(/call\.answer\(localStream\);/g, `call.answer((window as any).cinemaLocalStream);`);
code = code.replace(/call\.answer\(localStream \|\| undefined\);/g, `call.answer((window as any).cinemaLocalStream || undefined);`);

// also fix the if (localStream) in the peer.on('call')
code = code.replace(/if \(localStream\) {/g, `if ((window as any).cinemaLocalStream) {`);

fs.writeFileSync('src/pages/Cinema.tsx', code);
