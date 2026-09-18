import re

with open('src/pages/Messages.tsx', 'r') as f:
    content = f.read()

replacement = """      // FETCH INITIAL DATA ONCE TO AVOID DUPLICATE ONSNAPSHOT BILLING
      try {
        const snap = await getDocs(qMsgs);
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        mergeIncomingMessages(docs);
      } catch (err) {
        console.warn("Messages initial fetch failed", err);
      }

      // No longer duplicate onSnapshot for messages here; useGlobalStore covers incoming."""

content = re.sub(
    r'      firebaseUnsub = onSnapshot\(qMsgs, \(snap\) => \{[\s\S]*?      \}\);',
    replacement,
    content
)

with open('src/pages/Messages.tsx', 'w') as f:
    f.write(content)
