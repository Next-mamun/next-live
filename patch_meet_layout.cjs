const fs = require('fs');
let code = fs.readFileSync('src/pages/Meet.tsx', 'utf8');

// Replace LOBBY container
code = code.replace(
  /<div className="flex flex-col items-center justify-center fixed inset-0 z-\[100\] p-4 bg-black text-white pb-\[70px\] md:pb-0">/g,
  `<div className="flex flex-col items-center justify-center h-full w-full flex-1 p-4 bg-black text-white">`
);

// Replace ROOM container
code = code.replace(
  /<div className="flex flex-col fixed inset-0 z-\[100\] bg-black text-white pb-\[70px\] md:pb-0">/g,
  `<div className="flex flex-col h-full w-full flex-1 bg-black text-white overflow-hidden relative">`
);

// Ensure active call UI spans the whole screen. It currently uses `absolute inset-0 z-50`. Let's change it to `fixed inset-0 z-[200]` so it overlays BottomNav
code = code.replace(
  /<div className="absolute inset-0 z-50 bg-\[\#111111\] flex flex-col items-center justify-between p-6 animate-in fade-in slide-in-from-bottom-10 duration-300">/g,
  `<div className="fixed inset-0 z-[200] bg-[#111111] flex flex-col items-center justify-between p-6 animate-in fade-in slide-in-from-bottom-10 duration-300">`
);

// Incoming call overlay
code = code.replace(
  /<div className="absolute inset-0 z-50 bg-black\/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">/g,
  `<div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">`
);

// View Once Fullscreen Modal
code = code.replace(
  /<div className="fixed inset-0 bg-black z-\[100\] flex flex-col">/g,
  `<div className="fixed inset-0 bg-black z-[200] flex flex-col">`
);

fs.writeFileSync('src/pages/Meet.tsx', code);
