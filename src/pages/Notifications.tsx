import React, { useEffect } from 'react';
import { Bell, Heart, MessageSquare, UserPlus, Eye, MessageCircle, Check, CheckCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, orderBy, limit } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import { fetchProfilesBatchSmart, migrateUserMessagesOnce } from '@/lib/profileSync';
import { useGlobalStore } from '@/store/useGlobalStore';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { formatTime, getSafeMessagePreview } from '@/lib/utils';

const Notifications: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!currentUser?.id) return;
    migrateUserMessagesOnce(currentUser.id)
      .then((changed) => {
        if (changed) queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.id] });
      })
      .catch(() => {});
  }, [currentUser?.id, queryClient]);

  const { data: notifications = [], isLoading: loading } = useQuery({
    queryKey: ['notifications', currentUser?.id],
    queryFn: async () => {
      if (!currentUser) return [];

      let notifs: any[] = [];
      try {
        const qNotifs = query(
          collection(db, 'notifications'),
          where('user_id', '==', currentUser.id),
          orderBy('created_at', 'desc'),
          limit(50)
        );
        const notifsSnap = await getDocs(qNotifs);
        notifs = notifsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any);
      } catch {
        try {
          const fallbackQ = query(
            collection(db, 'notifications'),
            where('user_id', '==', currentUser.id),
            limit(50)
          );
          const snap = await getDocs(fallbackQ);
          notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }) as any);
        } catch {}
      }

      const locallyReadIds = new Set<string>(
        JSON.parse(localStorage.getItem('read_msg_ids_' + currentUser.id) || '[]')
      );

      const { data: supaUnreadMsgs } = await supabase
        .from('messages')
        .select('*')
        .eq('receiver_id', currentUser.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);

      const unreadMsgs = (supaUnreadMsgs || []).filter(
        (msg: any) =>
          !msg.deleted_for_everyone &&
          !(msg.deleted_for || []).includes(currentUser.id) &&
          !locallyReadIds.has(msg.id)
      );

      const validNotifs = notifs || [];
      const validMsgs = unreadMsgs || [];

      const msgSenders = new Set();
      const msgNotifs: any[] = [];

      validMsgs.forEach((msg: any) => {
        if (!msgSenders.has(msg.sender_id)) {
          msgSenders.add(msg.sender_id);
          msgNotifs.push({
            id: `msg-${msg.id}`,
            type: 'message',
            sender_id: msg.sender_id,
            created_at: msg.created_at,
            is_read: false,
            real_msg_id: msg.id,
            content: getSafeMessagePreview(msg)
          });
        }
      });

      const combined = [...validNotifs, ...msgNotifs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 50);

      if (combined.length === 0) return [];

      const senderIds = [...new Set(combined.map(n => n.sender_id).filter(Boolean))] as string[];
      if (senderIds.length > 0) {
        const profileMap = await fetchProfilesBatchSmart(senderIds);
        return combined.map(n => ({
          ...n,
          sender: profileMap.get(n.sender_id) || null
        }));
      }

      return combined;
    },
    enabled: !!currentUser,
    staleTime: 5000,
    gcTime: 60000,
  });

  const markMessageReadInSupabaseAndStore = async (msgId: string) => {
    if (!currentUser?.id) return;
    await supabase.from('messages').update({ is_read: true }).eq('id', msgId);
    const key = 'read_msg_ids_' + currentUser.id;
    const list: string[] = JSON.parse(localStorage.getItem(key) || '[]');
    if (!list.includes(msgId)) {
      list.push(msgId);
      localStorage.setItem(key, JSON.stringify(list.slice(-100)));
    }
    const store = useGlobalStore.getState();
    const updatedMessages = store.messages.map(m => (m.id === msgId ? { ...m, is_read: true } : m));
    const unreadCount = updatedMessages.filter(
      m =>
        m.is_read === false &&
        m.receiver_id === currentUser.id &&
        m.sender_id !== currentUser.id &&
        !m.deleted_for_everyone &&
        !(m.deleted_for || []).includes(currentUser.id)
    ).length;
    useGlobalStore.setState({ messages: updatedMessages, unreadMessagesCount: unreadCount });
  };

  const markAsRead = async (item: any) => {
    try {
      if (item?.real_msg_id) {
        await markMessageReadInSupabaseAndStore(item.real_msg_id);
      } else if (item?.id && !item.id.toString().startsWith('msg-')) {
        await updateDoc(doc(db, 'notifications', item.id), { is_read: true }).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ['notifications', currentUser?.id] });
    } catch (e) {}
  };

  const markAllAsRead = async () => {
    if (!currentUser?.id) return;
    try {
      const qNotifs = query(collection(db, 'notifications'), where('user_id', '==', currentUser.id), where('is_read', '==', false));
      const [notifsSnap, supaUnreadRes] = await Promise.all([
        getDocs(qNotifs).catch(() => null),
        supabase
          .from('messages')
          .select('id')
          .eq('receiver_id', currentUser.id)
          .eq('is_read', false)
      ]);
      const updates: Promise<any>[] = [];
      if (notifsSnap && !notifsSnap.empty) {
        notifsSnap.docs.forEach(d => updates.push(updateDoc(doc(db, 'notifications', d.id), { is_read: true }).catch(() => {})));
      }
      const unreadMsgIds = (supaUnreadRes?.data || []).map((m: any) => m.id);
      if (unreadMsgIds.length > 0) {
        updates.push(
          Promise.resolve(
            supabase
              .from('messages')
              .update({ is_read: true })
              .eq('receiver_id', currentUser.id)
              .eq('is_read', false)
          ).catch(() => {})
        );
        const key = 'read_msg_ids_' + currentUser.id;
        const list: string[] = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([...new Set([...list, ...unreadMsgIds])].slice(-100)));

        const store = useGlobalStore.getState();
        const updatedMessages = store.messages.map(m =>
          m.receiver_id === currentUser.id ? { ...m, is_read: true } : m
        );
        useGlobalStore.setState({ messages: updatedMessages, unreadMessagesCount: 0 });
      }
      await Promise.all(updates);
      queryClient.invalidateQueries({ queryKey: ['notifications', currentUser.id] });
    } catch (e) {
      console.warn('markAllAsRead warning:', e);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'like': return <Heart className="text-red-500" size={20} />;
      case 'comment': return <MessageSquare className="text-blue-500" size={20} />;
      case 'friend_request': return <UserPlus className="text-green-500" size={20} />;
      case 'friend_accept': return <CheckCircle className="text-blue-500" size={20} />;
      case 'story_view': return <Eye className="text-purple-500" size={20} />;
      case 'message': return <MessageCircle className="text-yellow-500" size={20} />;
      default: return <Bell className="text-gray-500" size={20} />;
    }
  };

  const getMessage = (n: any) => {
    const name = n.sender?.display_name || n.sender_name || 'Someone';
    const username = n.sender?.username || n.sender_username;
    const usernameTag = username ? ` (@${username})` : '';
    const userLabel = `${name}${usernameTag}`;

    switch (n.type) {
      case 'like': return <><span className="font-bold">{userLabel}</span> liked your post.</>;
      case 'comment': return <><span className="font-bold">{userLabel}</span> commented on your post{n.content ? `: "${n.content.slice(0, 35)}"` : '.'}</>;
      case 'friend_request': return <><span className="font-bold">{userLabel}</span> sent you a friend request.</>;
      case 'friend_accept': return <><span className="font-bold">{userLabel}</span> accepted your friend request.</>;
      case 'story_view': return <><span className="font-bold">{userLabel}</span> viewed your story.</>;
      case 'message': return <><span className="font-bold">{userLabel}</span>: {getSafeMessagePreview(n)}</>;
      default: return <><span className="font-bold">{userLabel}</span> interacted with you.</>;
    }
  };

  const handleNotificationClick = async (n: any) => {
    if (n.real_msg_id) {
      try {
        await markMessageReadInSupabaseAndStore(n.real_msg_id);
      } catch (_) {}
    } else if (!n.id.toString().startsWith('msg-')) {
      try {
        await updateDoc(doc(db, 'notifications', n.id), { is_read: true }).catch(() => {});
      } catch (_) {}
    }
    queryClient.invalidateQueries({ queryKey: ['notifications', currentUser?.id] });

    if (n.type === 'friend_request' || n.type === 'friend_accept') navigate('/friends');
    else if (n.type === 'message') navigate(`/messages?user=${n.sender_id}`, { state: { userId: n.sender_id } });
    else if (n.type === 'story_view') navigate('/');
    else if (n.post_id) navigate(`/post/${n.post_id}`);
    else navigate(`/profile/${currentUser?.username || currentUser?.id}`);
  };

  return (
    <div className="max-w-[800px] mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white">Notifications</h1>
        {notifications.some((n: any) => !n.is_read) && (
          <button onClick={markAllAsRead} className="text-[#1877F2] font-bold hover:underline flex items-center gap-1">
            <Check size={18} /> Mark all as read
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-center p-10 text-gray-500 font-bold animate-pulse">Loading notifications...</div>
      ) : notifications.length === 0 ? (
        <div className="text-center p-20 bg-white dark:bg-black rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <Bell size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500 font-bold text-lg">No notifications yet.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-black rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
          {notifications.map((n: any) => (
            <div 
              key={n.id} 
              onClick={() => handleNotificationClick(n)}
              className={`p-4 border-b border-gray-100 dark:border-gray-800 flex items-start gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ${!n.is_read ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
            >
              <div className="relative">
                <ProfileAvatar userId={n.sender_id} defaultAvatar={n.sender?.avatar_url} name={n.sender?.display_name} className="w-12 h-12 rounded-full object-cover" />
                <div className="absolute -bottom-1 -right-1 bg-white dark:bg-black rounded-full p-0.5 shadow-sm">
                  {getIcon(n.type)}
                </div>
              </div>
              <div className="flex-1">
                <p className="text-gray-900 dark:text-gray-100">{getMessage(n)}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">{formatTime(n.created_at, { showYear: true })}</p>
              </div>
              {!n.is_read && <div className="w-3 h-3 bg-[#1877F2] rounded-full mt-2" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
