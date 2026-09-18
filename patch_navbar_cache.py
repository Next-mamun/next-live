import re

with open('src/components/Navbar.tsx', 'r') as f:
    content = f.read()

# We need a loading state so we don't spam requests
replacement = """  // Fetch unknown profiles
  const profilesCacheRef = useRef(profilesCache);
  const fetchingRefs = useRef(new Set<string>());
  
  useEffect(() => {
    profilesCacheRef.current = profilesCache;
  }, [profilesCache]);

  useEffect(() => {
    if (!currentUser) return;
    const fetchMissingProfiles = async () => {
      const combined = [...storeNotifications, ...storeMessages.filter(m => m.is_read === false)];
      const senderIds = [...new Set(combined.map(n => n.sender_id).filter(Boolean))];
      
      const missingIds = senderIds.filter(id => !profilesCacheRef.current[id as string] && !fetchingRefs.current.has(id as string));
      if (missingIds.length === 0) return;

      missingIds.forEach(id => fetchingRefs.current.add(id as string));

      const newProfiles: any[] = [];
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      
      // Process in chunks of 30 for 'in' queries
      for (let i = 0; i < missingIds.length; i += 30) {
        const chunk = missingIds.slice(i, i + 30);
        try {
          // In Firestore, id is __name__ but we can also use 'id' if we store it. Better to just fetch one by one if not __name__ or use documentId()
          // We will use the helper if possible, or just standard query
          const { documentId } = await import('firebase/firestore');
          const q = query(collection(db, 'profiles'), where(documentId(), 'in', chunk));
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            newProfiles.push({ id: d.id, ...d.data() });
          });
        } catch (err) {
          console.warn("Chunk fetch error:", err);
          // If documentId() fails in older SDKs, fallback to one-by-one:
          for (const id of chunk) {
             try {
                const { doc, getDoc } = await import('firebase/firestore');
                const dSnap = await getDoc(doc(db, 'profiles', id as string));
                if (dSnap.exists()) {
                   newProfiles.push({ id: dSnap.id, ...dSnap.data() });
                }
             } catch(e) {}
          }
        }
      }
      
      if (newProfiles.length > 0) {
        setProfilesCache(prev => {
          const next = { ...prev };
          newProfiles.forEach((p: any) => { next[p.id] = p; });
          return next;
        });
      }
    };
    fetchMissingProfiles();
  }, [storeNotifications, storeMessages, currentUser]);"""

content = re.sub(r'  // Fetch unknown profiles.*?    fetchMissingProfiles\(\);\n  \}, \[storeNotifications, storeMessages, currentUser\]\);', replacement, content, flags=re.DOTALL)

with open('src/components/Navbar.tsx', 'w') as f:
    f.write(content)
