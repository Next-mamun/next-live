import React, { useMemo, useState, Suspense, lazy } from 'react';
import {
  Plus,
  Camera,
  Type,
  Lock,
  Video,
  Eye,
  CircleDot,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { VerifiedBadge } from '@/components/VerifiedBadge';
import {
  formatRelativeStatusTime,
  formatRemainingStatusTime,
  getPrivacySummaryLabel,
  getSavedStatusPrivacy,
  saveStatusPrivacy,
} from '@/services/statusService';
import { useActiveStatuses } from '@/hooks/useActiveStatuses';
import { StatusViewerModal } from './StatusViewerModal';
import { StatusPrivacyModal } from './StatusPrivacyModal';

const StatusCreatorModal = lazy(() =>
  import('./StatusCreatorModal').then((m) => ({ default: m.StatusCreatorModal }))
);

interface StatusRibbonProps {
  variant?: 'ribbon' | 'list';
}

const SegmentedStatusRing: React.FC<{
  count: number;
  viewedFlags: boolean[];
  size?: number;
  children: React.ReactNode;
}> = ({ count, viewedFlags, size = 64, children }) => {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safeCount = Math.max(1, Math.min(count, 16));
  const gap = safeCount > 1 ? 5 : 0;
  const segLength = Math.max(4, (circumference - safeCount * gap) / safeCount);

  return (
    <div
      className="relative flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0 -rotate-90 pointer-events-none"
      >
        {Array.from({ length: safeCount }).map((_, idx) => {
          const isViewed = viewedFlags[idx] ?? false;
          const dashOffset = -(idx * (segLength + gap));
          return (
            <circle
              key={idx}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={isViewed ? '#94a3b8' : '#1877F2'}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${segLength} ${circumference}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>
      <div
        className="rounded-full overflow-hidden flex items-center justify-center bg-gray-100 dark:bg-zinc-900"
        style={{ width: size - 9, height: size - 9 }}
      >
        {children}
      </div>
    </div>
  );
};

export const StatusRibbon: React.FC<StatusRibbonProps> = ({ variant = 'ribbon' }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorMode, setCreatorMode] = useState<'picker' | 'text' | 'camera'>('picker');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerGroupIndex, setViewerGroupIndex] = useState(0);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const { groups, viewedStoryIds, isLoading, markStoryViewed, refetch } = useActiveStatuses();

  const ownGroup = useMemo(() => groups.find((g) => g.isOwn) || null, [groups]);
  const otherGroups = useMemo(() => groups.filter((g) => !g.isOwn), [groups]);

  const recentUpdates = useMemo(
    () =>
      otherGroups.filter((g) => g.stories.some((st) => !viewedStoryIds.has(st.id))),
    [otherGroups, viewedStoryIds]
  );
  const viewedUpdates = useMemo(
    () =>
      otherGroups.filter((g) => g.stories.every((st) => viewedStoryIds.has(st.id))),
    [otherGroups, viewedStoryIds]
  );

  const openCreator = (mode: 'picker' | 'text' | 'camera' = 'picker') => {
    if (!currentUser?.id) {
      toast.info('Please log in to share a Status!');
      navigate('/login');
      return;
    }
    setCreatorMode(mode);
    setCreatorOpen(true);
  };

  const openPrivacySettings = () => {
    if (!currentUser?.id) {
      navigate('/login');
      return;
    }
    setPrivacyModalOpen(true);
  };

  const openGroupViewer = (groupUserId: string) => {
    const idx = groups.findIndex((g) => g.userId === groupUserId);
    if (idx < 0) return;
    setViewerGroupIndex(idx);
    setViewerOpen(true);
  };

  const savedPrivacy = getSavedStatusPrivacy(currentUser?.id);

  // ==============================================================
  // VARIANT 1: INBOX STATUS UPDATES LIST VIEW (inside /messages)
  // ==============================================================
  if (variant === 'list') {
    const ownLatest = ownGroup?.stories?.[ownGroup.stories.length - 1];
    const ownViewsTotal = ownGroup
      ? ownGroup.stories.reduce((acc, s) => acc + (s.story_views?.length || 0), 0)
      : 0;

    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-5">
        {/* My Status Row */}
        <div className="bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200/80 dark:border-blue-900/40 rounded-2xl p-3">
          <div className="flex items-center gap-3">
            <div
              onClick={() => (ownGroup ? openGroupViewer(ownGroup.userId) : openCreator('picker'))}
              className="relative cursor-pointer shrink-0"
            >
              {ownGroup ? (
                <SegmentedStatusRing
                  count={ownGroup.stories.length}
                  viewedFlags={ownGroup.stories.map(() => false)}
                  size={56}
                >
                  <ProfileAvatar
                    userId={currentUser?.id}
                    defaultAvatar={currentUser?.avatar_url}
                    name={currentUser?.display_name || 'Me'}
                    className="w-full h-full object-cover"
                  />
                </SegmentedStatusRing>
              ) : (
                <div className="relative">
                  <ProfileAvatar
                    userId={currentUser?.id}
                    defaultAvatar={currentUser?.avatar_url}
                    name={currentUser?.display_name || 'Me'}
                    className="w-13 h-13 rounded-full object-cover border-2 border-white dark:border-zinc-800 shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCreator('picker');
                    }}
                    className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#1877F2] text-white border-2 border-white dark:border-black flex items-center justify-center shadow"
                  >
                    <Plus size={14} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>

            <div
              onClick={() => (ownGroup ? openGroupViewer(ownGroup.userId) : openCreator('picker'))}
              className="flex-1 min-w-0 cursor-pointer"
            >
              <p className="font-black text-sm text-gray-900 dark:text-white truncate">
                My Status
              </p>
              {ownGroup && ownLatest ? (
                <p className="text-xs text-[#1877F2] dark:text-blue-400 font-semibold truncate flex items-center gap-1.5 mt-0.5">
                  <span>
                    {ownGroup.stories.length} active •{' '}
                    {formatRemainingStatusTime(ownLatest.expires_at_ms)}
                  </span>
                  {ownViewsTotal > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-gray-500 dark:text-gray-400">
                      • <Eye size={11} /> {ownViewsTotal}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                  Tap to add photo, video or text status (up to 7 days)
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => openCreator('text')}
                className="p-2 rounded-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:text-[#1877F2] transition-colors"
                title="Text Status"
              >
                <Type size={16} />
              </button>
              <button
                type="button"
                onClick={() => openCreator('camera')}
                className="p-2 rounded-full bg-[#1877F2] text-white hover:bg-blue-600 transition-colors shadow-sm"
                title="Camera Status"
              >
                <Camera size={16} />
              </button>
            </div>
          </div>

          <div className="mt-2.5 pt-2 border-t border-blue-200/60 dark:border-blue-900/30 flex items-center justify-between text-[11px]">
            <button
              type="button"
              onClick={openPrivacySettings}
              className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 font-bold hover:underline"
            >
              <Lock size={11} />
              Privacy:{' '}
              {getPrivacySummaryLabel(
                savedPrivacy.visibility,
                savedPrivacy.allowed_user_ids.length,
                savedPrivacy.excluded_user_ids.length
              )}
            </button>
            <button
              type="button"
              onClick={() => openCreator('picker')}
              className="text-[#1877F2] dark:text-blue-400 font-black hover:underline"
            >
              + New Status
            </button>
          </div>
        </div>

        {/* Recent Updates */}
        {recentUpdates.length > 0 && (
          <div className="space-y-1.5">
            <p className="px-1 text-[11px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Recent Updates ({recentUpdates.length})
            </p>
            {recentUpdates.map((grp) => {
              const latest = grp.stories[grp.stories.length - 1];
              return (
                <div
                  key={grp.userId}
                  onClick={() => openGroupViewer(grp.userId)}
                  className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-gray-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                >
                  <SegmentedStatusRing
                    count={grp.stories.length}
                    viewedFlags={grp.stories.map((st) => viewedStoryIds.has(st.id))}
                    size={54}
                  >
                    <ProfileAvatar
                      userId={grp.user.id}
                      defaultAvatar={grp.user.avatar_url}
                      name={grp.user.display_name}
                      className="w-full h-full object-cover"
                    />
                  </SegmentedStatusRing>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-bold text-sm text-gray-900 dark:text-white truncate">
                        {grp.user.display_name}
                      </p>
                      {grp.user.is_verified && <VerifiedBadge size={13} />}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                      <span>{formatRelativeStatusTime(latest.created_at_ms)}</span>
                      <span>•</span>
                      <span className="text-[#1877F2] dark:text-blue-400 font-semibold">
                        {formatRemainingStatusTime(latest.expires_at_ms)}
                      </span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Viewed Updates */}
        {viewedUpdates.length > 0 && (
          <div className="space-y-1.5">
            <p className="px-1 text-[11px] font-black uppercase tracking-wider text-gray-400">
              Viewed Updates ({viewedUpdates.length})
            </p>
            {viewedUpdates.map((grp) => {
              const latest = grp.stories[grp.stories.length - 1];
              return (
                <div
                  key={grp.userId}
                  onClick={() => openGroupViewer(grp.userId)}
                  className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-gray-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors opacity-85"
                >
                  <SegmentedStatusRing
                    count={grp.stories.length}
                    viewedFlags={grp.stories.map(() => true)}
                    size={54}
                  >
                    <ProfileAvatar
                      userId={grp.user.id}
                      defaultAvatar={grp.user.avatar_url}
                      name={grp.user.display_name}
                      className="w-full h-full object-cover"
                    />
                  </SegmentedStatusRing>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <p className="font-bold text-sm text-gray-700 dark:text-gray-200 truncate">
                        {grp.user.display_name}
                      </p>
                      {grp.user.is_verified && <VerifiedBadge size={13} />}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {formatRelativeStatusTime(latest.created_at_ms)} •{' '}
                      {formatRemainingStatusTime(latest.expires_at_ms)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && otherGroups.length === 0 && (
          <div className="text-center py-8 px-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
              No active friend or public statuses right now.
            </p>
            <button
              type="button"
              onClick={() => openCreator('picker')}
              className="mt-3 px-4 py-2 rounded-full bg-[#1877F2] hover:bg-blue-600 text-white text-xs font-black shadow-sm"
            >
              Share First Status
            </button>
          </div>
        )}

        {/* Modals */}
        {creatorOpen && (
          <Suspense fallback={null}>
            <StatusCreatorModal
              isOpen={creatorOpen}
              initialMode={creatorMode}
              onClose={() => setCreatorOpen(false)}
              onCreated={() => refetch()}
            />
          </Suspense>
        )}
        <StatusViewerModal
          isOpen={viewerOpen}
          groups={groups}
          initialGroupIndex={viewerGroupIndex}
          viewedStoryIds={viewedStoryIds}
          onClose={() => setViewerOpen(false)}
          onStoryViewed={markStoryViewed}
          onAddStatus={() => openCreator('picker')}
          onRefresh={() => refetch()}
        />
        <StatusPrivacyModal
          isOpen={privacyModalOpen}
          currentUserId={currentUser?.id || ''}
          initialVisibility={savedPrivacy.visibility}
          initialAllowedIds={savedPrivacy.allowed_user_ids}
          initialExcludedIds={savedPrivacy.excluded_user_ids}
          onClose={() => setPrivacyModalOpen(false)}
          onSave={(cfg) => {
            if (currentUser?.id) {
              saveStatusPrivacy(currentUser.id, cfg);
              toast.success('Default status privacy saved!');
            }
            setPrivacyModalOpen(false);
          }}
        />
      </div>
    );
  }

  // Fallback compact ribbon variant (blue theme, no Sparkles)
  return (
    <div className="bg-white dark:bg-black rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-3.5">
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1877F2]" />
          <h3 className="font-black text-sm text-gray-900 dark:text-white tracking-tight">
            Status Updates
          </h3>
          {otherGroups.length > 0 && (
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-[#1877F2] dark:text-blue-300 border border-blue-200/70 dark:border-blue-900/50">
              {otherGroups.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {currentUser && (
            <button
              type="button"
              onClick={openPrivacySettings}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-gray-100 dark:bg-zinc-900 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-800 transition-colors"
              title="Status Privacy"
            >
              <Lock size={11} className="text-[#1877F2]" />
              {getPrivacySummaryLabel(
                savedPrivacy.visibility,
                savedPrivacy.allowed_user_ids.length,
                savedPrivacy.excluded_user_ids.length
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => openCreator('text')}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-[#1877F2] dark:text-blue-300 border border-blue-200/70 dark:border-blue-900/40 hover:bg-blue-100 transition-colors"
          >
            <Type size={11} />
            Text
          </button>
          <button
            type="button"
            onClick={() => openCreator('picker')}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black bg-[#1877F2] hover:bg-blue-600 text-white transition-all shadow-sm"
          >
            <Plus size={12} strokeWidth={3} />
            Add Status
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3.5 overflow-x-auto pb-1 scrollbar-hide px-1">
        <div className="flex flex-col items-center w-[72px] shrink-0">
          <div className="relative">
            <button
              type="button"
              onClick={() =>
                ownGroup ? openGroupViewer(ownGroup.userId) : openCreator('picker')
              }
              className="focus:outline-none group"
            >
              {ownGroup ? (
                <SegmentedStatusRing
                  count={ownGroup.stories.length}
                  viewedFlags={ownGroup.stories.map(() => false)}
                  size={64}
                >
                  <ProfileAvatar
                    userId={currentUser?.id}
                    defaultAvatar={currentUser?.avatar_url}
                    name={currentUser?.display_name || 'Me'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </SegmentedStatusRing>
              ) : (
                <div className="w-16 h-16 rounded-full p-0.5 border-2 border-dashed border-[#1877F2] flex items-center justify-center bg-blue-50/40 dark:bg-blue-950/20">
                  <ProfileAvatar
                    userId={currentUser?.id}
                    defaultAvatar={currentUser?.avatar_url}
                    name={currentUser?.display_name || 'Me'}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openCreator('picker');
              }}
              className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[#1877F2] text-white border-2 border-white dark:border-black flex items-center justify-center shadow-md hover:scale-110 transition-transform"
              title="Add Status"
            >
              <Plus size={14} strokeWidth={3} />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] font-bold text-gray-800 dark:text-gray-200 truncate w-full text-center">
            {ownGroup ? `My (${ownGroup.stories.length})` : 'My Status'}
          </p>
        </div>

        {otherGroups.map((grp) => {
          const latest = grp.stories[grp.stories.length - 1];
          const isVideo = latest.media_type === 'video';
          const isText = latest.media_type === 'text';

          return (
            <button
              key={grp.userId}
              type="button"
              onClick={() => openGroupViewer(grp.userId)}
              className="flex flex-col items-center w-[72px] shrink-0 group focus:outline-none"
            >
              <div className="relative">
                <SegmentedStatusRing
                  count={grp.stories.length}
                  viewedFlags={grp.stories.map((st) => viewedStoryIds.has(st.id))}
                  size={64}
                >
                  <ProfileAvatar
                    userId={grp.user.id}
                    defaultAvatar={grp.user.avatar_url}
                    name={grp.user.display_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </SegmentedStatusRing>

                {(isVideo || isText) && (
                  <span
                    className={`absolute bottom-0 right-0 px-1.5 py-0.5 rounded-full text-[9px] font-black border border-white dark:border-black shadow-sm ${
                      isVideo
                        ? 'bg-[#1877F2] text-white'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {isVideo ? <Video size={9} /> : 'Aa'}
                  </span>
                )}
              </div>
              <p
                className={`mt-1.5 text-[11px] truncate w-full text-center ${
                  grp.hasUnviewed
                    ? 'font-black text-gray-900 dark:text-white'
                    : 'font-semibold text-gray-500 dark:text-gray-400'
                }`}
              >
                {grp.user.display_name.split(' ')[0]}
              </p>
              <span className="text-[9px] font-bold text-[#1877F2] dark:text-blue-400">
                {formatRemainingStatusTime(latest.expires_at_ms)}
              </span>
            </button>
          );
        })}

        {!isLoading && otherGroups.length === 0 && (
          <div
            onClick={() => openCreator('picker')}
            className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-gray-50 dark:bg-zinc-900/70 border border-dashed border-gray-200 dark:border-zinc-800 cursor-pointer hover:border-[#1877F2] transition-colors self-center"
          >
            <CircleDot size={16} className="text-[#1877F2] shrink-0" />
            <div className="text-left">
              <p className="text-xs font-bold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                Share a Photo, Video or Text Status
              </p>
              <p className="text-[10px] text-gray-500 whitespace-nowrap">
                Custom privacy • Auto-deletes 24h to 7 days
              </p>
            </div>
          </div>
        )}
      </div>

      {creatorOpen && (
        <Suspense fallback={null}>
          <StatusCreatorModal
            isOpen={creatorOpen}
            initialMode={creatorMode}
            onClose={() => setCreatorOpen(false)}
            onCreated={() => refetch()}
          />
        </Suspense>
      )}
      <StatusViewerModal
        isOpen={viewerOpen}
        groups={groups}
        initialGroupIndex={viewerGroupIndex}
        viewedStoryIds={viewedStoryIds}
        onClose={() => setViewerOpen(false)}
        onStoryViewed={markStoryViewed}
        onAddStatus={() => openCreator('picker')}
        onRefresh={() => refetch()}
      />
      <StatusPrivacyModal
        isOpen={privacyModalOpen}
        currentUserId={currentUser?.id || ''}
        initialVisibility={savedPrivacy.visibility}
        initialAllowedIds={savedPrivacy.allowed_user_ids}
        initialExcludedIds={savedPrivacy.excluded_user_ids}
        onClose={() => setPrivacyModalOpen(false)}
        onSave={(cfg) => {
          if (currentUser?.id) {
            saveStatusPrivacy(currentUser.id, cfg);
            toast.success('Default status privacy saved!');
          }
          setPrivacyModalOpen(false);
        }}
      />
    </div>
  );
};
