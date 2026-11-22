import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { StatusGroup, fetchActiveStatusGroups } from '@/services/statusService';

const sessionViewedIds = new Set<string>();

export const markStatusViewedGlobally = (storyId: string) => {
  if (!storyId) return;
  if (sessionViewedIds.has(storyId)) return;
  sessionViewedIds.add(storyId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('next_status_viewed', { detail: { storyId } }));
  }
};

export const useActiveStatuses = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [viewedTick, setViewedTick] = useState(0);

  const queryKey = useMemo(
    () => ['active_statuses', currentUser?.id || 'guest'],
    [currentUser?.id]
  );

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchActiveStatusGroups(currentUser?.id),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const onUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ['active_statuses'] });
    };
    const onViewed = () => {
      setViewedTick((t) => t + 1);
    };
    window.addEventListener('next_status_updated', onUpdated);
    window.addEventListener('next_status_viewed', onViewed);
    return () => {
      window.removeEventListener('next_status_updated', onUpdated);
      window.removeEventListener('next_status_viewed', onViewed);
    };
  }, [queryClient]);

  const viewedStoryIds = useMemo(() => {
    const set = new Set<string>(data?.viewedStoryIds ? Array.from(data.viewedStoryIds) : []);
    sessionViewedIds.forEach((id) => set.add(id));
    return set;
  }, [data?.viewedStoryIds, viewedTick]);

  const groups: StatusGroup[] = useMemo(() => {
    const raw = data?.groups || [];
    return raw.map((grp) => ({
      ...grp,
      hasUnviewed: !grp.isOwn && grp.stories.some((st) => !viewedStoryIds.has(st.id)),
    }));
  }, [data?.groups, viewedStoryIds]);

  const groupByUserId = useMemo(() => {
    const map = new Map<string, StatusGroup>();
    groups.forEach((grp) => {
      if (grp.userId && grp.stories.length > 0) {
        map.set(grp.userId, grp);
      }
    });
    return map;
  }, [groups]);

  const markStoryViewed = useCallback((storyId: string) => {
    markStatusViewedGlobally(storyId);
  }, []);

  return {
    groups,
    groupByUserId,
    viewedStoryIds,
    isLoading,
    markStoryViewed,
    refetch,
  };
};
