import React, { useEffect, useMemo, useState } from 'react';
import { X, Globe, Users, UserMinus, UserCheck, Search, Check, Lock } from 'lucide-react';
import { StoryVisibility, UserProfile } from '@/types';
import { fetchStatusAudienceContacts } from '@/services/statusService';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';

interface StatusPrivacyModalProps {
  isOpen: boolean;
  currentUserId: string;
  initialVisibility: StoryVisibility;
  initialAllowedIds: string[];
  initialExcludedIds: string[];
  onClose: () => void;
  onSave: (config: {
    visibility: StoryVisibility;
    allowed_user_ids: string[];
    excluded_user_ids: string[];
  }) => void;
  title?: string;
}

export const StatusPrivacyModal: React.FC<StatusPrivacyModalProps> = ({
  isOpen,
  currentUserId,
  initialVisibility,
  initialAllowedIds,
  initialExcludedIds,
  onClose,
  onSave,
  title = 'Status Privacy',
}) => {
  const [visibility, setVisibility] = useState<StoryVisibility>(initialVisibility);
  const [allowedIds, setAllowedIds] = useState<string[]>(initialAllowedIds || []);
  const [excludedIds, setExcludedIds] = useState<string[]>(initialExcludedIds || []);
  const [selectingMode, setSelectingMode] = useState<'none' | 'friends_except' | 'only_share'>('none');
  const [search, setSearch] = useState('');
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [discoverable, setDiscoverable] = useState<UserProfile[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setVisibility(initialVisibility);
    setAllowedIds(initialAllowedIds || []);
    setExcludedIds(initialExcludedIds || []);
    setSelectingMode('none');
    setSearch('');

    if (currentUserId) {
      setLoadingContacts(true);
      fetchStatusAudienceContacts(currentUserId)
        .then(({ friends: frs, discoverableUsers }) => {
          setFriends(frs);
          setDiscoverable(discoverableUsers);
        })
        .catch(() => {})
        .finally(() => setLoadingContacts(false));
    }
  }, [isOpen, currentUserId, initialVisibility, initialAllowedIds, initialExcludedIds]);

  const pickerPool = useMemo(() => {
    const base = selectingMode === 'only_share' ? [...friends, ...discoverable] : friends;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (u) =>
        (u.display_name || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q)
    );
  }, [selectingMode, friends, discoverable, search]);

  if (!isOpen) return null;

  const toggleUserSelection = (uid: string) => {
    if (selectingMode === 'friends_except') {
      setExcludedIds((prev) =>
        prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid].slice(0, 200)
      );
    } else if (selectingMode === 'only_share') {
      setAllowedIds((prev) =>
        prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid].slice(0, 200)
      );
    }
  };

  const handleDone = () => {
    onSave({
      visibility,
      allowed_user_ids: allowedIds,
      excluded_user_ids: excludedIds,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full sm:max-w-md bg-white dark:bg-gray-950 rounded-t-3xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col max-h-[88dvh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            {selectingMode !== 'none' ? (
              <button
                type="button"
                onClick={() => { setSelectingMode('none'); setSearch(''); }}
                className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Back
              </button>
            ) : (
              <Lock size={18} className="text-[#1877F2]" />
            )}
            <div>
              <h3 className="font-black text-base text-gray-900 dark:text-white">
                {selectingMode === 'friends_except'
                  ? 'Hide Status From...'
                  : selectingMode === 'only_share'
                  ? 'Only Share With...'
                  : title}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {selectingMode === 'friends_except'
                  ? `${excludedIds.length} excluded from your friends`
                  : selectingMode === 'only_share'
                  ? `${allowedIds.length} selected people can view`
                  : 'Who can see your status updates'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        {selectingMode === 'none' ? (
          <div className="p-4 space-y-2.5 overflow-y-auto">
            {/* Public */}
            <button
              type="button"
              onClick={() => setVisibility('public')}
              className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all ${
                visibility === 'public'
                  ? 'bg-blue-50/80 dark:bg-blue-950/30 border-[#1877F2] shadow-sm'
                  : 'bg-gray-50/70 dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900'
              }`}
            >
              <div className={`p-2.5 rounded-full ${visibility === 'public' ? 'bg-[#1877F2] text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                <Globe size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 dark:text-white">Public (Everyone)</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Anyone on Next can see this status</p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${visibility === 'public' ? 'border-[#1877F2] bg-[#1877F2] text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                {visibility === 'public' && <Check size={12} strokeWidth={3} />}
              </div>
            </button>

            {/* My Friends */}
            <button
              type="button"
              onClick={() => setVisibility('friends')}
              className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl border text-left transition-all ${
                visibility === 'friends'
                  ? 'bg-blue-50/80 dark:bg-blue-950/30 border-[#1877F2] shadow-sm'
                  : 'bg-gray-50/70 dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-900'
              }`}
            >
              <div className={`p-2.5 rounded-full ${visibility === 'friends' ? 'bg-[#1877F2] text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                <Users size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-gray-900 dark:text-white">My Friends</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Only your Next friends ({friends.length > 0 ? friends.length : 'accepted'})
                </p>
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${visibility === 'friends' ? 'border-[#1877F2] bg-[#1877F2] text-white' : 'border-gray-300 dark:border-gray-600'}`}>
                {visibility === 'friends' && <Check size={12} strokeWidth={3} />}
              </div>
            </button>

            {/* Friends Except... */}
            <div
              className={`w-full rounded-2xl border transition-all ${
                visibility === 'friends_except'
                  ? 'bg-blue-50/80 dark:bg-blue-950/30 border-[#1877F2] shadow-sm'
                  : 'bg-gray-50/70 dark:bg-gray-900/60 border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className="flex items-center gap-3.5 p-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setVisibility('friends_except');
                    setSelectingMode('friends_except');
                  }}
                  className="flex-1 flex items-center gap-3.5 text-left min-w-0"
                >
                  <div className={`p-2.5 rounded-full ${visibility === 'friends_except' ? 'bg-[#1877F2] text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                    <UserMinus size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 dark:text-white">My Friends Except...</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {excludedIds.length > 0
                        ? `Hidden from ${excludedIds.length} selected friend${excludedIds.length > 1 ? 's' : ''}`
                        : 'Tap to hide from specific friends'}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVisibility('friends_except');
                    setSelectingMode('friends_except');
                  }}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[#1877F2] shrink-0"
                >
                  Choose ({excludedIds.length})
                </button>
              </div>
            </div>

            {/* Only Share With... */}
            <div
              className={`w-full rounded-2xl border transition-all ${
                visibility === 'only_share'
                  ? 'bg-blue-50/80 dark:bg-blue-950/30 border-[#1877F2] shadow-sm'
                  : 'bg-gray-50/70 dark:bg-gray-900/60 border-gray-200 dark:border-gray-800'
              }`}
            >
              <div className="flex items-center gap-3.5 p-3.5">
                <button
                  type="button"
                  onClick={() => {
                    setVisibility('only_share');
                    setSelectingMode('only_share');
                  }}
                  className="flex-1 flex items-center gap-3.5 text-left min-w-0"
                >
                  <div className={`p-2.5 rounded-full ${visibility === 'only_share' ? 'bg-[#1877F2] text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}>
                    <UserCheck size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 dark:text-white">Only Share With...</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {allowedIds.length > 0
                        ? `Only ${allowedIds.length} selected person${allowedIds.length > 1 ? 's' : ''} can see`
                        : 'Tap to pick specific people'}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVisibility('only_share');
                    setSelectingMode('only_share');
                  }}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[#1877F2] shrink-0"
                >
                  Select ({allowedIds.length})
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Searchable Contact Checklist */
          <div className="flex-1 flex flex-col min-h-0">
            <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <div className="flex-1 bg-gray-100 dark:bg-gray-900 rounded-full flex items-center px-3.5 py-2">
                <Search size={16} className="text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people by name or username..."
                  className="bg-transparent border-none outline-none ml-2 text-xs sm:text-sm w-full font-medium text-gray-900 dark:text-white"
                />
              </div>
              {selectingMode === 'only_share' && allowedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAllowedIds([])}
                  className="text-xs font-bold text-red-500 px-2"
                >
                  Clear
                </button>
              )}
              {selectingMode === 'friends_except' && excludedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setExcludedIds([])}
                  className="text-xs font-bold text-red-500 px-2"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[48vh]">
              {loadingContacts ? (
                <div className="py-10 text-center text-xs font-bold text-gray-500">Loading your friends...</div>
              ) : pickerPool.length === 0 ? (
                <div className="py-10 text-center text-xs font-bold text-gray-500">
                  {friends.length === 0 ? 'No contacts found yet.' : 'No matching people found.'}
                </div>
              ) : (
                pickerPool.map((person) => {
                  const checked =
                    selectingMode === 'friends_except'
                      ? excludedIds.includes(person.id)
                      : allowedIds.includes(person.id);
                  return (
                    <button
                      type="button"
                      key={person.id}
                      onClick={() => toggleUserSelection(person.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-2xl border transition-all text-left ${
                        checked
                          ? selectingMode === 'friends_except'
                            ? 'bg-red-50/70 dark:bg-red-950/25 border-red-400'
                            : 'bg-blue-50/70 dark:bg-blue-950/25 border-[#1877F2]'
                          : 'bg-white dark:bg-gray-900/50 border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900'
                      }`}
                    >
                      <ProfileAvatar
                        userId={person.id}
                        defaultAvatar={person.avatar_url}
                        name={person.display_name}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1 truncate">
                          <span className="truncate">{person.display_name}</span>
                          {person.is_verified && <VerifiedBadge />}
                        </p>
                        <p className="text-xs text-gray-500 truncate">@{person.username}</p>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          checked
                            ? selectingMode === 'friends_except'
                              ? 'border-red-500 bg-red-500 text-white'
                              : 'border-[#1877F2] bg-[#1877F2] text-white'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {checked && <Check size={12} strokeWidth={3} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3 bg-gray-50/70 dark:bg-black">
          {selectingMode !== 'none' ? (
            <button
              type="button"
              onClick={() => { setSelectingMode('none'); setSearch(''); }}
              className="w-full py-3 rounded-2xl bg-[#1877F2] hover:bg-blue-600 text-white font-bold text-sm shadow-lg"
            >
              Confirm Selection
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDone}
              className="w-full py-3 rounded-2xl bg-[#1877F2] hover:bg-blue-600 text-white font-bold text-sm shadow-lg"
            >
              Save Privacy Settings
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
