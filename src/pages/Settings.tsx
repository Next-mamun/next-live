import { localDB } from '@/lib/dexie';
import React, { useState, useMemo, useEffect } from 'react';
import { requestNotificationPermission } from '@/services/notificationService';
import { toast } from 'sonner';
import { 
  User, Lock, Bell, Shield, Globe, HelpCircle, Search, ChevronRight, 
  Monitor, Database, Briefcase, Smartphone, Key, UserX, EyeOff, 
  MessageSquare, Minimize2, Maximize2, Moon, Sun, Type, HardDrive, Download, 
  BarChart3, DollarSign, AlertTriangle, FileText, RefreshCw, CheckCircle, Upload, Bot, Trash2, UserMinus, BarChart, Users,
  BellRing, Camera, ArrowLeft, AlertCircle
} from 'lucide-react';
import { useAuth, useTheme } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUpload } from '@/contexts/UploadContext';

import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import { syncProfileToSupabase, fetchProfileSmart, fetchProfilesBatchSmart, isUsernameTaken, cacheUserInDexie, migrateUserFriendshipsOnce, fetchUserFriendshipsSmart, deleteFriendshipSmart } from '@/lib/profileSync';
import { updatePassword, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useContentFilter } from '@/hooks/useContentFilter';

// Reusable Toggle Component
const Toggle: React.FC<{ checked: boolean, onChange: () => void }> = ({ checked, onChange }) => (
  <button 
    onClick={onChange} 
    className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-300 ${checked ? 'bg-[#1A2933]' : 'bg-gray-300'}`}
  >
    <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform shadow-sm ${checked ? 'left-[26px]' : 'left-0.5'}`} />
  </button>
);

// Reusable Section Component
const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-8">
    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-4">{title}</h3>
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow-sm transition-colors">
      {children}
    </div>
  </div>
);

const BlockedUsersSection: React.FC = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: blockedUsers = [], isLoading } = useQuery({
    queryKey: ['blockedUsers', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      migrateUserFriendshipsOnce(currentUser.id).catch(() => {});

      const { rows } = await fetchUserFriendshipsSmart(currentUser.id);
      const blockedRows = rows.filter((r: any) => r.status === 'blocked' && r.sender_id === currentUser.id);
      if (blockedRows.length === 0) return [];

      const receiverIds = blockedRows.map((r: any) => r.receiver_id).filter(Boolean);
      const profMap = await fetchProfilesBatchSmart(receiverIds);

      const profiles = blockedRows
        .map((r: any) => {
          const p = profMap.get(r.receiver_id);
          return p ? { ...p, friendshipId: r.id } : null;
        })
        .filter(Boolean);

      return Array.from(new Map(profiles.map((p: any) => [p.id, p])).values());
    },
    enabled: !!currentUser,
  });

  const handleUnblock = async (user: any) => {
    if (!currentUser) return;
    if (confirm('Are you sure you want to unblock this user?')) {
      try {
        await deleteFriendshipSmart(user.friendshipId);
        queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
        queryClient.invalidateQueries({ queryKey: ['friends'] });
        queryClient.invalidateQueries({ queryKey: ['blockStatus'] });
        queryClient.invalidateQueries({ queryKey: ['isBlockedByMe'] });
        toast.success('User unblocked.');
      } catch (e) {
        toast.error('Failed to unblock user.');
      }
    }
  };

  return (
    <Section title="Blocked Accounts">
      {isLoading ? (
        <div className="p-8 text-center">
          <RefreshCw size={24} className="animate-spin mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-500 font-bold">Loading blocked users...</p>
        </div>
      ) : blockedUsers.length === 0 ? (
        <div className="p-8 text-center">
          <div className="bg-gray-100 dark:bg-gray-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserX size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-900 dark:text-white font-bold">No blocked users</p>
          <p className="text-sm text-gray-500 mt-1">Users you block will appear here.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {blockedUsers.map((user: any) => (
            <div key={user.id} className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              <div className="flex items-center gap-3">
                <ProfileAvatar userId={user.id} defaultAvatar={user.avatar_url || undefined} name={user.display_name || user.username || 'User'} className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                <div>
                  <p className="font-bold text-gray-900 dark:text-white flex items-center gap-1">
                    {user.display_name}
                    {user.is_verified && <VerifiedBadge size={14} />}
                  </p>
                  <p className="text-xs text-gray-500 font-medium">@{user.username}</p>
                </div>
              </div>
              <button 
                onClick={() => handleUnblock(user)}
                className="px-4 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-700 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 font-bold text-sm rounded-lg transition-all"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};

// Reusable Row Component
const Row: React.FC<{ icon?: React.ReactNode, title: string, description?: string, action: React.ReactNode, border?: boolean }> = ({ icon, title, description, action, border = true }) => (
  <div className={`flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${border ? 'border-b border-gray-100 dark:border-gray-700' : ''}`}>
    <div className="flex items-center gap-4 pr-4">
      {icon && <div className="text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">{icon}</div>}
      <div>
        <p className="font-bold text-gray-900 dark:text-gray-100 text-[15px]">{title}</p>
        {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{description}</p>}
      </div>
    </div>
    <div className="flex-shrink-0">
      {action}
    </div>
  </div>
);


const SavedContentList = () => {
  const [items, setItems] = useState<any[]>([]);
  
  
  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const saved = await localDB.saved_content.orderBy('saved_at').reverse().toArray();
        setItems(saved);
      } catch (e) {
        console.error(e);
      }
    };
    fetchSaved();
  }, []);

  if (items.length === 0) {
    return <div className="text-center py-10 text-gray-500">No saved content found.</div>;
  }

  return (
    <div className="space-y-4">
      {items.map(item => (
        <div key={item.id} className="p-4 bg-white dark:bg-[#1a1a1b] rounded-xl border border-gray-200 dark:border-gray-800 flex gap-4">
          {item.media_url && item.media_type?.includes('image') && (
            <img src={item.media_url} className="w-24 h-24 object-cover rounded-lg" alt="" />
          )}
          {item.media_url && item.media_type?.includes('video') && (
            <video src={item.media_url} className="w-24 h-24 object-cover rounded-lg" />
          )}
          <div className="flex-1">
            <h4 className="font-bold text-gray-900 dark:text-white">{item.author_name || 'Anonymous'}</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{item.text}</p>
            <p className="text-xs text-gray-400 mt-2">{new Date(item.saved_at).toLocaleString()}</p>
            <button 
              onClick={async () => {
                await localDB.saved_content.delete(item.id);
                setItems(prev => prev.filter(p => p.id !== item.id));
                toast.success('Removed from saved items');
              }}
              className="mt-3 text-red-500 text-sm font-medium"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const Settings: React.FC = () => {
  const { currentUser, setCurrentUser } = useAuth();
  const { 
    darkMode, toggleDarkMode, desktopMode, toggleDesktopMode, nextoEnabled, toggleNexto, robotSize, setRobotSize,
    bottomBarSize, setBottomBarSize,
    iconColor, setIconColor,
    autoplayVideos, setAutoplayVideos,
    saveDataMode, setSaveDataMode,
    highContrastMode, setHighContrastMode,
    hapticFeedback, setHapticFeedback,
    animationsEnabled, setAnimationsEnabled,
    incognitoMode, setIncognitoMode,
    soundEffects, setSoundEffects,
    compactFeed, setCompactFeed,
    showAllReels, setShowAllReels
  } = useTheme();
  const { addUpload } = useUpload();
  const { scanFile } = useContentFilter();
  const avatarInputRef = React.useRef<HTMLInputElement>(null);
  const [textSize, setTextSize] = useState<'normal' | 'large' | 'extra-large'>('normal');
  const [activeTab, setActiveTab] = useState('display');
  const [subView, setSubView] = useState<'child-safety' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    document.documentElement.classList.remove('text-sm', 'text-base', 'text-lg');
    if (textSize === 'normal') document.documentElement.classList.add('text-sm');
    else if (textSize === 'large') document.documentElement.classList.add('text-base');
    else if (textSize === 'extra-large') document.documentElement.classList.add('text-lg');
  }, [textSize]);

  useEffect(() => {
    if (currentUser) {
      fetchProfile();
    }
  }, [currentUser]);

  const fetchProfile = async () => {
    if (!currentUser?.id) return;
    const data = await fetchProfileSmart(currentUser.id);
    if (data) {
      setProfile(data);
    }
  };

  const queryClient = useQueryClient();
  const [savedAccounts, setSavedAccounts] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('next_saved_accounts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isSwitching, setIsSwitching] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [addAccountUsername, setAddAccountUsername] = useState('');
  const [addAccountPassword, setAddAccountPassword] = useState('');
  const [addAccountError, setAddAccountError] = useState('');
  const [addAccountLoading, setAddAccountLoading] = useState(false);

  // Auto-save current user on load if not present
  useEffect(() => {
    if (currentUser && profile) {
      const exists = savedAccounts.some((a: any) => a.id === currentUser.id);
      if (!exists && profile.password) {
        const currAny = currentUser as any;
        const newAcc = {
          id: currentUser.id,
          username: profile.username || currAny.username,
          display_name: profile.display_name || currAny.display_name,
          email: profile.email || currAny.email || `${profile.username || currAny.username}@nextmedia.app`,
          password: profile.password,
          avatar_url: profile.avatar_url || currAny.avatar_url || ''
        };
        const updated = [...savedAccounts, newAcc];
        setSavedAccounts(updated);
        localStorage.setItem('next_saved_accounts', JSON.stringify(updated));
      }
    }
  }, [currentUser, profile, savedAccounts]);

  const handleSwitchAccount = async (targetAccount: any) => {
    if (!targetAccount.email || !targetAccount.password) {
      toast.error('Cannot switch: missing credentials. Please log in again.');
      return;
    }
    
    setIsSwitching(true);
    const toastId = toast.loading(`Switching to @${targetAccount.username}...`);
    
    try {
      // 1. Clear current user profile and auth
      await signOut(auth);
      
      // 2. Sign in to target
      const result = await signInWithEmailAndPassword(auth, targetAccount.email, targetAccount.password);
      
      // 3. Clear react-query cache completely to delete all old data cache
      queryClient.clear();
      try {
        const idb = await import('idb-keyval');
        await idb.clear();
      } catch (e) {
        console.error(e);
      }
      
      // 4. Update state and localStorage
      const userDoc = await getDoc(doc(db, 'profiles', result.user.uid));
      if (userDoc.exists()) {
        const profileData = userDoc.data();
        const freshUser = { id: userDoc.id, ...profileData };
        
        // Ensure accurate state
        const updatedAccounts = savedAccounts.map((acc: any) => {
          if (acc.id === targetAccount.id) {
            return {
              ...acc,
              display_name: profileData.display_name,
              avatar_url: profileData.avatar_url || acc.avatar_url
            };
          }
          return acc;
        });

        // Preserve system settings
        const savedTheme = localStorage.getItem('next_media_theme');
        const savedDesktop = localStorage.getItem('next_media_desktop');
        const savedNexto = localStorage.getItem('next_media_nexto');
        const savedKeyboard = localStorage.getItem('saved_keyboard_height');

        // Wipe local storage clean
        localStorage.clear();
        sessionStorage.clear();

        // Restore preserved keys
        localStorage.setItem('next_saved_accounts', JSON.stringify(updatedAccounts));
        if (savedTheme) localStorage.setItem('next_media_theme', savedTheme);
        if (savedDesktop) localStorage.setItem('next_media_desktop', savedDesktop);
        if (savedNexto) localStorage.setItem('next_media_nexto', savedNexto);
        if (savedKeyboard) localStorage.setItem('saved_keyboard_height', savedKeyboard);
        
        localStorage.setItem('next_media_user', JSON.stringify(freshUser));
        setCurrentUser(freshUser as any);
      }
      
      toast.success(`Switched to @${targetAccount.username}!`, { id: toastId });
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch (err: any) {
      console.error(err);
      toast.error(`Switch failed: ${err.message}`, { id: toastId });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleAddSavedAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddAccountError('');
    setAddAccountLoading(true);

    if (!addAccountUsername || !addAccountPassword) {
      setAddAccountError('Please enter both username/email and password.');
      setAddAccountLoading(false);
      return;
    }

    try {
      const q = query(collection(db, 'profiles'), where('username', '==', addAccountUsername.toLowerCase()));
      const querySnapshot = await getDocs(q);
      
      let profileDoc = null;
      let profileData = null;

      if (!querySnapshot.empty) {
        profileDoc = querySnapshot.docs[0];
        profileData = profileDoc.data();
      } else {
        const qEmail = query(collection(db, 'profiles'), where('email', '==', addAccountUsername.toLowerCase()));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          profileDoc = snapEmail.docs[0];
          profileData = profileDoc.data();
        }
      }

      if (!profileDoc || !profileData) {
        setAddAccountError('User not found.');
        setAddAccountLoading(false);
        return;
      }

      if (profileData.password !== addAccountPassword) {
        setAddAccountError('Invalid password.');
        setAddAccountLoading(false);
        return;
      }

      const targetEmail = profileData.email || `${profileData.username}@nextmedia.app`;
      const newAcc = {
        id: profileDoc.id,
        username: profileData.username,
        display_name: profileData.display_name,
        email: targetEmail,
        password: addAccountPassword,
        avatar_url: profileData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData.username}`
      };

      const updatedList = [...savedAccounts];
      const idx = updatedList.findIndex((a: any) => a.id === newAcc.id);
      if (idx > -1) {
        updatedList[idx] = { ...updatedList[idx], ...newAcc };
      } else {
        updatedList.push(newAcc);
      }
      setSavedAccounts(updatedList);
      localStorage.setItem('next_saved_accounts', JSON.stringify(updatedList));

      await signOut(auth);
      const result = await signInWithEmailAndPassword(auth, targetEmail, addAccountPassword);
      
      queryClient.clear();
      try {
        const idb = await import('idb-keyval');
        await idb.clear();
      } catch (e) {
        console.error(e);
      }
      
      const freshUser = { id: profileDoc.id, ...profileData };

      // Preserve system settings
      const savedTheme = localStorage.getItem('next_media_theme');
      const savedDesktop = localStorage.getItem('next_media_desktop');
      const savedNexto = localStorage.getItem('next_media_nexto');
      const savedKeyboard = localStorage.getItem('saved_keyboard_height');

      // Wipe local storage clean
      localStorage.clear();
      sessionStorage.clear();

      // Restore preserved keys
      localStorage.setItem('next_saved_accounts', JSON.stringify(updatedList));
      if (savedTheme) localStorage.setItem('next_media_theme', savedTheme);
      if (savedDesktop) localStorage.setItem('next_media_desktop', savedDesktop);
      if (savedNexto) localStorage.setItem('next_media_nexto', savedNexto);
      if (savedKeyboard) localStorage.setItem('saved_keyboard_height', savedKeyboard);
      
      localStorage.setItem('next_media_user', JSON.stringify(freshUser));
      setCurrentUser(freshUser as any);

      toast.success(`Account @${profileData.username} added and activated!`);
      setShowAddAccountModal(false);
      setAddAccountUsername('');
      setAddAccountPassword('');

      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch (err: any) {
      console.error(err);
      setAddAccountError(err.message || 'Verification or sign-in failed.');
    } finally {
      setAddAccountLoading(false);
    }
  };

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const handleSave = async () => {
    if (!editingField || !currentUser) return;
    setIsSaving(true);

    try {
      if (editingField === 'password') {
        const user = auth.currentUser;
        if (!user) throw new Error('Not logged in');
        await updatePassword(user, editValue);
        toast.success('Password updated successfully!');
      } else {
        const normalizedValue = editingField === 'username' ? editValue.trim().toLowerCase() : editValue.trim();
        if (!normalizedValue) {
          throw new Error(`${editingField} cannot be empty.`);
        }

        if (editingField === 'username' && normalizedValue !== (currentUser.username || '').toLowerCase()) {
          if (!/^[a-zA-Z0-9._]{3,30}$/.test(normalizedValue)) {
            throw new Error('Username must be 3-30 characters (letters, numbers, . or _).');
          }
          const taken = await isUsernameTaken(normalizedValue);
          if (taken) {
            throw new Error('This username is already taken.');
          }
        }

        const updates = { [editingField]: normalizedValue };
        await updateDoc(doc(db, 'profiles', currentUser.id), updates);

        const updatedData = { ...currentUser, ...updates };
        await syncProfileToSupabase(updatedData);
        await cacheUserInDexie(updatedData);

        setProfile((prev: any) => ({ ...prev, ...updates }));
        setCurrentUser(updatedData);
        toast.success('Profile updated!');
      }
    } catch (error: any) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setIsSaving(false);
      setEditingField(null);
    }
  };

  const renderAction = (field: string, currentValue: string, isPassword = false) => {
    if (editingField === field) {
      return (
        <div className="flex items-center gap-2">
          <input 
            type={isPassword ? "password" : "text"} 
            value={editValue} 
            onChange={e => setEditValue(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm dark:bg-gray-800 dark:text-white"
            autoFocus
          />
          <button onClick={handleSave} disabled={isSaving} className="text-blue-500 hover:text-blue-600 font-bold text-sm">
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={() => setEditingField(null)} className="text-gray-500 hover:text-gray-600 font-bold text-sm">
            Cancel
          </button>
        </div>
      );
    }
    return (
      <button onClick={() => handleEdit(field, isPassword ? '' : currentValue)} className="text-blue-500 hover:text-blue-600 font-bold text-sm">
        Edit
      </button>
    );
  };

  const settingsTabs = [
    { id: 'display', icon: <Monitor size={20} />, label: 'Display & Accessibility', keywords: ['dark mode', 'light mode', 'font', 'size', 'nexto', 'robot'] },
    { id: 'privacy', icon: <Shield size={20} />, label: 'Privacy & Safety', keywords: ['blocked', 'privacy', 'security', 'visibility'] },
    { id: 'notifications', icon: <Bell size={20} />, label: 'Notifications', keywords: ['alerts', 'push', 'messages', 'mentions'] },
    { id: 'account', icon: <User size={20} />, label: 'Account Center', keywords: ['password', 'security', 'logout'] },
    { id: 'legal', icon: <FileText size={20} />, label: 'Legal & Support', keywords: ['privacy policy', 'terms', 'conditions', 'contact us', 'help'] },
    { id: 'saved', icon: <Download size={20} />, label: 'Saved Content', keywords: ['saved', 'bookmarks', 'favorites', 'offline'] },
  ];

  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return settingsTabs;
    const query = searchQuery.toLowerCase();
    return settingsTabs.filter(tab => 
      tab.label.toLowerCase().includes(query) || 
      tab.keywords.some(kw => kw.includes(query))
    );
  }, [searchQuery]);

  const nextoRobotSvg = (
    <svg viewBox="0 0 1024 1024" width="40" height="40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bodyG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5ee0fd"/>
          <stop offset="100%" stopColor="#258be7"/>
        </linearGradient>
      </defs>
      <ellipse cx="512" cy="320" rx="220" ry="200" fill="url(#bodyG)"/>
      <ellipse cx="440" cy="260" rx="35" ry="35" fill="#000"/>
      <ellipse cx="585" cy="260" rx="35" ry="35" fill="#000"/>
      <path d="M450,330 Q512,380 575,330" fill="#d21c2c"/>
      <ellipse cx="512" cy="600" rx="230" ry="280" fill="url(#bodyG)"/>
    </svg>
  );

  useEffect(() => {
    if (searchQuery && filteredTabs.length > 0 && !filteredTabs.find(t => t.id === activeTab)) {
      setActiveTab(filteredTabs[0].id);
    }
  }, [searchQuery, filteredTabs, activeTab]);

  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  return (
    <div className="max-w-[1200px] mx-auto bg-white dark:bg-black rounded-2xl shadow-sm flex flex-col md:flex-row h-[calc(100vh-80px)] overflow-hidden border border-gray-200 dark:border-gray-800 transition-colors">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/50 flex flex-col">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-black">
          <h1 className="text-2xl font-black mb-4 text-gray-900 dark:text-white">Settings</h1>
          <div className="bg-[#f0f2f5] dark:bg-gray-900 rounded-xl flex items-center px-3 py-2 border border-transparent focus-within:border-blue-300 transition-all">
            <Search size={18} className="text-gray-400" />
            <input 
              type="text" 
              placeholder="Search settings..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none ml-2 text-sm w-full font-bold text-gray-700 dark:text-gray-200 placeholder-gray-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1 scrollbar-hide">
          {filteredTabs.length === 0 ? (
            <div className="text-center p-4 text-gray-500 font-bold text-sm">No settings found for "{searchQuery}"</div>
          ) : (
            filteredTabs.map(tab => (
              <button 
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSubView(null);
                }}
                className={`flex items-center justify-between p-3 rounded-xl font-bold transition-all ${activeTab === tab.id ? 'bg-[#e7f3ff] dark:bg-gray-800 text-[#1A2933] dark:text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200/50 dark:hover:bg-gray-900'}`}
              >
                <div className="flex items-center gap-3">
                  {tab.icon}
                  {tab.label}
                </div>
                {activeTab === tab.id && <ChevronRight size={16} />}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-black relative scrollbar-hide">
        <div className="max-w-3xl mx-auto p-4 md:p-8 pb-20">
          
          {/* Display Settings */}
          {activeTab === 'display' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Display & Accessibility</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">Customize how the app looks and feels.</p>

              <Section title="Appearance">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="font-bold text-gray-900 dark:text-white mb-3">Text Size</p>
                  <div className="grid grid-cols-3 gap-3">
                    {(['normal', 'large', 'extra-large'] as const).map(size => (
                      <button 
                        key={size}
                        onClick={() => setTextSize(size)}
                        className={`p-3 border-2 rounded-xl font-bold transition-colors ${textSize === size ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'}`}
                      >
                        {size.charAt(0).toUpperCase() + size.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="font-bold text-gray-900 dark:text-white mb-3">Theme</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => darkMode && toggleDarkMode()}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl font-bold transition-colors ${!darkMode ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'}`}
                    >
                      <Sun size={24} /> 
                      <span>Light Mode</span>
                    </button>
                    <button 
                      onClick={() => !darkMode && toggleDarkMode()}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl font-bold transition-colors ${darkMode ? 'border-blue-500 bg-gray-800 text-white' : 'border-gray-200 bg-white text-gray-600'}`}
                    >
                      <Moon size={24} /> 
                      <span>Dark Mode</span>
                    </button>
                  </div>
                </div>
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="font-bold text-gray-900 dark:text-white mb-3">Viewport Mode</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => desktopMode && toggleDesktopMode()}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl font-bold transition-colors ${!desktopMode ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'}`}
                    >
                      <Smartphone size={24} /> 
                      <span>Mobile Mode</span>
                    </button>
                    <button 
                      onClick={() => !desktopMode && toggleDesktopMode()}
                      className={`flex flex-col items-center gap-2 p-4 border-2 rounded-xl font-bold transition-colors ${desktopMode ? 'border-blue-500 bg-gray-800 text-white' : 'border-gray-200 bg-white text-gray-600'}`}
                    >
                      <Monitor size={24} /> 
                      <span>Desktop Mode</span>
                    </button>
                  </div>
                </div>
                <Row 
                  icon={nextoRobotSvg} 
                  title="Nexto" 
                  description="Enable the floating robot assistant overlay." 
                  action={<Toggle checked={nextoEnabled} onChange={toggleNexto} />} 
                  border={nextoEnabled}
                />
                {nextoEnabled && (
                  <div className="p-4 bg-gray-50/50 dark:bg-gray-900/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-gray-900 dark:text-white text-sm">Robot Size</p>
                      <span className="text-xs font-black text-blue-500 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-full">{robotSize}px</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => setRobotSize(Math.max(40, robotSize - 5))}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
                      >
                        <Minimize2 size={18} />
                      </button>
                      <input 
                        type="range" 
                        min="40" 
                        max="150" 
                        value={robotSize} 
                        onChange={(e) => setRobotSize(parseInt(e.target.value, 10))}
                        className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <button 
                        onClick={() => setRobotSize(Math.min(150, robotSize + 5))}
                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors"
                      >
                        <Maximize2 size={18} />
                      </button>
                    </div>
                  </div>
                )}
              </Section>
              
              <Section title="Appearance & Experience">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="font-bold text-gray-900 dark:text-white mb-3">Bottom Bar Size</p>
                  <div className="flex gap-3">
                    {['small', 'medium', 'large'].map((size) => (
                      <button 
                        key={size}
                        onClick={() => setBottomBarSize(size as any)}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold capitalize transition-colors ${bottomBarSize === size ? 'bg-[#1877F2] text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="font-bold text-gray-900 dark:text-white mb-3">Brand / Icon Color</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {['#1877F2', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'].map((c) => (
                      <button 
                        key={c}
                        onClick={() => setIconColor(c)}
                        className={`w-10 h-10 rounded-full flex-shrink-0 transition-transform ${iconColor === c ? 'scale-110 ring-2 ring-offset-2 ring-offset-white dark:ring-offset-black' : 'opacity-80 hover:scale-105'}`}
                        style={{ backgroundColor: c, borderColor: c }}
                      />
                    ))}
                  </div>
                </div>
                
                <Row icon={<FileText size={20}/>} title="High Contrast Mode" description="Increase contrast for better readability." action={<Toggle checked={highContrastMode} onChange={() => setHighContrastMode(!highContrastMode)} />} border={true} />
                <Row icon={<Type size={20}/>} title="Animations" description="Enable fluid motion and transitions." action={<Toggle checked={animationsEnabled} onChange={() => setAnimationsEnabled(!animationsEnabled)} />} border={true} />
                <Row icon={<RefreshCw size={20}/>} title="Haptic Feedback" description="Vibrate on certain actions." action={<Toggle checked={hapticFeedback} onChange={() => setHapticFeedback(!hapticFeedback)} />} border={false} />
              </Section>
              
              <Section title="Media, Feed & App">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                      <Monitor size={18} className="text-blue-500" />
                      Fast Work Mode
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Install Next onto your device for lightning-fast loads. You will be able to launch it as a standalone app, and content will be cached efficiently to save data.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      const promptEvent = (window as any).deferredInstallPrompt;
                      if (promptEvent) {
                        promptEvent.prompt();
                        promptEvent.userChoice.then((choiceResult: any) => {
                          if (choiceResult.outcome === 'accepted') {
                            toast.success('App installation started!');
                          }
                          (window as any).deferredInstallPrompt = null;
                        });
                      } else {
                        toast.error('App is already installed or your browser does not support it.');
                      }
                    }}
                    className="shrink-0 ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors text-sm"
                  >
                    Install UI
                  </button>
                </div>
                <Row icon={<Camera size={20}/>} title="Autoplay Videos" description="Automatically play videos on cellular/Wi-Fi." action={<Toggle checked={autoplayVideos} onChange={() => setAutoplayVideos(!autoplayVideos)} />} border={true} />
                <Row icon={<FileText size={20}/>} title="Show All Shared Videos in Reels" description="Include YouTube and Facebook videos in the Reels feed." action={<Toggle checked={showAllReels} onChange={() => setShowAllReels(!showAllReels)} />} border={true} />
                <Row icon={<MessageSquare size={20}/>} title="Compact Feed" description="Show more posts on screen at a time." action={<Toggle checked={compactFeed} onChange={() => setCompactFeed(!compactFeed)} />} border={true} />
                <Row icon={<Download size={20}/>} title="Data Saver Mode" description="Load lower quality media." action={<Toggle checked={saveDataMode} onChange={() => setSaveDataMode(!saveDataMode)} />} border={true} />
                <Row icon={<BellRing size={20}/>} title="In-App Sounds" description="Play sounds when liking or messaging." action={<Toggle checked={soundEffects} onChange={() => setSoundEffects(!soundEffects)} />} border={false} />
              </Section>
            </div>
          )}

          {/* Privacy & Safety Settings */}
          {activeTab === 'privacy' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Privacy & Safety</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">Manage your privacy and blocked accounts.</p>

              <BlockedUsersSection />
            </div>
          )}
          {activeTab === 'notifications' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Notifications</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">Control how you receive alerts and updates.</p>

              <Section title="Push Notifications">
                <div className="p-6 flex flex-col items-center text-center">
                  <div className={`p-4 rounded-full mb-4 ${notificationPermission === 'granted' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                    <BellRing size={48} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">
                    {notificationPermission === 'granted' ? 'Notifications Enabled' : 'Enable Push Notifications'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 max-w-sm">
                    {notificationPermission === 'granted' 
                      ? 'You are all set! You will receive alerts for new messages and mentions even when the app is in the background.'
                      : 'Stay updated with real-time alerts for messages and mentions. Click the button below to grant permission.'}
                  </p>
                  
                  {notificationPermission !== 'granted' && (
                    <button 
                      onClick={async () => {
                        const granted = await requestNotificationPermission();
                        if (granted) {
                          toast('Notifications Enabled!', { description: 'You will now receive alerts from Next.' });
                          if ('Notification' in window) setNotificationPermission(Notification.permission);
                        } else {
                          alert('Notification permission was denied. Please enable it in your browser settings.');
                        }
                      }}
                      className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/25"
                    >
                      Grant Permission
                    </button>
                  )}

                  {notificationPermission === 'granted' && (
                    <button 
                      onClick={() => toast('Test Notification', { description: 'This is a test to verify notifications are working.' })}
                      className="px-8 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-white font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                    >
                      Send Test Notification
                    </button>
                  )}
                </div>
              </Section>

              <Section title="Notification Preferences">
                <Row title="Message Alerts" description="Receive notifications for new private messages" action={<Toggle checked={true} onChange={() => {}} />} />
                <Row title="Mentions" description="Get notified when someone mentions you in a post" action={<Toggle checked={true} onChange={() => {}} />} border={false} />
              </Section>
            </div>
          )}

          {/* Account Settings */}
          {activeTab === 'account' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Account Center</h2>
              <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">Manage your account details.</p>
              
              <Section title="Profile Information">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <ProfileAvatar userId={currentUser?.id || ''} defaultAvatar={profile?.avatar_url || currentUser?.avatar_url || undefined} name={profile?.display_name || currentUser?.display_name || 'User'} className="w-16 h-16 rounded-full object-cover border-2 border-gray-100 dark:border-gray-800 shadow-sm" />
                      <button 
                        onClick={() => avatarInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 bg-[#1877F2] text-white p-1.5 rounded-full border-2 border-white dark:border-gray-800 shadow-md hover:bg-blue-600 transition-colors"
                      >
                        <Camera size={14} />
                      </button>
                      <input 
                        type="file" 
                        ref={avatarInputRef} 
                        hidden 
                        accept="image/*" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          const inputEl = e.target;
                          if (file && currentUser) {
                            // Ultra-strict AI Content Scanning for Profile Photo
                            const isSafe = await scanFile(file, inputEl);
                            if (!isSafe) return;

                            addUpload(file, 'profile', {
                              userId: currentUser.id,
                              payload: { avatar_url: '' },
                              onSuccess: async () => {
                                const fresh = await fetchProfileSmart(currentUser.id);
                                if (fresh) {
                                  await syncProfileToSupabase(fresh);
                                  await cacheUserInDexie(fresh);
                                  setProfile(fresh);
                                  setCurrentUser(fresh as any);
                                  toast.success('Profile photo updated!');
                                }
                              }
                            });
                          }
                        }} 
                      />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-gray-100">Profile Photo</p>
                      <p className="text-xs text-gray-500 font-medium mt-0.5">Change your public profile picture</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => avatarInputRef.current?.click()} 
                    className="text-blue-500 hover:text-blue-600 font-bold text-sm"
                  >
                    Change
                  </button>
                </div>
                <Row icon={<User size={20}/>} title="Display Name" description={profile?.display_name || currentUser?.display_name} action={renderAction('display_name', profile?.display_name || currentUser?.display_name || '')} />
                <Row icon={<Smartphone size={20}/>} title="Username" description={`@${profile?.username || currentUser?.username}`} action={renderAction('username', profile?.username || currentUser?.username || '')} border={false} />
              </Section>

              <Section title="Security">
                <Row icon={<Lock size={20}/>} title="Password" description="Change your password" action={renderAction('password', '', true)} border={false} />
              </Section>

              <Section title="Saved Accounts">
                <div className="p-4 flex flex-col gap-3">
                  {savedAccounts.map((acc: any) => {
                    const isActive = acc.id === currentUser?.id;
                    return (
                      <div key={acc.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800 transition-all hover:bg-gray-100 dark:hover:bg-gray-800">
                        <div className="flex items-center gap-3">
                          <ProfileAvatar userId={acc.id} defaultAvatar={acc.avatar_url || undefined} name={acc.display_name || acc.username || 'User'} className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700" />
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5 text-sm">
                              {acc.display_name}
                              {isActive && <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" title="Active" />}
                            </p>
                            <p className="text-xs text-gray-500">@{acc.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!isActive ? (
                            <button
                              disabled={isSwitching}
                              onClick={() => handleSwitchAccount(acc)}
                              className="px-3 py-1.5 bg-[#1877F2] text-white hover:bg-blue-600 disabled:opacity-50 font-bold text-xs rounded-lg transition-all"
                            >
                              Switch
                            </button>
                          ) : (
                            <span className="text-xs text-green-500 font-bold px-2 py-1 bg-green-500/10 rounded-lg">Active</span>
                          )}
                          <button
                            onClick={() => {
                              if (confirm(`Remove @${acc.username} from saved accounts?`)) {
                                const updated = savedAccounts.filter((a: any) => a.id !== acc.id);
                                setSavedAccounts(updated);
                                localStorage.setItem('next_saved_accounts', JSON.stringify(updated));
                                toast.success('Account removed.');
                              }
                            }}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  
                  <button
                    onClick={() => setShowAddAccountModal(true)}
                    className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-[#1877F2] dark:hover:border-[#1877F2] text-gray-500 hover:text-[#1877F2] dark:text-gray-400 dark:hover:text-[#1877F2] font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all mt-2"
                  >
                    <Users size={16} />
                    <span>Add New Account</span>
                  </button>
                </div>
              </Section>
            </div>
          )}

          {showAddAccountModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-150 dark:border-gray-800 animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black text-gray-900 dark:text-white">Add Next Account</h3>
                  <button onClick={() => setShowAddAccountModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    <Minimize2 size={20} />
                  </button>
                </div>
                
                <form onSubmit={handleAddSavedAccount} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Username or Email</label>
                    <div className="relative">
                      <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="text" 
                        value={addAccountUsername}
                        onChange={(e) => setAddAccountUsername(e.target.value)}
                        placeholder="e.g. johndoe"
                        className="w-full p-3 pl-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-[#1877F2] dark:text-white transition-all font-bold"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Password</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input 
                        type="password" 
                        value={addAccountPassword}
                        onChange={(e) => setAddAccountPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full p-3 pl-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-[#1877F2] dark:text-white transition-all font-bold"
                      />
                    </div>
                  </div>
                  
                  {addAccountError && (
                    <p className="text-xs text-red-500 font-bold bg-red-500/10 p-3 rounded-lg border border-red-500/20">{addAccountError}</p>
                  )}
                  
                  <div className="flex gap-3 mt-4">
                    <button 
                      type="button" 
                      onClick={() => setShowAddAccountModal(false)}
                      className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm hover:bg-gray-200 dark:hover:bg-gray-750 transition-all"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      disabled={addAccountLoading}
                      className="flex-1 py-3 bg-[#1877F2] text-white font-bold rounded-xl text-sm hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {addAccountLoading && <RefreshCw size={16} className="animate-spin" />}
                      {addAccountLoading ? 'Verifying...' : 'Add & Switch'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Legal & Support Settings */}
          {activeTab === 'legal' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              {subView === 'child-safety' ? (
                <div className="space-y-6">
                  {/* Top Back Button */}
                  <button 
                    onClick={() => setSubView(null)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-sm transition-colors mb-2"
                  >
                    <ArrowLeft size={16} /> Back to Legal Settings
                  </button>

                  <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl border border-gray-200 dark:border-gray-800 p-6 md:p-8 space-y-6">
                    {/* Header Section */}
                    <div className="flex flex-col items-center text-center space-y-3 pb-6 border-b border-gray-200 dark:border-gray-800">
                      <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                        <Shield className="w-7 h-7 text-red-600 dark:text-red-500" />
                      </div>
                      <h2 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">Child Safety Standards & Anti-CSAE Policy</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Last Updated: August 24, 2026</p>
                    </div>

                    {/* Introduction */}
                    <section className="space-y-3">
                      <p className="text-sm md:text-base leading-relaxed text-gray-700 dark:text-gray-300">
                        At Next, we are deeply committed to ensuring a safe, secure, and positive environment for all our users. 
                        The safety of minors is our highest priority, and we strictly enforce policies to protect children from 
                        all forms of exploitation and abuse.
                      </p>
                    </section>

                    {/* Zero Tolerance Statement */}
                    <section className="bg-red-50 dark:bg-red-950/20 border-l-4 border-red-500 p-4 rounded-r-lg space-y-2">
                      <h3 className="text-lg font-bold flex items-center gap-2 text-red-700 dark:text-red-400">
                        <AlertTriangle className="w-5 h-5" />
                        Zero Tolerance for CSAM & CSAE
                      </h3>
                      <p className="text-xs md:text-sm text-red-900 dark:text-red-200 leading-relaxed">
                        We have a <strong>STRICT ZERO TOLERANCE POLICY</strong> regarding Child Sexual Abuse Material (CSAM) 
                        and Child Sexual Abuse and Exploitation (CSAE). Any user found generating, uploading, sharing, or 
                        soliciting such content will face immediate, permanent account termination without appeal.
                      </p>
                    </section>

                    {/* Content Moderation & Community Guidelines */}
                    <section className="space-y-3">
                      <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                        <FileText className="w-5 h-5 text-[#1877F2]" />
                        Moderation & Community Guidelines
                      </h3>
                      <ul className="list-disc pl-5 space-y-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        <li><strong>Automated & Manual Review:</strong> We employ a combination of automated scanning technologies and human moderation to identify and remove policy-violating content.</li>
                        <li><strong>Prohibited Content:</strong> Users are strictly forbidden from posting content that depicts, encourages, or normalizes the abuse, grooming, or exploitation of minors.</li>
                        <li><strong>Age Restrictions:</strong> Our platform requires users to be of appropriate legal age as defined by regional laws to create an account.</li>
                        <li><strong>Privacy Enforcement:</strong> Sharing personally identifiable information (PII) of minors is strictly prohibited and will be swiftly removed.</li>
                      </ul>
                    </section>

                    {/* Reporting Unlawful Content */}
                    <section className="bg-gray-50 dark:bg-[#272729] p-5 rounded-xl space-y-3 border border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                        <AlertCircle className="w-5 h-5 text-yellow-500" />
                        How to Report Policy Violations
                      </h3>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        If you encounter any content or behavior that violates this policy, it is imperative that you report it immediately. 
                        We prioritize reports related to child safety above all other inquiries.
                      </p>
                      <div className="bg-white dark:bg-black p-3.5 rounded-lg border border-gray-200 dark:border-gray-800">
                        <p className="font-semibold text-sm mb-1.5 text-gray-900 dark:text-white">To report a violation:</p>
                        <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <li>Use the in-app reporting tools available on every post, profile, and message.</li>
                          <li>Select the "Child Safety / CSAM" or equivalent high-priority option.</li>
                          <li>Alternatively, email our dedicated trust and safety team directly.</li>
                        </ol>
                      </div>
                    </section>

                    {/* Compliance Declaration & Contact Info */}
                    <section className="space-y-3 border-t border-gray-200 dark:border-gray-800 pt-5">
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Compliance & Law Enforcement Declaration</h3>
                      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        We actively comply with all applicable local, national, and international laws regarding child safety. 
                        When CSAM or suspected CSAE is identified on our platform, we will preserve the evidence and 
                        report the offending users to the relevant regional authorities and organizations (such as NCMEC) as required by law.
                      </p>
                      
                      <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1 text-sm">Official Contact for Safety Inquiries:</h4>
                        <p className="text-blue-800 dark:text-blue-200 font-bold text-sm">
                          <a href="mailto:abdullahalmamun.next@gmail.com" className="hover:underline">abdullahalmamun.next@gmail.com</a>
                        </p>
                      </div>
                    </section>
                    
                    {/* Bottom Back Button */}
                    <div className="flex justify-center pt-4">
                      <button 
                        onClick={() => setSubView(null)}
                        className="px-6 py-2.5 bg-[#1877F2] hover:bg-[#166fe5] text-white font-bold rounded-xl transition-colors shadow-sm text-sm"
                      >
                        Back to Settings
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-3xl font-black mb-2 text-gray-900 dark:text-white">Legal & Support</h2>
                  <p className="text-gray-500 dark:text-gray-400 font-medium mb-8">View policies and contact us.</p>
                  
                  <Section title="Legal">
                    <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg">Privacy Policy</h3>
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        <p className="mb-2">Your privacy is critically important to us.</p>
                        <p className="mb-2">We collect the minimum possible data necessary to run our platform. We securely store your email, username, and profile data in our databases.</p>
                        <p>We do not share your personal information with third parties without your explicit consent.</p>
                      </div>
                    </div>
                    <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                      <h3 className="font-bold text-gray-900 dark:text-white text-lg">Terms & Conditions</h3>
                      <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                        <p className="mb-2">By using Next, you agree to our terms of service.</p>
                        <p className="mb-2">You are responsible for the content you post and agree not to engage in harassing, bullying, or illegal activities.</p>
                        <p>We reserve the right to ban or restrict users who violate these terms.</p>
                      </div>
                    </div>
                  
                    <div className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" onClick={() => setSubView('child-safety')}>
                      <div>
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg flex items-center gap-2"><Shield className="w-5 h-5 text-red-500" /> Child Safety Policy</h3>
                        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Read our Zero Tolerance policy on CSAE.</p>
                      </div>
                      <ChevronRight size={20} className="text-gray-400" />
                    </div>
                  </Section>

                  <Section title="Contact Us">
                    <div className="p-6">
                      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">If you have any questions or need help, please contact us using the information below:</p>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-500">
                            <User size={20} />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Name</p>
                            <p className="font-bold text-gray-900 dark:text-white">Abdullah Al Mamun</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center text-green-500">
                            <Smartphone size={20} />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Phone</p>
                            <a href="tel:+8801307072293" className="font-bold text-gray-900 dark:text-white hover:text-green-500">+8801307072293</a>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-red-50 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-500">
                            <MessageSquare size={20} />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Email</p>
                            <a href="mailto:abdullahalmamun.next@gmail.com" className="font-bold text-gray-900 dark:text-white hover:text-red-500">abdullahalmamun.next@gmail.com</a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Section>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Settings;

