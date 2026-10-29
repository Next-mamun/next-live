import React, { useState } from 'react';
import { useGlobalStore } from '@/store/useGlobalStore';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, db } from '@/lib/firebase';
import { 
  signInWithPopup, 
  signInWithRedirect, 
  GoogleAuthProvider 
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { generateBio } from '@/services/geminiService';
import { X, LogIn, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

export const AuthBottomSheet: React.FC = () => {
  const isAuthModalOpen = useGlobalStore((state) => state.isAuthModalOpen);
  const authModalMessage = useGlobalStore((state) => state.authModalMessage);
  const authModalAction = useGlobalStore((state) => state.authModalAction);
  const closeAuthModal = useGlobalStore((state) => state.closeAuthModal);
  const { setCurrentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isAuthModalOpen) return null;

  const currentPath = location.pathname + location.search;

  const handleSuccess = (user: any) => {
    setCurrentUser(user);
    closeAuthModal();
    toast.success(`Welcome to Next, ${user.display_name || user.username || 'friend'}!`);
    if (typeof authModalAction === 'function') {
      try {
        authModalAction();
      } catch (err) {
        console.error('Error executing pending action:', err);
      }
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      if (isStandalone) {
        await signInWithRedirect(auth, provider);
        return;
      }

      const result = await signInWithPopup(auth, provider);
      const uid = result.user.uid;

      try {
        const userDoc = await getDoc(doc(db, 'profiles', uid));
        if (!userDoc.exists()) {
          const emailUser = result.user.email?.split('@')[0] || uid.substring(0, 8);
          let bio = 'Hello! I am using Next.';
          try {
            bio = await generateBio(emailUser);
          } catch (e) {}

          const newProfile = {
            id: uid,
            username: emailUser,
            display_name: result.user.displayName || emailUser,
            email: result.user.email,
            bio,
            avatar_url: result.user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${emailUser}`,
            created_at: new Date().toISOString()
          };
          try {
            await setDoc(doc(db, 'profiles', uid), newProfile);
          } catch (e) {
            console.warn('Could not save profile directly (quota):', e);
          }
          handleSuccess(newProfile);
        } else {
          handleSuccess({ id: userDoc.id, ...userDoc.data() });
        }
      } catch (dbErr) {
        console.warn('Profile fetch error during Google auth:', dbErr);
        const emailUser = result.user.email?.split('@')[0] || uid.substring(0, 8);
        handleSuccess({
          id: uid,
          username: emailUser,
          display_name: result.user.displayName || emailUser,
          email: result.user.email,
          avatar_url: result.user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${emailUser}`
        });
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          const provider = new GoogleAuthProvider();
          await signInWithRedirect(auth, provider);
        } catch (e: any) {
          setError(e.message || 'Failed to authenticate with Google');
        }
      } else {
        setError(err.message || 'Google sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    closeAuthModal();
    navigate(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
  };

  const goToRegister = () => {
    closeAuthModal();
    navigate(`/register?returnUrl=${encodeURIComponent(currentPath)}`);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex flex-col justify-end sm:justify-center sm:items-center">
      {/* Dimmed backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
        onClick={() => !loading && closeAuthModal()}
      />

      {/* Sheet / Modal Container */}
      <div className="relative w-full sm:max-w-md bg-white dark:bg-[#121212] rounded-t-[28px] sm:rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden z-10 transition-transform duration-300 animate-in slide-in-from-bottom duration-300 flex flex-col">
        {/* Grab bar for mobile feel */}
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-3 sm:hidden" />

        {/* Close Button */}
        <button
          onClick={() => !loading && closeAuthModal()}
          className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors z-20"
        >
          <X size={18} />
        </button>

        {/* Content Body */}
        <div className="p-6 pt-5 text-center flex flex-col items-center">
          {/* Authentic Next Logo */}
          <img 
            src="https://i.postimg.cc/wxwt5tsk/retouch-2026030721254774.png" 
            alt="Next" 
            className="h-10 w-auto mb-3 drop-shadow-sm" 
          />

          <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            Join Next
          </h2>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-xs font-medium">
            {authModalMessage || 'Connect with friends and the world around you on Next.'}
          </p>

          {error && (
            <div className="w-full mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 rounded-xl text-red-600 dark:text-red-400 text-xs font-semibold">
              {error}
            </div>
          )}

          <div className="w-full flex flex-col gap-3 mt-6">
            {/* Direct to original Login Page */}
            <button
              type="button"
              onClick={goToLogin}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-[#1877F2] hover:bg-[#166fe5] text-white rounded-2xl font-bold text-sm tracking-wide shadow-md shadow-blue-500/20 transition-all active:scale-[0.98]"
            >
              <LogIn size={18} />
              Log In to Existing Account
            </button>

            {/* Direct to original Register Page */}
            <button
              type="button"
              onClick={goToRegister}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-2xl font-bold text-sm transition-all active:scale-[0.98]"
            >
              <UserPlus size={18} />
              Create New Account
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1" />
              <span className="text-[11px] font-bold text-gray-400">OR</span>
              <div className="h-px bg-gray-200 dark:bg-gray-800 flex-1" />
            </div>

            {/* 1-Tap Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-2xl font-bold text-sm text-gray-800 dark:text-gray-100 transition-all hover:bg-gray-50 dark:hover:bg-gray-750 active:scale-[0.98] shadow-sm disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              {loading ? 'Connecting Google...' : 'Continue with Google'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
