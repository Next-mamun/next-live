import re

with open('src/components/Navbar.tsx', 'r') as f:
    content = f.read()

replacement = """  // Fetch unknown profiles
  const profilesCacheRef = useRef(profilesCache);
  useEffect(() => {
    profilesCacheRef.current = profilesCache;
  }, [profilesCache]);

  useEffect(() => {
    if (!currentUser) return;
    const fetchMissingProfiles = async () => {
      const combined = [...storeNotifications, ...storeMessages.filter(m => m.is_read === false)];
      const senderIds = [...new Set(combined.map(n => n.sender_id).filter(Boolean))];
      
      const missingIds = senderIds.filter(id => !profilesCacheRef.current[id as string]);
      if (missingIds.length === 0) return;

      const newProfiles: any[] = [];
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      
      // Process in chunks of 30 for 'in' queries
      for (let i = 0; i < missingIds.length; i += 30) {
        const chunk = missingIds.slice(i, i + 30);
        try {
          const q = query(collection(db, 'profiles'), where('__name__', 'in', chunk));
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            newProfiles.push({ id: d.id, ...d.data() });
          });
        } catch (err) {
          console.warn("Chunk fetch error:", err);
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

content = re.sub(r'  // Fetch unknown profiles.*?  }, \[storeNotifications, storeMessages, currentUser\]\);', replacement, content, flags=re.DOTALL)

with open('src/components/Navbar.tsx', 'w') as f:
    f.write(content)
