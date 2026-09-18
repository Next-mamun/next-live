const fs = require('fs');
let code = fs.readFileSync('src/pages/Meet.tsx', 'utf8');

code = code.replace(
  `        })}
      </div>

      {/* Typing Indicator */}`,
  `        })}
        <div id="chat-bottom-anchor"></div>
      </div>

      {/* Typing Indicator */}`
);

// Update scrollToBottom function
code = code.replace(
  `  const scrollToBottom = () => {
    setTimeout(() => {
      const el = document.getElementById('meet-chat');
      if (el) el.scrollTop = el.scrollHeight;
    }, 100);
  };`,
  `  const scrollToBottom = () => {
    setTimeout(() => {
      const anchor = document.getElementById('chat-bottom-anchor');
      if (anchor) anchor.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };`
);

fs.writeFileSync('src/pages/Meet.tsx', code);
