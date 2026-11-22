import { localDB } from '@/lib/dexie';
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { requestNotificationPermission, showNotification } from '@/services/notificationService';
import { toast } from 'sonner';
import {
  User, Lock, Bell, Shield, Search, ChevronRight,
  Monitor, Smartphone, UserX, MessageSquare, Minimize2, Maximize2,
  Moon, Sun, Type, Download, AlertTriangle, FileText, RefreshCw,
  Trash2, Users, BellRing, Camera, ArrowLeft, AlertCircle, X,
  LogOut, ExternalLink
} from 'lucide-react';
import { useAuth, useTheme } from '@/contexts/AuthContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUpload } from '@/contexts/UploadContext';

import { db, auth } from '../lib/firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import {
  syncProfileToSupabase,
  fetchProfileSmart,
  fetchProfilesBatchSmart,
  isUsernameTaken,
  cacheUserInDexie,
  migrateUserFriendshipsOnce,
  fetchUserFriendshipsSmart,
  deleteFriendshipSmart
} from '@/lib/profileSync';
import { updatePassword, signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useContentFilter } from '@/hooks/useContentFilter';
import ConfirmDialog from '@/components/ConfirmDialog';

// Reusable Toggle Component (accessible contrast in light and dark modes)
const Toggle: React.FC<{ checked: boolean; onChange: () => void; label?: string }> = ({
  checked,
  onChange,
  label
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    className={`w-12 h-7 rounded-full transition-colors relative flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
      checked ? 'bg-[#1A2933] dark:bg-[#1877F2]' : 'bg-gray-300 dark:bg-gray-700'
    }`}
  >
    <div
      className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform shadow-sm ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

// Reusable Section Component
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mb-6 w-full min-w-0">
    <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white mb-2.5 px-0.5">
      {title}
    </h3>
    <div className="w-full min-w-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-sm transition-colors">
      {children}
    </div>
  </div>
);

// Reusable Row Component — safe for narrow mobile viewports (never overflows horizontally)
const Row: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action: React.ReactNode;
  border?: boolean;
  stacked?: boolean;
}> = ({ icon, title, description, action, border = true, stacked = false }) => (
  <div
    className={`w-full min-w-0 p-3.5 sm:p-4 hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition-colors flex ${
      stacked ? 'flex-col sm:flex-row sm:items-center sm:justify-between gap-3' : 'items-center justify-between gap-3'
    } ${border ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}
  >
    <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
      {icon && (
        <div className="text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded-xl shrink-0">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-[15px] leading-snug break-words">
          {title}
        </p>
        {description && (
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-snug break-words">
            {description}
          </p>
        )}
      </div>
    </div>
    <div className={`${stacked ? 'w-full sm:w-auto' : 'flex-shrink-0'}`}>{action}</div>
  </div>
);

const BlockedUsersSection: React.FC = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [unblockTarget, setUnblockTarget] = useState<any | null>(null);

  const { data: blockedUsers = [], isLoading } = useQuery({
    queryKey: ['blockedUsers', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      migrateUserFriendshipsOnce(currentUser.id).catch(() => {});

      const { rows } = await fetchUserFriendshipsSmart(currentUser.id);
      const blockedRows = rows.filter(
        (r: any) => r.status === 'blocked' && r.sender_id === currentUser.id
      );
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
    enabled: !!currentUser
  });

  const confirmUnblock = async () => {
    if (!currentUser || !unblockTarget) return;
    const target = unblockTarget;
    setUnblockTarget(null);
    try {
      await deleteFriendshipSmart(target.friendshipId);
      queryClient.invalidateQueries({ queryKey: ['blockedUsers'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['blockStatus'] });
      queryClient.invalidateQueries({ queryKey: ['isBlockedByMe'] });
      toast.success(`Unblocked @${target.username || 'user'}.`);
    } catch {
      toast.error('Failed to unblock user.');
    }
  };

  return (
    <>
      <Section title="Blocked Accounts">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw size={24} className="animate-spin mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-500 font-bold">Loading blocked users...</p>
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="p-8 text-center">
            <div className="bg-gray-100 dark:bg-gray-800 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
              <UserX size={28} className="text-gray-400" />
            </div>
            <p className="text-gray-900 dark:text-white font-bold">No blocked users</p>
            <p className="text-sm text-gray-500 mt-1">Users you block will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {blockedUsers.map((user: any) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 p-3.5 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <ProfileAvatar
                    userId={user.id}
                    defaultAvatar={user.avatar_url || undefined}
                    name={user.display_name || user.username || 'User'}
                    className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900 dark:text-white flex items-center gap-1 truncate text-sm">
                      <span className="truncate">{user.display_name}</span>
                      {user.is_verified && <VerifiedBadge size={14} />}
                    </p>
                    <p className="text-xs text-gray-500 font-medium truncate">@{user.username}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUnblockTarget(user)}
                  className="shrink-0 min-h-[38px] px-3.5 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-700 dark:text-gray-300 hover:text-red-500 dark:hover:text-red-400 font-bold text-xs sm:text-sm rounded-xl transition-all"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <ConfirmDialog
        isOpen={Boolean(unblockTarget)}
        title="Unblock Account"
        message={`Allow ${unblockTarget?.display_name || 'this user'} to interact with you again?`}
        confirmText="Unblock"
        isDestructive={true}
        onCancel={() => setUnblockTarget(null)}
        onConfirm={confirmUnblock}
      />
    </>
  );
};

const SavedContentList: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSaved = async () => {
      try {
        const saved = await localDB.saved_content.orderBy('saved_at').reverse().toArray();
        setItems(saved);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSaved();
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-center">
        <RefreshCw size={24} className="animate-spin mx-auto text-gray-400 mb-2" />
        <p className="text-sm text-gray-500 font-bold">Loading saved content...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Section title="Saved Posts">
        <div className="p-8 text-center">
          <div className="bg-gray-100 dark:bg-gray-800 w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3">
            <Download size={26} className="text-gray-400" />
          </div>
          <p className="text-gray-900 dark:text-white font-bold">No saved content</p>
          <p className="text-sm text-gray-500 mt-1">
            Use &ldquo;Save locally&rdquo; on any post menu to keep it available offline here.
          </p>
        </div>
      </Section>
    );
  }

  return (
    <Section title={`Saved Posts (${items.length})`}>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.map((item) => (
          <div key={item.id} className="p-3.5 sm:p-4 flex gap-3 items-start w-full min-w-0">
            {item.media_url && item.media_type?.includes('image') && (
              <img
                src={item.media_url}
                referrerPolicy="no-referrer"
                className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl shrink-0 bg-gray-100 dark:bg-gray-800"
                alt={item.author_name || 'Saved media'}
              />
            )}
            {item.media_url && item.media_type?.includes('video') && (
              <video
                src={item.media_url}
                className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl shrink-0 bg-black"
              />
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-gray-900 dark:text-white truncate">
                {item.author_name || 'Anonymous'}
              </h4>
              {item.text && (
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2 break-words">
                  {item.text}
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-1.5 tabular-nums">
                {new Date(item.saved_at).toLocaleString()}
              </p>
              <div className="flex items-center gap-3 mt-2.5">
                <Link
                  to={`/post/${item.id}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#1877F2] hover:underline"
                >
                  <ExternalLink size={13} />
                  <span>Open Post</span>
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await localDB.saved_content.delete(item.id);
                    setItems((prev) => prev.filter((p) => p.id !== item.id));
                    toast.success('Removed from saved items');
                  }}
                  className="text-red-500 hover:text-red-600 text-xs font-bold"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
};

const Settings: React.FC = () => {
  const { currentUser, setCurrentUser, logout } = useAuth();
  const {
    darkMode,
    toggleDarkMode,
    desktopMode,
    toggleDesktopMode,
    nextoEnabled,
    toggleNexto,
    robotSize,
    setRobotSize,
    bottomBarSize,
    setBottomBarSize,
    iconColor,
    setIconColor,
    autoplayVideos,
    setAutoplayVideos,
    saveDataMode,
    setSaveDataMode,
    highContrastMode,
    setHighContrastMode,
    hapticFeedback,
    setHapticFeedback,
    animationsEnabled,
    setAnimationsEnabled,
    soundEffects,
    setSoundEffects,
    compactFeed,
    setCompactFeed,
    showAllReels,
    setShowAllReels,
    autoLoginOnReinstall,
    setAutoLoginOnReinstall,
    textSize,
    setTextSize,
    messageAlerts,
    setMessageAlerts,
    mentionAlerts,
    setMentionAlerts
  } = useTheme();

  const { addUpload } = useUpload();
  const { scanFile } = useContentFilter();
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState('display');
  // Mobile uses clean Hub <-> Detail navigation so sidebar and panel never collide or overflow
  const [mobileView, setMobileView] = useState<'menu' | 'detail'>('menu');
  const [subView, setSubView] = useState<'child-safety' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [removeAccountTarget, setRemoveAccountTarget] = useState<any | null>(null);

  useEffect(() => {
    if (currentUser) {
      fetchProfile();
    }
  }, [currentUser?.id]);

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
      const parsed = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      const scrubbed = parsed.map(({ password: _pwd, ...rest }: any) => rest);
      if (parsed.some((a: any) => a && 'password' in a)) {
        localStorage.setItem('next_saved_accounts', JSON.stringify(scrubbed));
      }
      return scrubbed;
    } catch {
      return [];
    }
  });

  const [isSwitching, setIsSwitching] = useState(false);
  const [switchTargetAccount, setSwitchTargetAccount] = useState<any | null>(null);
  const [switchAccountPassword, setSwitchAccountPassword] = useState('');
  const [switchAccountError, setSwitchAccountError] = useState('');
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [addAccountUsername, setAddAccountUsername] = useState('');
  const [addAccountPassword, setAddAccountPassword] = useState('');
  const [addAccountError, setAddAccountError] = useState('');
  const [addAccountLoading, setAddAccountLoading] = useState(false);

  // Keep current user metadata in savedAccounts in sync (never store password)
  useEffect(() => {
    if (currentUser && profile) {
      const currAny = currentUser as any;
      const latestDisplay = profile.display_name || currAny.display_name;
      const latestUsername = profile.username || currAny.username;
      const latestAvatar = profile.avatar_url || currAny.avatar_url || '';

      const existingIdx = savedAccounts.findIndex((a: any) => a.id === currentUser.id);
      if (existingIdx === -1) {
        const newAcc = {
          id: currentUser.id,
          username: latestUsername,
          display_name: latestDisplay,
          email: profile.email || currAny.email || `${latestUsername}@nextmedia.app`,
          avatar_url: latestAvatar
        };
        const updated = [...savedAccounts, newAcc];
        setSavedAccounts(updated);
        localStorage.setItem('next_saved_accounts', JSON.stringify(updated));
      } else {
        const existing = savedAccounts[existingIdx];
        if (
          existing.display_name !== latestDisplay ||
          existing.username !== latestUsername ||
          existing.avatar_url !== latestAvatar
        ) {
          const updated = savedAccounts.map((a: any) =>
            a.id === currentUser.id
              ? { ...a, display_name: latestDisplay, username: latestUsername, avatar_url: latestAvatar }
              : a
          );
          setSavedAccounts(updated);
          localStorage.setItem('next_saved_accounts', JSON.stringify(updated));
        }
      }
    }
  }, [currentUser, profile, savedAccounts]);

  const handleSwitchAccount = (targetAccount: any) => {
    if (!targetAccount?.email) {
      toast.error('Cannot switch: missing account email. Please log in again.');
      return;
    }
    setSwitchAccountError('');
    setSwitchAccountPassword('');
    setSwitchTargetAccount(targetAccount);
  };

  const preservePreferenceKeys = () => ({
    savedTheme: localStorage.getItem('next_media_theme'),
    savedDesktop: localStorage.getItem('next_media_desktop'),
    savedNexto: localStorage.getItem('next_media_nexto'),
    savedKeyboard: localStorage.getItem('saved_keyboard_height'),
    savedAutoLoginReinstall: localStorage.getItem('next_auto_login_reinstall'),
    savedPwaInstalled: localStorage.getItem('next_pwa_installed'),
    savedTextSize: localStorage.getItem('next_media_textsize'),
    savedMsgAlerts: localStorage.getItem('next_media_msg_alerts'),
    savedMentionAlerts: localStorage.getItem('next_media_mention_alerts')
  });

  const restorePreferenceKeys = (p: ReturnType<typeof preservePreferenceKeys>) => {
    if (p.savedTheme) localStorage.setItem('next_media_theme', p.savedTheme);
    if (p.savedDesktop) localStorage.setItem('next_media_desktop', p.savedDesktop);
    if (p.savedNexto) localStorage.setItem('next_media_nexto', p.savedNexto);
    if (p.savedKeyboard) localStorage.setItem('saved_keyboard_height', p.savedKeyboard);
    if (p.savedAutoLoginReinstall !== null)
      localStorage.setItem('next_auto_login_reinstall', p.savedAutoLoginReinstall);
    if (p.savedPwaInstalled !== null) localStorage.setItem('next_pwa_installed', p.savedPwaInstalled);
    if (p.savedTextSize) localStorage.setItem('next_media_textsize', p.savedTextSize);
    if (p.savedMsgAlerts !== null) localStorage.setItem('next_media_msg_alerts', p.savedMsgAlerts);
    if (p.savedMentionAlerts !== null)
      localStorage.setItem('next_media_mention_alerts', p.savedMentionAlerts);
  };

  const confirmSwitchAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!switchTargetAccount?.email || !switchAccountPassword) {
      setSwitchAccountError('Please enter your password.');
      return;
    }

    setIsSwitching(true);
    setSwitchAccountError('');
    const toastId = toast.loading(`Switching to @${switchTargetAccount.username}...`);

    try {
      await signOut(auth);
      const result = await signInWithEmailAndPassword(
        auth,
        switchTargetAccount.email,
        switchAccountPassword
      );

      queryClient.clear();
      try {
        const idb = await import('idb-keyval');
        await idb.clear();
      } catch (err) {
        console.error(err);
      }

      const userDoc = await getDoc(doc(db, 'profiles', result.user.uid));
      if (userDoc.exists()) {
        const { password: _removedPwd, ...profileData } = userDoc.data() as any;
        const freshUser = { id: userDoc.id, ...profileData };

        const updatedAccounts = savedAccounts.map((acc: any) => {
          const { password: _p, ...cleanAcc } = acc;
          if (cleanAcc.id === switchTargetAccount.id) {
            return {
              ...cleanAcc,
              display_name: profileData.display_name,
              avatar_url: profileData.avatar_url || cleanAcc.avatar_url
            };
          }
          return cleanAcc;
        });

        const prefs = preservePreferenceKeys();
        localStorage.clear();
        sessionStorage.clear();

        localStorage.setItem('next_saved_accounts', JSON.stringify(updatedAccounts));
        restorePreferenceKeys(prefs);
        localStorage.setItem('next_media_user', JSON.stringify(freshUser));
        setCurrentUser(freshUser as any);
      }

      setSwitchTargetAccount(null);
      setSwitchAccountPassword('');
      toast.success(`Switched to @${switchTargetAccount.username}!`, { id: toastId });
      setTimeout(() => {
        window.location.href = '/';
      }, 400);
    } catch (err: any) {
      console.error(err);
      toast.dismiss(toastId);
      setSwitchAccountError('Incorrect password or verification failed.');
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
      const cleanInput = addAccountUsername.trim().toLowerCase();
      let profileDoc: any = null;
      let profileData: any = null;

      if (cleanInput.includes('@')) {
        const qEmail = query(collection(db, 'profiles'), where('email', '==', cleanInput));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          profileDoc = snapEmail.docs[0];
          profileData = profileDoc.data();
        }
      } else {
        const q = query(collection(db, 'profiles'), where('username', '==', cleanInput));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          profileDoc = querySnapshot.docs[0];
          profileData = profileDoc.data();
        }
      }

      const targetEmail =
        profileData?.email ||
        (cleanInput.includes('@') ? cleanInput : `${cleanInput}@nextmedia.app`);

      await signOut(auth);
      const result = await signInWithEmailAndPassword(auth, targetEmail, addAccountPassword);

      if (!profileData) {
        const fetchedDoc = await getDoc(doc(db, 'profiles', result.user.uid));
        if (fetchedDoc.exists()) {
          profileDoc = fetchedDoc;
          profileData = fetchedDoc.data();
        }
      }

      const { password: _removedPwd, ...cleanProfile } = profileData || {};
      const resolvedUsername = cleanProfile.username || cleanInput.split('@')[0];
      const newAcc = {
        id: profileDoc?.id || result.user.uid,
        username: resolvedUsername,
        display_name: cleanProfile.display_name || resolvedUsername,
        email: targetEmail,
        avatar_url:
          cleanProfile.avatar_url ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${resolvedUsername}`
      };

      const updatedList = savedAccounts.map(({ password: _p, ...rest }: any) => rest);
      const idx = updatedList.findIndex((a: any) => a.id === newAcc.id);
      if (idx > -1) {
        updatedList[idx] = { ...updatedList[idx], ...newAcc };
      } else {
        updatedList.push(newAcc);
      }
      setSavedAccounts(updatedList);

      queryClient.clear();
      try {
        const idb = await import('idb-keyval');
        await idb.clear();
      } catch (err) {
        console.error(err);
      }

      const freshUser = { id: newAcc.id, ...cleanProfile };
      const prefs = preservePreferenceKeys();

      localStorage.clear();
      sessionStorage.clear();

      localStorage.setItem('next_saved_accounts', JSON.stringify(updatedList));
      restorePreferenceKeys(prefs);
      localStorage.setItem('next_media_user', JSON.stringify(freshUser));
      setCurrentUser(freshUser as any);

      toast.success(`Account @${resolvedUsername} added and activated!`);
      setShowAddAccountModal(false);
      setAddAccountUsername('');
      setAddAccountPassword('');

      setTimeout(() => {
        window.location.href = '/';
      }, 400);
    } catch (err: any) {
      console.error(err);
      setAddAccountError('Invalid username/email or password.');
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
        if (!user) throw new Error('Not logged in with Firebase Auth.');
        if (editValue.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        try {
          await updatePassword(user, editValue);
        } catch (pwErr: any) {
          if (pwErr?.code === 'auth/requires-recent-login') {
            throw new Error('For security, please log out and log back in before updating your password.');
          }
          throw pwErr;
        }
        toast.success('Password updated successfully!');
      } else {
        const normalizedValue =
          editingField === 'username' ? editValue.trim().toLowerCase() : editValue.trim();
        if (!normalizedValue) {
          throw new Error(`${editingField === 'display_name' ? 'Display name' : 'Username'} cannot be empty.`);
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
      setEditingField(null);
    } catch (error: any) {
      toast.error(error?.message || 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const renderAction = (field: string, currentValue: string, isPassword = false) => {
    if (editingField === field) {
      return (
        <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type={isPassword ? 'password' : 'text'}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              } else if (e.key === 'Escape') {
                setEditingField(null);
              }
            }}
            placeholder={isPassword ? 'Min 6 characters' : ''}
            className="w-full sm:w-48 min-w-0 min-h-[40px] border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:border-[#1877F2]"
            autoFocus
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#1877F2] hover:bg-blue-600 text-white font-bold text-xs sm:text-sm disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditingField(null)}
              className="flex-1 sm:flex-initial min-h-[38px] px-3.5 py-1.5 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-xs sm:text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={() => handleEdit(field, isPassword ? '' : currentValue)}
        className="min-h-[36px] px-3 py-1.5 rounded-xl text-[#1877F2] hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold text-sm transition-colors"
      >
        Edit
      </button>
    );
  };

  const settingsTabs = [
    {
      id: 'display',
      icon: <Monitor size={20} />,
      label: 'Display & Accessibility',
      subtitle: 'Theme, text size, feed, Nexto',
      keywords: [
        'dark mode',
        'light mode',
        'theme',
        'font',
        'text size',
        'nexto',
        'robot',
        'viewport',
        'compact',
        'autoplay',
        'data saver',
        'reels',
        'color',
        'haptic',
        'sound',
        'contrast',
        'animations',
        'install'
      ]
    },
    {
      id: 'privacy',
      icon: <Shield size={20} />,
      label: 'Privacy & Safety',
      subtitle: 'Blocked accounts & visibility',
      keywords: ['blocked', 'unblock', 'privacy', 'security', 'visibility']
    },
    {
      id: 'notifications',
      icon: <Bell size={20} />,
      label: 'Notifications',
      subtitle: 'Push alerts, messages, mentions',
      keywords: ['alerts', 'push', 'messages', 'mentions', 'permission', 'sound']
    },
    {
      id: 'account',
      icon: <User size={20} />,
      label: 'Account Center',
      subtitle: 'Photo, name, password, accounts',
      keywords: [
        'password',
        'username',
        'display name',
        'avatar',
        'profile',
        'logout',
        'auto login',
        'reinstall',
        'switch account',
        'session'
      ]
    },
    {
      id: 'saved',
      icon: <Download size={20} />,
      label: 'Saved Content',
      subtitle: 'Offline saved posts & media',
      keywords: ['saved', 'bookmarks', 'favorites', 'offline']
    },
    {
      id: 'legal',
      icon: <FileText size={20} />,
      label: 'Legal & Support',
      subtitle: 'Policies, child safety & contact',
      keywords: ['privacy policy', 'terms', 'conditions', 'contact us', 'help', 'child safety']
    }
  ];

  const filteredTabs = useMemo(() => {
    if (!searchQuery.trim()) return settingsTabs;
    const q = searchQuery.toLowerCase();
    return settingsTabs.filter(
      (tab) =>
        tab.label.toLowerCase().includes(q) ||
        tab.subtitle.toLowerCase().includes(q) ||
        tab.keywords.some((kw) => kw.includes(q))
    );
  }, [searchQuery]);

  const activeTabMeta = settingsTabs.find((t) => t.id === activeTab) || settingsTabs[0];

  useEffect(() => {
    if (searchQuery.trim() && filteredTabs.length > 0 && !filteredTabs.some((t) => t.id === activeTab)) {
      setActiveTab(filteredTabs[0].id);
    }
  }, [searchQuery, filteredTabs, activeTab]);

  const nextoRobotSvg = (
    <svg viewBox="0 0 1024 1024" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="settingsRobotBody" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5ee0fd" />
          <stop offset="100%" stopColor="#258be7" />
        </linearGradient>
      </defs>
      <ellipse cx="512" cy="320" rx="220" ry="200" fill="url(#settingsRobotBody)" />
      <ellipse cx="440" cy="260" rx="35" ry="35" fill="#000" />
      <ellipse cx="585" cy="260" rx="35" ry="35" fill="#000" />
      <path d="M450,330 Q512,380 575,330" fill="#d21c2c" />
      <ellipse cx="512" cy="600" rx="230" ry="280" fill="url(#settingsRobotBody)" />
    </svg>
  );

  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  const openCategory = (tabId: string) => {
    setActiveTab(tabId);
    setSubView(null);
    setEditingField(null);
    setMobileView('detail');
  };

  const handleMobileBack = () => {
    if (activeTab === 'legal' && subView === 'child-safety') {
      setSubView(null);
      return;
    }
    setMobileView('menu');
    setEditingField(null);
  };

  return (
    <div className="w-full max-w-[1120px] mx-auto px-3 sm:px-4 md:px-2 py-2 sm:py-3 overflow-x-hidden">
      <div className="w-full min-w-0 bg-white dark:bg-black rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row overflow-hidden transition-colors">
        {/* Sidebar / Mobile Hub */}
        <aside
          className={`${
            mobileView === 'detail' ? 'hidden md:flex' : 'flex'
          } w-full md:w-72 lg:w-80 md:shrink-0 border-b md:border-b-0 md:border-r border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/60 flex-col min-w-0`}
        >
          <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-black">
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white mb-3">
              Settings
            </h1>

            {/* Search */}
            <div className="bg-[#f0f2f5] dark:bg-gray-900 rounded-xl flex items-center px-3 min-h-[42px] border border-transparent focus-within:border-[#1877F2]/50 transition-all">
              <Search size={17} className="text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none ml-2 text-sm w-full min-w-0 font-medium text-gray-800 dark:text-gray-200 placeholder-gray-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Clear search"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Mobile-only Quick Profile Banner & Instant Controls */}
            <div className="md:hidden mt-3 space-y-2.5">
              {currentUser && (
                <button
                  type="button"
                  onClick={() => openCategory('account')}
                  className="w-full flex items-center justify-between gap-3 p-3 rounded-2xl bg-[#f0f2f5] dark:bg-gray-900 hover:bg-gray-200/70 dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <ProfileAvatar
                      userId={currentUser.id}
                      defaultAvatar={profile?.avatar_url || currentUser.avatar_url || undefined}
                      name={profile?.display_name || currentUser.display_name || 'User'}
                      className="w-11 h-11 rounded-full object-cover border border-white dark:border-gray-700 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1 truncate">
                        <span className="truncate">
                          {profile?.display_name || currentUser.display_name || 'User'}
                        </span>
                        {(profile?.is_verified || currentUser.is_verified) && (
                          <VerifiedBadge size={14} />
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        @{profile?.username || currentUser.username} · Account Center
                      </p>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 shrink-0" />
                </button>
              )}

              {/* Quick 2-tile switcher on Mobile Hub */}
              {!searchQuery.trim() && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={toggleDarkMode}
                    className="flex items-center gap-2.5 p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-left min-h-[52px] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-[#1877F2] flex items-center justify-center shrink-0">
                      {darkMode ? <Moon size={16} /> : <Sun size={16} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Theme</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {darkMode ? 'Dark Mode' : 'Light Mode'}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={toggleDesktopMode}
                    className="flex items-center gap-2.5 p-3 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-left min-h-[52px] transition-colors"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-[#1877F2] flex items-center justify-center shrink-0">
                      {desktopMode ? <Monitor size={16} /> : <Smartphone size={16} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Layout</p>
                      <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                        {desktopMode ? 'Desktop View' : 'Mobile View'}
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Category List */}
          <div className="flex-1 p-3 flex flex-col gap-1">
            {filteredTabs.length === 0 ? (
              <div className="text-center p-6 text-gray-500 font-bold text-sm">
                No settings found for &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              filteredTabs.map((tab) => {
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => openCategory(tab.id)}
                    className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl font-bold transition-all text-left min-h-[54px] ${
                      isSelected
                        ? 'md:bg-[#e7f3ff] md:dark:bg-gray-800 md:text-[#1A2933] md:dark:text-white md:shadow-sm bg-gray-100/80 dark:bg-gray-900 text-gray-900 dark:text-white'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200/50 dark:hover:bg-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-[#1877F2]/10 text-[#1877F2] dark:bg-[#1877F2]/20 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {tab.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{tab.label}</p>
                        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate md:hidden">
                          {tab.subtitle}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  </button>
                );
              })
            )}

            {/* Sign Out trigger at bottom of menu */}
            <div className="pt-3 mt-2 border-t border-gray-200/70 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors min-h-[48px] text-sm"
              >
                <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/30 flex items-center justify-center shrink-0">
                  <LogOut size={18} />
                </div>
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div
          className={`${
            mobileView === 'menu' ? 'hidden md:block' : 'block'
          } flex-1 min-w-0 bg-white dark:bg-black`}
        >
          {/* Sticky Mobile Detail Back Bar */}
          <div className="md:hidden sticky top-0 z-20 bg-white/95 dark:bg-black/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 px-3 py-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleMobileBack}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 transition-colors"
              aria-label="Back to settings menu"
            >
              <ArrowLeft size={20} />
            </button>
            <h2 className="font-black text-base text-gray-900 dark:text-white truncate">
              {activeTab === 'legal' && subView === 'child-safety'
                ? 'Child Safety Policy'
                : activeTabMeta.label}
            </h2>
          </div>

          <div className="max-w-3xl mx-auto p-3.5 sm:p-6 md:p-8 pb-8 min-w-0">
            {/* Display Settings */}
            {activeTab === 'display' && (
              <div className="animate-in fade-in duration-200 min-w-0">
                <div className="hidden md:block mb-6">
                  <h2 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white">
                    Display &amp; Accessibility
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
                    Customize how the app looks and feels.
                  </p>
                </div>

                <Section title="Appearance">
                  <div className="p-3.5 sm:p-4 border-b border-gray-100 dark:border-gray-800">
                    <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-3">
                      Text Size
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {(['normal', 'large', 'extra-large'] as const).map((size) => (
                        <button
                          type="button"
                          key={size}
                          onClick={() => {
                            setTextSize(size);
                            toast.success(`Text size set to ${size.replace('-', ' ')}`);
                          }}
                          className={`min-h-[44px] px-2 py-2.5 border-2 rounded-xl font-bold text-xs sm:text-sm transition-colors truncate ${
                            textSize === size
                              ? 'border-[#1877F2] bg-blue-50 dark:bg-blue-950/40 text-[#1877F2] dark:text-blue-400'
                              : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {size === 'extra-large'
                            ? 'Extra Large'
                            : size.charAt(0).toUpperCase() + size.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 border-b border-gray-100 dark:border-gray-800">
                    <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-3">
                      Theme
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      <button
                        type="button"
                        onClick={() => darkMode && toggleDarkMode()}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3.5 min-h-[76px] border-2 rounded-xl font-bold text-xs sm:text-sm transition-colors ${
                          !darkMode
                            ? 'border-[#1877F2] bg-blue-50 text-[#1877F2]'
                            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <Sun size={22} />
                        <span>Light Mode</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => !darkMode && toggleDarkMode()}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3.5 min-h-[76px] border-2 rounded-xl font-bold text-xs sm:text-sm transition-colors ${
                          darkMode
                            ? 'border-[#1877F2] bg-gray-800 text-white'
                            : 'border-gray-200 bg-white text-gray-600'
                        }`}
                      >
                        <Moon size={22} />
                        <span>Dark Mode</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 border-b border-gray-100 dark:border-gray-800">
                    <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-3">
                      Viewport Mode
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      <button
                        type="button"
                        onClick={() => desktopMode && toggleDesktopMode()}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3.5 min-h-[76px] border-2 rounded-xl font-bold text-xs sm:text-sm transition-colors ${
                          !desktopMode
                            ? 'border-[#1877F2] bg-blue-50 dark:bg-blue-950/40 text-[#1877F2] dark:text-blue-400'
                            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <Smartphone size={22} />
                        <span>Mobile Mode</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => !desktopMode && toggleDesktopMode()}
                        className={`flex flex-col items-center justify-center gap-1.5 p-3.5 min-h-[76px] border-2 rounded-xl font-bold text-xs sm:text-sm transition-colors ${
                          desktopMode
                            ? 'border-[#1877F2] bg-gray-800 text-white'
                            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        <Monitor size={22} />
                        <span>Desktop Mode</span>
                      </button>
                    </div>
                  </div>

                  <Row
                    icon={nextoRobotSvg}
                    title="Nexto"
                    description="Enable the floating robot assistant overlay."
                    action={
                      <Toggle checked={nextoEnabled} onChange={toggleNexto} label="Toggle Nexto" />
                    }
                    border={nextoEnabled}
                  />
                  {nextoEnabled && (
                    <div className="p-3.5 sm:p-4 bg-gray-50/60 dark:bg-gray-950/50">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-gray-900 dark:text-white text-sm">
                          Robot Size
                        </p>
                        <span className="text-xs font-black text-[#1877F2] tabular-nums">
                          {robotSize}px
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setRobotSize(Math.max(40, robotSize - 5))}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors"
                          aria-label="Decrease robot size"
                        >
                          <Minimize2 size={18} />
                        </button>
                        <input
                          type="range"
                          min="40"
                          max="150"
                          value={robotSize}
                          onChange={(e) => setRobotSize(parseInt(e.target.value, 10))}
                          className="flex-1 min-w-0 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#1877F2]"
                        />
                        <button
                          type="button"
                          onClick={() => setRobotSize(Math.min(150, robotSize + 5))}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg text-gray-500 transition-colors"
                          aria-label="Increase robot size"
                        >
                          <Maximize2 size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </Section>

                <Section title="Appearance & Experience">
                  <div className="p-3.5 sm:p-4 border-b border-gray-100 dark:border-gray-800">
                    <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-3">
                      Bottom Bar Size
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {(['small', 'medium', 'large'] as const).map((size) => (
                        <button
                          type="button"
                          key={size}
                          onClick={() => setBottomBarSize(size)}
                          className={`min-h-[42px] py-2 rounded-xl text-xs sm:text-sm font-bold capitalize transition-colors ${
                            bottomBarSize === size
                              ? 'bg-[#1877F2] text-white shadow-sm'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-3.5 sm:p-4 border-b border-gray-100 dark:border-gray-800">
                    <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-3">
                      Brand / Icon Color
                    </p>
                    <div className="flex items-center gap-3 overflow-x-auto py-1 px-0.5 scrollbar-hide">
                      {['#1877F2', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1'].map(
                        (c) => (
                          <button
                            type="button"
                            key={c}
                            onClick={() => setIconColor(c)}
                            aria-label={`Select color ${c}`}
                            className={`w-9 h-9 rounded-full flex-shrink-0 transition-transform ${
                              iconColor === c
                                ? 'scale-110 ring-2 ring-[#1877F2] ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
                                : 'opacity-80 hover:scale-105'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        )
                      )}
                    </div>
                  </div>

                  <Row
                    icon={<FileText size={18} />}
                    title="High Contrast Mode"
                    description="Increase contrast for better readability."
                    action={
                      <Toggle
                        checked={highContrastMode}
                        onChange={() => setHighContrastMode(!highContrastMode)}
                        label="Toggle High Contrast Mode"
                      />
                    }
                  />
                  <Row
                    icon={<Type size={18} />}
                    title="Animations"
                    description="Enable fluid motion and transitions."
                    action={
                      <Toggle
                        checked={animationsEnabled}
                        onChange={() => setAnimationsEnabled(!animationsEnabled)}
                        label="Toggle Animations"
                      />
                    }
                  />
                  <Row
                    icon={<RefreshCw size={18} />}
                    title="Haptic Feedback"
                    description="Vibrate on certain actions."
                    action={
                      <Toggle
                        checked={hapticFeedback}
                        onChange={() => setHapticFeedback(!hapticFeedback)}
                        label="Toggle Haptic Feedback"
                      />
                    }
                    border={false}
                  />
                </Section>

                <Section title="Media, Feed & App">
                  <div className="p-3.5 sm:p-4 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white mb-1 flex items-center gap-2">
                        <Monitor size={18} className="text-[#1877F2] shrink-0" />
                        <span>Fast Work Mode</span>
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        Install Next onto your device for fast loads and cached offline browsing.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const isStandalone =
                          window.matchMedia?.('(display-mode: standalone)').matches ||
                          (window.navigator as any).standalone === true;
                        if (isStandalone) {
                          toast.info('Next is already installed on this device.');
                          return;
                        }
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
                          toast.info(
                            'Open your browser menu and tap "Install app" or "Add to Home Screen".'
                          );
                        }
                      }}
                      className="shrink-0 self-start sm:self-center min-h-[40px] px-4 py-2 bg-[#1877F2] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors text-xs sm:text-sm"
                    >
                      Install UI
                    </button>
                  </div>

                  <Row
                    icon={<Camera size={18} />}
                    title="Autoplay Videos"
                    description="Automatically play videos on cellular/Wi-Fi."
                    action={
                      <Toggle
                        checked={autoplayVideos}
                        onChange={() => setAutoplayVideos(!autoplayVideos)}
                        label="Toggle Autoplay Videos"
                      />
                    }
                  />
                  <Row
                    icon={<FileText size={18} />}
                    title="Show All Shared Videos in Reels"
                    description="Include YouTube and Facebook videos in the Reels feed."
                    action={
                      <Toggle
                        checked={showAllReels}
                        onChange={() => setShowAllReels(!showAllReels)}
                        label="Toggle Show All Shared Videos in Reels"
                      />
                    }
                  />
                  <Row
                    icon={<MessageSquare size={18} />}
                    title="Compact Feed"
                    description="Show more posts on screen at a time."
                    action={
                      <Toggle
                        checked={compactFeed}
                        onChange={() => setCompactFeed(!compactFeed)}
                        label="Toggle Compact Feed"
                      />
                    }
                  />
                  <Row
                    icon={<Download size={18} />}
                    title="Data Saver Mode"
                    description="Load lower quality media."
                    action={
                      <Toggle
                        checked={saveDataMode}
                        onChange={() => setSaveDataMode(!saveDataMode)}
                        label="Toggle Data Saver Mode"
                      />
                    }
                  />
                  <Row
                    icon={<BellRing size={18} />}
                    title="In-App Sounds"
                    description="Play sounds when liking or messaging."
                    action={
                      <Toggle
                        checked={soundEffects}
                        onChange={() => setSoundEffects(!soundEffects)}
                        label="Toggle In-App Sounds"
                      />
                    }
                    border={false}
                  />
                </Section>
              </div>
            )}

            {/* Privacy & Safety Settings */}
            {activeTab === 'privacy' && (
              <div className="animate-in fade-in duration-200 min-w-0">
                <div className="hidden md:block mb-6">
                  <h2 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white">
                    Privacy &amp; Safety
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
                    Manage your privacy and blocked accounts.
                  </p>
                </div>

                <BlockedUsersSection />
              </div>
            )}

            {/* Notifications Settings */}
            {activeTab === 'notifications' && (
              <div className="animate-in fade-in duration-200 min-w-0">
                <div className="hidden md:block mb-6">
                  <h2 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white">
                    Notifications
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
                    Control how you receive alerts and updates.
                  </p>
                </div>

                <Section title="Push Notifications">
                  <div className="p-5 sm:p-6 flex flex-col items-center text-center">
                    <div
                      className={`p-3.5 rounded-full mb-3.5 ${
                        notificationPermission === 'granted'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          : 'bg-blue-100 dark:bg-blue-900/30 text-[#1877F2]'
                      }`}
                    >
                      <BellRing size={38} />
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold mb-1.5 text-gray-900 dark:text-white">
                      {notificationPermission === 'granted'
                        ? 'Notifications Enabled'
                        : 'Enable Push Notifications'}
                    </h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mb-5 max-w-sm leading-relaxed">
                      {notificationPermission === 'granted'
                        ? 'You will receive alerts for new messages and mentions even when the app is in the background.'
                        : 'Stay updated with real-time alerts for messages and mentions. Tap below to grant permission.'}
                    </p>

                    {notificationPermission !== 'granted' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const granted = await requestNotificationPermission();
                          if (granted) {
                            toast.success('Notifications Enabled!');
                            if ('Notification' in window) {
                              setNotificationPermission(Notification.permission);
                            }
                          } else {
                            toast.error(
                              'Notification permission is blocked. Please allow notifications in your browser settings.'
                            );
                          }
                        }}
                        className="min-h-[44px] px-6 py-2.5 bg-[#1877F2] hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-sm text-sm"
                      >
                        Grant Permission
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          showNotification('Next Test Notification', {
                            body: 'Push notifications are active and working on this device.'
                          });
                          toast.success('Test notification sent!');
                        }}
                        className="min-h-[44px] px-6 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-white font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-all text-sm"
                      >
                        Send Test Notification
                      </button>
                    )}
                  </div>
                </Section>

                <Section title="Notification Preferences">
                  <Row
                    icon={<MessageSquare size={18} />}
                    title="Message Alerts"
                    description="Receive notifications for new private messages"
                    action={
                      <Toggle
                        checked={messageAlerts}
                        onChange={() => {
                          const next = !messageAlerts;
                          setMessageAlerts(next);
                          toast.success(
                            next ? 'Message alerts turned on.' : 'Message alerts muted.'
                          );
                        }}
                        label="Toggle Message Alerts"
                      />
                    }
                  />
                  <Row
                    icon={<Bell size={18} />}
                    title="Mentions"
                    description="Get notified when someone mentions you in a post"
                    action={
                      <Toggle
                        checked={mentionAlerts}
                        onChange={() => {
                          const next = !mentionAlerts;
                          setMentionAlerts(next);
                          toast.success(
                            next ? 'Mention alerts turned on.' : 'Mention alerts muted.'
                          );
                        }}
                        label="Toggle Mention Alerts"
                      />
                    }
                    border={false}
                  />
                </Section>
              </div>
            )}

            {/* Account Settings */}
            {activeTab === 'account' && (
              <div className="animate-in fade-in duration-200 min-w-0">
                <div className="hidden md:block mb-6">
                  <h2 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white">
                    Account Center
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
                    Manage your account details.
                  </p>
                </div>

                <Section title="Profile Information">
                  <div className="flex items-center justify-between gap-3 p-3.5 sm:p-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="relative shrink-0">
                        <ProfileAvatar
                          userId={currentUser?.id || ''}
                          defaultAvatar={profile?.avatar_url || currentUser?.avatar_url || undefined}
                          name={profile?.display_name || currentUser?.display_name || 'User'}
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-gray-100 dark:border-gray-800 shadow-sm"
                        />
                        <button
                          type="button"
                          disabled={avatarUploading}
                          onClick={() => avatarInputRef.current?.click()}
                          className="absolute -bottom-1 -right-1 bg-[#1877F2] text-white p-1.5 rounded-full border-2 border-white dark:border-gray-900 shadow-md hover:bg-blue-600 transition-colors disabled:opacity-50"
                          aria-label="Upload new profile photo"
                        >
                          <Camera size={13} />
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
                              setAvatarUploading(true);
                              try {
                                const isSafe = await scanFile(file, inputEl);
                                if (!isSafe) {
                                  setAvatarUploading(false);
                                  return;
                                }

                                addUpload(file, 'profile', {
                                  userId: currentUser.id,
                                  fullProfile: profile || currentUser,
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
                                    setAvatarUploading(false);
                                  },
                                  onError: () => {
                                    setAvatarUploading(false);
                                    toast.error('Failed to upload profile photo.');
                                  }
                                });
                              } catch {
                                setAvatarUploading(false);
                              }
                            }
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                          Profile Photo
                        </p>
                        <p className="text-xs text-gray-500 font-medium mt-0.5 truncate">
                          {avatarUploading ? 'Uploading photo...' : 'Change your public profile picture'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={avatarUploading}
                      onClick={() => avatarInputRef.current?.click()}
                      className="shrink-0 min-h-[36px] px-3 py-1.5 rounded-xl text-[#1877F2] hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold text-sm transition-colors disabled:opacity-50"
                    >
                      {avatarUploading ? 'Uploading...' : 'Change'}
                    </button>
                  </div>

                  <Row
                    icon={<User size={18} />}
                    title="Display Name"
                    description={profile?.display_name || currentUser?.display_name}
                    stacked={editingField === 'display_name'}
                    action={renderAction(
                      'display_name',
                      profile?.display_name || currentUser?.display_name || ''
                    )}
                  />
                  <Row
                    icon={<Smartphone size={18} />}
                    title="Username"
                    description={`@${profile?.username || currentUser?.username}`}
                    stacked={editingField === 'username'}
                    action={renderAction(
                      'username',
                      profile?.username || currentUser?.username || ''
                    )}
                    border={false}
                  />
                </Section>

                <Section title="Security">
                  <Row
                    icon={<Lock size={18} />}
                    title="Password"
                    description="Change your account password"
                    stacked={editingField === 'password'}
                    action={renderAction('password', '', true)}
                    border={true}
                  />
                  <Row
                    icon={<Smartphone size={18} />}
                    title="Auto-Login After App Reinstall"
                    description="Keep your previous account logged in automatically if you uninstall and reinstall the web app (off by default)."
                    action={
                      <Toggle
                        checked={autoLoginOnReinstall}
                        onChange={() => {
                          const nextVal = !autoLoginOnReinstall;
                          setAutoLoginOnReinstall(nextVal);
                          if (currentUser?.id) {
                            updateDoc(doc(db, 'profiles', currentUser.id), {
                              auto_login_reinstall: nextVal
                            }).catch(() => {});
                          }
                          toast.success(
                            nextVal
                              ? 'Auto-login after reinstall enabled.'
                              : 'Auto-login after reinstall disabled (default).'
                          );
                        }}
                        label="Toggle Auto-Login After App Reinstall"
                      />
                    }
                    border={false}
                  />
                </Section>

                <Section title="Saved Accounts">
                  <div className="p-3.5 sm:p-4 flex flex-col gap-2.5">
                    {savedAccounts.map((acc: any) => {
                      const isActive = acc.id === currentUser?.id;
                      return (
                        <div
                          key={acc.id}
                          className="flex items-center justify-between gap-2.5 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <ProfileAvatar
                              userId={acc.id}
                              defaultAvatar={acc.avatar_url || undefined}
                              name={acc.display_name || acc.username || 'User'}
                              className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-gray-900 dark:text-white truncate text-sm">
                                {acc.display_name}
                              </p>
                              <p className="text-xs text-gray-500 truncate">@{acc.username}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {!isActive ? (
                              <button
                                type="button"
                                disabled={isSwitching}
                                onClick={() => handleSwitchAccount(acc)}
                                className="min-h-[34px] px-3 py-1.5 bg-[#1877F2] text-white hover:bg-blue-600 disabled:opacity-50 font-bold text-xs rounded-lg transition-all"
                              >
                                Switch
                              </button>
                            ) : (
                              <span className="text-xs text-green-600 dark:text-green-400 font-bold px-2 py-1">
                                Active
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setRemoveAccountTarget(acc)}
                              className="min-w-[34px] min-h-[34px] flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                              aria-label={`Remove @${acc.username}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => setShowAddAccountModal(true)}
                      className="w-full min-h-[44px] py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-[#1877F2] dark:hover:border-[#1877F2] text-gray-600 hover:text-[#1877F2] dark:text-gray-400 dark:hover:text-[#1877F2] font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all mt-1"
                    >
                      <Users size={16} />
                      <span>Add New Account</span>
                    </button>
                  </div>
                </Section>

                <Section title="Session">
                  <Row
                    icon={<LogOut size={18} />}
                    title="Sign Out"
                    description="Sign out of your account on this device"
                    action={
                      <button
                        type="button"
                        onClick={() => setShowLogoutConfirm(true)}
                        className="min-h-[38px] px-4 py-1.5 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 font-bold text-xs sm:text-sm transition-colors"
                      >
                        Log Out
                      </button>
                    }
                    border={false}
                  />
                </Section>
              </div>
            )}

            {/* Saved Content */}
            {activeTab === 'saved' && (
              <div className="animate-in fade-in duration-200 min-w-0">
                <div className="hidden md:block mb-6">
                  <h2 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white">
                    Saved Content
                  </h2>
                  <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
                    Posts and media saved for offline access on this device.
                  </p>
                </div>

                <SavedContentList />
              </div>
            )}

            {/* Legal & Support Settings */}
            {activeTab === 'legal' && (
              <div className="animate-in fade-in duration-200 min-w-0">
                {subView === 'child-safety' ? (
                  <div className="space-y-5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setSubView(null)}
                      className="hidden md:inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-xl font-bold text-sm transition-colors"
                    >
                      <ArrowLeft size={16} /> Back to Legal Settings
                    </button>

                    <div className="bg-white dark:bg-[#1a1a1b] rounded-2xl border border-gray-200 dark:border-gray-800 p-4 sm:p-6 md:p-8 space-y-5">
                      <div className="flex flex-col items-center text-center space-y-2.5 pb-5 border-b border-gray-200 dark:border-gray-800">
                        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                          <Shield className="w-6 h-6 text-red-600 dark:text-red-500" />
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-gray-900 dark:text-white">
                          Child Safety Standards &amp; Anti-CSAE Policy
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          Last Updated: August 24, 2026
                        </p>
                      </div>

                      <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                        At Next, we are deeply committed to ensuring a safe, secure, and positive
                        environment for all our users. The safety of minors is our highest priority,
                        and we strictly enforce policies to protect children from all forms of
                        exploitation and abuse.
                      </p>

                      <section className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 p-4 rounded-xl space-y-2">
                        <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-red-700 dark:text-red-400">
                          <AlertTriangle className="w-5 h-5 shrink-0" />
                          <span>Zero Tolerance for CSAM &amp; CSAE</span>
                        </h3>
                        <p className="text-xs sm:text-sm text-red-900 dark:text-red-200 leading-relaxed">
                          We have a <strong>STRICT ZERO TOLERANCE POLICY</strong> regarding Child
                          Sexual Abuse Material (CSAM) and Child Sexual Abuse and Exploitation (CSAE).
                          Any user found generating, uploading, sharing, or soliciting such content
                          will face immediate, permanent account termination without appeal.
                        </p>
                      </section>

                      <section className="space-y-2.5">
                        <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                          <FileText className="w-5 h-5 text-[#1877F2] shrink-0" />
                          <span>Moderation &amp; Community Guidelines</span>
                        </h3>
                        <ul className="list-disc pl-5 space-y-2 text-xs sm:text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                          <li>
                            <strong>Automated &amp; Manual Review:</strong> We employ a combination of
                            automated scanning technologies and human moderation to remove
                            policy-violating content.
                          </li>
                          <li>
                            <strong>Prohibited Content:</strong> Users are strictly forbidden from
                            posting content that depicts, encourages, or normalizes the abuse,
                            grooming, or exploitation of minors.
                          </li>
                          <li>
                            <strong>Age Restrictions:</strong> Our platform requires users to be of
                            appropriate legal age as defined by regional laws to create an account.
                          </li>
                          <li>
                            <strong>Privacy Enforcement:</strong> Sharing personally identifiable
                            information (PII) of minors is strictly prohibited.
                          </li>
                        </ul>
                      </section>

                      <section className="bg-gray-50 dark:bg-[#272729] p-4 rounded-xl space-y-3 border border-gray-200 dark:border-gray-700">
                        <h3 className="text-base sm:text-lg font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                          <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />
                          <span>How to Report Policy Violations</span>
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">
                          If you encounter content that violates this policy, please report it
                          immediately. We prioritize child safety reports above all other inquiries.
                        </p>
                        <div className="bg-white dark:bg-black p-3.5 rounded-lg border border-gray-200 dark:border-gray-800">
                          <p className="font-semibold text-xs sm:text-sm mb-1.5 text-gray-900 dark:text-white">
                            To report a violation:
                          </p>
                          <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                            <li>Use the in-app reporting tools available on every post, profile, and message.</li>
                            <li>Select the &ldquo;Child Safety / CSAM&rdquo; option.</li>
                            <li>Alternatively, email our dedicated trust and safety team directly.</li>
                          </ol>
                        </div>
                      </section>

                      <section className="space-y-3 border-t border-gray-200 dark:border-gray-800 pt-4">
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                          Compliance &amp; Law Enforcement Declaration
                        </h3>
                        <p className="text-xs sm:text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                          We actively comply with all applicable local, national, and international
                          laws regarding child safety and report confirmed CSAM/CSAE cases to
                          relevant authorities as required by law.
                        </p>

                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
                          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1 text-xs sm:text-sm">
                            Official Contact for Safety Inquiries:
                          </h4>
                          <a
                            href="mailto:abdullahalmamun.next@gmail.com"
                            className="text-blue-800 dark:text-blue-200 font-bold text-xs sm:text-sm hover:underline break-all"
                          >
                            abdullahalmamun.next@gmail.com
                          </a>
                        </div>
                      </section>

                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          onClick={() => setSubView(null)}
                          className="min-h-[42px] px-6 py-2 bg-[#1877F2] hover:bg-blue-600 text-white font-bold rounded-xl transition-colors shadow-sm text-sm"
                        >
                          Back to Settings
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="hidden md:block mb-6">
                      <h2 className="text-2xl lg:text-3xl font-black text-gray-900 dark:text-white">
                        Legal &amp; Support
                      </h2>
                      <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">
                        View policies and contact us.
                      </p>
                    </div>

                    <Section title="Legal">
                      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                        <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">
                          Privacy Policy
                        </h3>
                        <div className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto pr-1 space-y-1.5">
                          <p>Your privacy is critically important to us.</p>
                          <p>
                            We collect the minimum possible data necessary to run our platform. We
                            securely store your email, username, and profile data in our databases.
                          </p>
                          <p>
                            We do not share your personal information with third parties without your
                            explicit consent.
                          </p>
                        </div>
                      </div>
                      <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                        <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg">
                          Terms &amp; Conditions
                        </h3>
                        <div className="mt-2 text-xs sm:text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto pr-1 space-y-1.5">
                          <p>By using Next, you agree to our terms of service.</p>
                          <p>
                            You are responsible for the content you post and agree not to engage in
                            harassing, bullying, or illegal activities.
                          </p>
                          <p>
                            We reserve the right to ban or restrict users who violate these terms.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSubView('child-safety')}
                        className="w-full p-4 flex justify-between items-center gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg flex items-center gap-2">
                            <Shield className="w-5 h-5 text-red-500 shrink-0" />
                            <span>Child Safety Policy</span>
                          </h3>
                          <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm mt-1">
                            Read our Zero Tolerance policy on CSAE.
                          </p>
                        </div>
                        <ChevronRight size={20} className="text-gray-400 shrink-0" />
                      </button>
                    </Section>

                    <Section title="Contact Us">
                      <div className="p-4 sm:p-5">
                        <p className="mb-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                          If you have any questions or need help, please contact us:
                        </p>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-[#1877F2] shrink-0">
                              <User size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                                Name
                              </p>
                              <p className="font-bold text-sm text-gray-900 dark:text-white truncate">
                                Abdullah Al Mamun
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center text-green-600 dark:text-green-400 shrink-0">
                              <Smartphone size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                                Phone
                              </p>
                              <a
                                href="tel:+8801307072293"
                                className="font-bold text-sm text-gray-900 dark:text-white hover:text-[#1877F2] tabular-nums"
                              >
                                +8801307072293
                              </a>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 bg-red-50 dark:bg-red-900/30 rounded-xl flex items-center justify-center text-red-500 shrink-0">
                              <MessageSquare size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                                Email
                              </p>
                              <a
                                href="mailto:abdullahalmamun.next@gmail.com"
                                className="font-bold text-sm text-gray-900 dark:text-white hover:text-[#1877F2] break-all"
                              >
                                abdullahalmamun.next@gmail.com
                              </a>
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

      {/* Add Account Modal */}
      {showAddAccountModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4 animate-in fade-in duration-200"
          onClick={() => !addAccountLoading && setShowAddAccountModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
                Add Next Account
              </h3>
              <button
                type="button"
                onClick={() => !addAccountLoading && setShowAddAccountModal(false)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddSavedAccount} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Username or Email
                </label>
                <div className="relative">
                  <User
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
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
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                  />
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
                <p className="text-xs text-red-500 font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                  {addAccountError}
                </p>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="flex-1 min-h-[44px] py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addAccountLoading}
                  className="flex-1 min-h-[44px] py-2.5 bg-[#1877F2] text-white font-bold rounded-xl text-sm hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {addAccountLoading && <RefreshCw size={16} className="animate-spin" />}
                  {addAccountLoading ? 'Verifying...' : 'Add & Switch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Switch Account Confirm Password Modal */}
      {switchTargetAccount && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[999] p-4 animate-in fade-in duration-200"
          onClick={() => !isSwitching && setSwitchTargetAccount(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
                Confirm Password
              </h3>
              <button
                type="button"
                onClick={() => !isSwitching && setSwitchTargetAccount(null)}
                className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 font-medium">
              Enter the password for{' '}
              <span className="font-bold text-gray-900 dark:text-white">
                @{switchTargetAccount.username}
              </span>{' '}
              to switch accounts securely.
            </p>
            <form onSubmit={confirmSwitchAccount} className="flex flex-col gap-4">
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="password"
                  value={switchAccountPassword}
                  onChange={(e) => setSwitchAccountPassword(e.target.value)}
                  placeholder="Enter account password"
                  autoFocus
                  className="w-full p-3 pl-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-[#1877F2] dark:text-white transition-all font-bold"
                />
              </div>
              {switchAccountError && (
                <p className="text-xs text-red-500 font-bold bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                  {switchAccountError}
                </p>
              )}
              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  disabled={isSwitching}
                  onClick={() => setSwitchTargetAccount(null)}
                  className="flex-1 min-h-[44px] py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSwitching}
                  className="flex-1 min-h-[44px] py-2.5 bg-[#1877F2] text-white font-bold rounded-xl text-sm hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSwitching && <RefreshCw size={16} className="animate-spin" />}
                  {isSwitching ? 'Switching...' : 'Switch Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Saved Account Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(removeAccountTarget)}
        title="Remove Saved Account"
        message={`Remove @${removeAccountTarget?.username || ''} from saved accounts on this device?`}
        confirmText="Remove"
        isDestructive={true}
        onCancel={() => setRemoveAccountTarget(null)}
        onConfirm={() => {
          if (removeAccountTarget) {
            const updated = savedAccounts.filter((a: any) => a.id !== removeAccountTarget.id);
            setSavedAccounts(updated);
            localStorage.setItem('next_saved_accounts', JSON.stringify(updated));
            toast.success('Account removed.');
          }
          setRemoveAccountTarget(null);
        }}
      />

      {/* Sign Out Confirm Dialog */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of your Next account?"
        confirmText="Sign Out"
        isDestructive={true}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          logout();
        }}
      />
    </div>
  );
};

export default Settings;
