'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { auth } from '../src/lib/firebase'; // Retaining Firebase Auth
import { Send, Loader2 } from 'lucide-react';

/**
 * ChatWindow Component (Supabase Realtime + Firebase Auth)
 * 
 * @param {Object} props
 * @param {string} props.recipientId - Firebase UID of the chat partner
 * @param {string} [props.recipientName] - Display name of the chat partner
 * @param {string} [props.recipientAvatar] - Avatar URL of the chat partner
 */
export default function ChatWindow({ recipientId, recipientName = 'User', recipientAvatar = '' }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const channelRef = useRef(null);

  // Get currently logged-in Firebase user
  const currentUser = auth.currentUser;
  const currentUserId = currentUser?.uid;

  // Auto-scroll to bottom of message list
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  }, []);

  // 1. Fetch initial message history from Supabase
  useEffect(() => {
    if (!currentUserId || !recipientId) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchMessages = async () => {
      try {
        const { data, error: fetchErr } = await supabase
          .from('messages')
          .select('*')
          .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${recipientId}),and(sender_id.eq.${recipientId},receiver_id.eq.${currentUserId})`)
          .order('created_at', { ascending: true });

        if (fetchErr) {
          console.error('Error fetching chat history from Supabase:', fetchErr);
          if (isMounted) setError('Failed to load messages.');
        } else if (isMounted) {
          setMessages(data || []);
          setTimeout(() => scrollToBottom(false), 100);
        }
      } catch (err) {
        console.error('Unexpected error fetching messages:', err);
        if (isMounted) setError('Network error loading chat.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchMessages();

    // 2. Setup Supabase Realtime Channel for Postgres Changes and Broadcast (Typing)
    const channelId = `chat:${[currentUserId, recipientId].sort().join(':')}`;
    const channel = supabase.channel(channelId, {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: currentUserId },
      },
    });

    // Listen to new incoming messages (Postgres INSERT changes)
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const newMsg = payload.new;
          // Filter to ensure message belongs to the current conversation
          if (
            (newMsg.sender_id === currentUserId && newMsg.receiver_id === recipientId) ||
            (newMsg.sender_id === recipientId && newMsg.receiver_id === currentUserId)
          ) {
            setMessages((prev) => {
              // Avoid duplicate if already optimistically added
              if (prev.some((m) => m.id === newMsg.id || (m.tempId && m.text === newMsg.text && m.sender_id === newMsg.sender_id))) {
                return prev.map((m) =>
                  m.id === newMsg.id || (m.tempId && m.text === newMsg.text && m.sender_id === newMsg.sender_id)
                    ? newMsg
                    : m
                );
              }
              return [...prev, newMsg];
            });
            setTimeout(() => scrollToBottom(true), 50);
          }
        }
      )
      // Listen to broadcast typing indicator events
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.sender_id === recipientId) {
          setIsTyping(payload.payload.isTyping);
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to Supabase Realtime channel: ${channelId}`);
        }
      });

    channelRef.current = channel;

    return () => {
      isMounted = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [currentUserId, recipientId, scrollToBottom]);

  // Handle typing broadcast
  const handleTyping = (text) => {
    setInputText(text);

    if (!channelRef.current || !currentUserId) return;

    // Send typing broadcast event
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender_id: currentUserId, isTyping: true },
    });

    // Debounce stop typing event after 2.5 seconds
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'typing',
          payload: { sender_id: currentUserId, isTyping: false },
        });
      }
    }, 2500);
  };

  // 3. Send message function (Inserts directly to Supabase with Firebase UID)
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !currentUserId || !recipientId || sending) return;

    setSending(true);
    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const optimisticMessage = {
      id: tempId,
      tempId,
      sender_id: currentUserId,
      receiver_id: recipientId,
      text: trimmed,
      created_at: timestamp,
    };

    // Optimistic UI update
    setMessages((prev) => [...prev, optimisticMessage]);
    setInputText('');
    setTimeout(() => scrollToBottom(true), 20);

    // Cancel typing broadcast immediately upon send
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { sender_id: currentUserId, isTyping: false },
      });
    }

    try {
      const { data, error: insertErr } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUserId,
          receiver_id: recipientId,
          text: trimmed,
          created_at: timestamp,
        })
        .select()
        .single();

      if (insertErr) {
        console.error('Supabase message insert error:', insertErr);
        setError('Failed to deliver message.');
      } else if (data) {
        // Replace optimistic message with actual row from Supabase
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId || m.tempId === tempId ? data : m))
        );
      }
    } catch (err) {
      console.error('Unexpected error inserting message:', err);
      setError('Message delivery failed.');
    } finally {
      setSending(false);
    }
  };

  const formatMessageTime = (dateString) => {
    if (!dateString) return '';
    try {
      const d = new Date(dateString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {recipientAvatar ? (
            <img
              src={recipientAvatar}
              alt={recipientName}
              className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              {recipientName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm sm:text-base leading-tight">
              {recipientName}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isTyping ? (
                <span className="text-blue-600 dark:text-blue-400 font-medium animate-pulse">
                  typing...
                </span>
              ) : (
                'Supabase Realtime Chat'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-gray-50/30 dark:bg-gray-900/30">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
            <Loader2 className="animate-spin" size={24} />
            <span className="text-xs">Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-center px-4">
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Send a message to start chatting with {recipientName}.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === currentUserId;
            return (
              <div
                key={msg.id || msg.tempId}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] sm:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm break-words shadow-sm ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-gray-700/60 rounded-bl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 px-1">
                  {formatMessageTime(msg.created_at)}
                </span>
              </div>
            );
          })
        )}

        {/* Live typing indicator bubble */}
        {isTyping && (
          <div className="flex items-center gap-1.5 bg-gray-200 dark:bg-gray-800 px-3 py-2 rounded-2xl rounded-bl-none w-fit text-gray-500 text-xs">
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"></span>
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
            <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Notice */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-4 py-1.5 text-xs text-center border-t border-red-100 dark:border-red-900">
          {error}
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center gap-2"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => handleTyping(e.target.value)}
          placeholder={`Message ${recipientName}...`}
          disabled={!currentUserId || sending}
          className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-full text-sm outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-gray-400"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || !currentUserId || sending}
          className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-full transition-colors flex items-center justify-center shadow-md active:scale-95"
          aria-label="Send message"
        >
          {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}
