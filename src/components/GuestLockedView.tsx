import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, LogIn, Compass, ArrowLeft, UserPlus } from 'lucide-react';

interface GuestLockedViewProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
}

export const GuestLockedView: React.FC<GuestLockedViewProps> = ({ title, description, icon }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTarget = `${location.pathname}${location.search}${location.hash}`;
  const returnParam = currentTarget && currentTarget !== '/' ? `?returnUrl=${encodeURIComponent(currentTarget)}` : '';

  return (
    <div className="flex-1 w-full flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-3xl bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-100 dark:border-blue-900/50 flex items-center justify-center text-[#1877F2] shadow-xl shadow-blue-500/10">
          {icon || <Lock size={36} strokeWidth={2} />}
        </div>
      </div>

      <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight mb-2">
        {title}
      </h1>

      <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 max-w-sm mb-8 leading-relaxed font-normal">
        {description}
      </p>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          type="button"
          onClick={() => navigate(`/login${returnParam}`)}
          className="w-full flex items-center justify-center gap-2 py-3.5 px-6 bg-[#1877F2] hover:bg-[#166fe5] text-white rounded-2xl font-bold text-sm tracking-wide shadow-lg shadow-blue-500/25 transition-all active:scale-[0.98]"
        >
          <LogIn size={18} />
          Log In
        </button>

        <button
          type="button"
          onClick={() => navigate(`/register${returnParam}`)}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
        >
          <UserPlus size={18} />
          Create New Account
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          <Compass size={16} />
          Explore Feed
        </button>
      </div>

      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mt-6 flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
      >
        <ArrowLeft size={14} /> Go back
      </button>
    </div>
  );
};
