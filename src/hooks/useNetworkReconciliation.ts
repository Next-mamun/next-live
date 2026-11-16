import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGlobalStore } from '@/store/useGlobalStore';
import { localDB } from '@/lib/dexie';
import { dualWriteMessage } from '@/lib/dbHelper';
import { toast } from 'sonner';

export const useNetworkReconciliation = (userId?: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    let syncInProgress = false;

    const handleOnline = async () => {
      toast.success('Internet reconnected. Syncing data...');

      if (syncInProgress) return;
      syncInProgress = true;

      try {
        // 1. Re-flush any unsynced or partially-synced offline messages from Dexie
        const unsyncedMessages = await localDB.messages
          .filter((m: any) =>
            m.synced === false ||
            m.firebase_synced === false ||
            m.supabase_synced === false ||
            m.status === 'failed' ||
            m.status === 'pending'
          )
          .toArray();

        if (unsyncedMessages.length > 0) {
          console.log(`[Offline Sync] Found ${unsyncedMessages.length} unsynced messages to retry.`);
          for (const msg of unsyncedMessages) {
            try {
              await dualWriteMessage(msg);
            } catch (err) {
              console.warn('[Offline Sync] Retry failed for message:', msg.id, err);
            }
          }
        }

        // 2. Refresh query caches and re-establish real-time listeners
        queryClient.invalidateQueries();
        if (userId) {
          useGlobalStore.getState().initMessageListener(userId);
          useGlobalStore.getState().initNotificationListener(userId);
        }
      } catch (err) {
        console.warn('[Offline Sync] Error during reconciliation:', err);
      } finally {
        syncInProgress = false;
      }
    };

    const handleOffline = () => {
      toast.warning('You are offline. Messages will be stored locally.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient, userId]);
};
