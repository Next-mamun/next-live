import { useGlobalStore } from '@/store/useGlobalStore';

import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Users, Settings, UserCircle, Home, MessageCircle, BookOpen, Tv } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { VerifiedBadge } from './VerifiedBadge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

const SidebarItem = React.memo<{ icon: React.ReactNode, label: string | React.ReactNode, to: string, badge?: number, onClick?: () => void }>(({ icon, label, to, badge, onClick }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link onClick={onClick} to={to} className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-[#e7f3ff] dark:bg-gray-800 text-[#1877F2] dark:text-blue-400' : 'hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}>
      <div className={`relative ${isActive ? 'text-[#1877F2]' : 'text-gray-500 dark:text-gray-400'}`}>
        {icon}
        {!!badge && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full border-2 border-white dark:border-black animate-in zoom-in duration-300">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      <span className="font-medium text-sm">{label}</span>
    </Link>
  );
});

const Sidebar: React.FC = () => {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  
  const messages = useGlobalStore((state) => state.messages);

  const totalUnread = useMemo(() => {
    if (!currentUser) return 0;
    const validMsgs = messages.filter(msg => {
      if (msg.is_read !== false) return false;
      if (msg.deleted_for_everyone || (msg.deleted_for || []).includes(currentUser.id)) return false;
      return true;
    });
    
    const uniqueSenders = new Set(validMsgs.map(msg => msg.sender_id));
    return uniqueSenders.size;
  }, [messages, currentUser]);

  return (
    <aside className="hidden lg:flex flex-col w-[360px] h-[calc(100vh-56px)] sticky top-14 p-2 overflow-y-auto scrollbar-hide">
      <SidebarItem 
        icon={<ProfileAvatar userId={currentUser?.id || ''} defaultAvatar={currentUser?.avatar_url} name={currentUser?.display_name} className="w-8 h-8 rounded-full object-cover" />} 
        label={
          <div className="flex items-center gap-1">
            {currentUser?.display_name || 'Profile'}
            {currentUser?.is_verified && <VerifiedBadge />}
          </div>
        } 
        to={`/profile/${currentUser?.username}`}
      />
      <SidebarItem icon={<Home size={24} />} label="Home" to="/" />
      <SidebarItem icon={<Users size={24} />} label="Friends" to="/friends" />
      <SidebarItem 
        icon={<MessageCircle size={24} />} 
        label="Messages" 
        to="/messages" 
        badge={totalUnread} 
        onClick={() => {
          localStorage.setItem('inbox_cleared_at', Date.now().toString());
          queryClient.setQueryData(['totalUnread'], 0);
        }}
      />
      <SidebarItem icon={<div className="relative p-1.5 rounded-xl bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500 text-white shadow-md shadow-pink-500/20"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z"/><path d="m6.2 5.3 3.1 3.9"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/></svg></div>} label={<span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 to-orange-500">Reels</span>} to="/reels" />
      <SidebarItem icon={<BookOpen size={24} className="text-blue-500" />} label="Lab (E-Books)" to="/lab" />
      <SidebarItem icon={<Tv size={24} className="text-purple-500" />} label="Watch Party" to="/cinema" />
      <SidebarItem icon={<Settings size={24} />} label="Settings" to="/settings" />

      <div className="mt-auto p-4 text-[13px] text-gray-500 dark:text-gray-400">
        <p>Privacy · Terms · Advertising · Cookies · Meta © 2024</p>
      </div>
    </aside>
  );
};

export default React.memo(Sidebar);
