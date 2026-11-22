import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Image as ImageIcon, X, CircleDot } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useActiveStatuses } from '@/hooks/useActiveStatuses';
import { StatusViewerModal } from './StatusViewerModal';
import { StatusCreatorModal } from './StatusCreatorModal';

interface AvatarWithStatusMenuProps {
  userId?: string;
  avatarUrl?: string;
  displayName?: string;
  avatarClassName?: string;
  ringThickness?: 'sm' | 'lg';
  disabled?: boolean;
  onNoStatusClick?: (e: React.MouseEvent) => void;
  onViewProfilePhoto?: () => void;
}

export const AvatarWithStatusMenu: React.FC<AvatarWithStatusMenuProps> = ({
  userId,
  avatarUrl,
  displayName = 'User',
  avatarClassName = 'w-10 h-10 rounded-full object-cover',
  ringThickness = 'sm',
  disabled = false,
  onNoStatusClick,
  onViewProfilePhoto,
}) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { groups, groupByUserId, viewedStoryIds, markStoryViewed, refetch } = useActiveStatuses();

  const [showChooser, setShowChooser] = useState(false);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [showStatusViewer, setShowStatusViewer] = useState(false);
  const [showCreator, setShowCreator] = useState(false);

  const statusGroup = userId ? groupByUserId.get(userId) : undefined;
  const hasActiveStatus = Boolean(!disabled && statusGroup && statusGroup.stories.length > 0);
  const groupIdx = statusGroup ? groups.findIndex((g) => g.userId === statusGroup.userId) : -1;

  const isUnviewed = Boolean(statusGroup && (statusGroup.isOwn || statusGroup.hasUnviewed));

  const handleAvatarClick = (e: React.MouseEvent) => {
    if (disabled) return;
    if (hasActiveStatus && statusGroup) {
      e.preventDefault();
      e.stopPropagation();
      setShowChooser(true);
      return;
    }
    if (onNoStatusClick) {
      onNoStatusClick(e);
    }
  };

  const handleOpenProfilePicture = () => {
    setShowChooser(false);
    if (onViewProfilePhoto) {
      onViewProfilePhoto();
      return;
    }
    setShowPhotoViewer(true);
  };

  const handleOpenStatus = () => {
    setShowChooser(false);
    if (groupIdx >= 0) {
      setShowStatusViewer(true);
    }
  };

  const padClass = ringThickness === 'lg' ? 'p-[3.5px]' : 'p-[2.5px]';
  const innerPadClass = ringThickness === 'lg' ? 'p-[2.5px]' : 'p-[1.5px]';
  const ringBgClass = isUnviewed
    ? 'bg-gradient-to-tr from-[#1877F2] via-blue-500 to-sky-400'
    : 'bg-slate-400 dark:bg-zinc-600';

  const resolvedPhotoUrl =
    avatarUrl && !avatarUrl.includes('dicebear')
      ? avatarUrl
      : statusGroup?.user.avatar_url && !statusGroup.user.avatar_url.includes('dicebear')
      ? statusGroup.user.avatar_url
      : '';

  return (
    <>
      <div
        onClick={handleAvatarClick}
        onMouseDown={(e) => {
          if (hasActiveStatus) e.stopPropagation();
        }}
        onTouchStart={(e) => {
          if (hasActiveStatus) e.stopPropagation();
        }}
        className={`relative inline-flex items-center justify-center rounded-full shrink-0 ${
          hasActiveStatus || onNoStatusClick ? 'cursor-pointer' : ''
        } ${hasActiveStatus ? `${padClass} ${ringBgClass} shadow-sm` : ''}`}
      >
        <div
          className={`rounded-full flex items-center justify-center ${
            hasActiveStatus ? `${innerPadClass} bg-white dark:bg-black` : ''
          }`}
        >
          <ProfileAvatar
            userId={userId}
            defaultAvatar={avatarUrl}
            name={displayName}
            className={avatarClassName}
          />
        </div>
      </div>

      {/* 2-Option Chooser Modal: View Profile Picture vs View Status */}
      {showChooser &&
        statusGroup &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={(e) => {
              e.stopPropagation();
              setShowChooser(false);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="fixed inset-0 z-[1180] bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-xs bg-white dark:bg-zinc-950 rounded-t-3xl sm:rounded-3xl border border-gray-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-150"
            >
              <div className="px-4 py-3.5 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ProfileAvatar
                    userId={userId}
                    defaultAvatar={resolvedPhotoUrl}
                    name={displayName}
                    className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-zinc-700 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="font-black text-sm text-gray-900 dark:text-white truncate">
                      {displayName}
                    </p>
                    <p className="text-[11px] font-bold text-[#1877F2]">
                      {statusGroup.stories.length} active status{statusGroup.stories.length > 1 ? 'es' : ''}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowChooser(false)}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500"
                  aria-label="Close options"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-3 space-y-2">
                <button
                  type="button"
                  onClick={handleOpenProfilePicture}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-left transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#1877F2] flex items-center justify-center shrink-0">
                    <ImageIcon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-gray-900 dark:text-white">
                      View Profile Picture
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Open full-size profile photo
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleOpenStatus}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-blue-50/80 hover:bg-blue-100/80 dark:bg-blue-950/35 dark:hover:bg-blue-950/55 border border-blue-200/70 dark:border-blue-900/50 text-left transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-[#1877F2] text-white flex items-center justify-center shrink-0 shadow-sm">
                    <Eye size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span>View Status</span>
                      {isUnviewed && (
                        <CircleDot size={12} className="text-[#1877F2] shrink-0" />
                      )}
                    </p>
                    <p className="text-xs text-[#1877F2] dark:text-blue-400 font-semibold">
                      Watch {statusGroup.stories.length} live update{statusGroup.stories.length > 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Full-Screen Profile Picture Modal (for PostCard / Messages) */}
      {showPhotoViewer &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={(e) => {
              e.stopPropagation();
              setShowPhotoViewer(false);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="fixed inset-0 bg-black/90 z-[1220] flex flex-col items-center justify-center p-4 animate-in fade-in duration-200"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowPhotoViewer(false);
              }}
              className="absolute top-5 right-5 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              aria-label="Close photo"
            >
              <X size={24} />
            </button>
            <div
              onClick={(e) => e.stopPropagation()}
              className="max-w-lg w-full flex flex-col items-center gap-4"
            >
              {resolvedPhotoUrl ? (
                <img
                  src={resolvedPhotoUrl}
                  alt={displayName}
                  className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain animate-in zoom-in-95 duration-200"
                />
              ) : (
                <div className="w-56 h-56 rounded-full bg-gradient-to-tr from-[#1877F2] to-sky-400 text-white text-6xl font-black flex items-center justify-center shadow-2xl border-4 border-white/20">
                  {displayName.trim().charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="text-white font-bold text-sm">{displayName}</span>
                {userId && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowPhotoViewer(false);
                      navigate(`/profile/${userId}`);
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-[#1877F2] hover:bg-blue-600 text-white text-xs font-bold transition-colors"
                  >
                    Visit Profile
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Full-Screen Status Viewer */}
      {showStatusViewer &&
        groupIdx >= 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <StatusViewerModal
              isOpen={showStatusViewer}
              groups={groups}
              initialGroupIndex={groupIdx}
              viewedStoryIds={viewedStoryIds}
              onClose={() => setShowStatusViewer(false)}
              onStoryViewed={markStoryViewed}
              onAddStatus={() => {
                setShowStatusViewer(false);
                if (!currentUser?.id) {
                  toast.info('Please log in to share a status.');
                  navigate('/login');
                  return;
                }
                setShowCreator(true);
              }}
              onRefresh={() => refetch()}
            />
          </div>,
          document.body
        )}

      {/* Optional Add Status Creator */}
      {showCreator &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <StatusCreatorModal
              isOpen={showCreator}
              initialMode="picker"
              onClose={() => setShowCreator(false)}
              onCreated={() => refetch()}
            />
          </div>,
          document.body
        )}
    </>
  );
};
