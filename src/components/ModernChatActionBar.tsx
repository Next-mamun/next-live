import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Archive, ArchiveRestore, Trash2, Ban, Flag, Users } from 'lucide-react';

interface ModernChatActionBarProps {
  selectedCount: number;
  isArchivedView: boolean;
  onClear: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  onCreateGroup?: () => void;
}

export const ModernChatActionBar: React.FC<ModernChatActionBarProps> = ({
  selectedCount,
  isArchivedView,
  onClear,
  onArchive,
  onDelete,
  onBlock,
  onReport,
  onCreateGroup
}) => {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex items-center justify-between px-4 py-2 mb-3 bg-white/95 dark:bg-[#1E293B]/95 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/80 shadow-lg shadow-black/5 rounded-2xl z-20"
        >
          {/* Left: Counter & Clear */}
          <div className="flex items-center gap-3">
            <button
              onClick={onClear}
              className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors cursor-pointer"
              title="Cancel Selection"
              aria-label="Cancel Selection"
            >
              <X size={18} />
            </button>
            <span className="text-sm font-black tracking-tight text-gray-900 dark:text-white">
              {selectedCount} <span className="font-semibold text-gray-500">selected</span>
            </span>
          </div>

          {/* Right: Modern Actions */}
          <div className="flex items-center gap-1">
            {selectedCount === 1 && onReport && (
              <button
                onClick={onReport}
                className="p-2 rounded-xl text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors cursor-pointer"
                title="Report"
              >
                <Flag size={18} />
              </button>
            )}

            {selectedCount === 1 && onBlock && (
              <button
                onClick={onBlock}
                className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                title="Block User"
              >
                <Ban size={18} />
              </button>
            )}

            {selectedCount >= 1 && onCreateGroup && (
              <button
                onClick={onCreateGroup}
                className="p-2 rounded-xl text-[#1877F2] hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
                title="New Group with Selected"
              >
                <Users size={18} />
              </button>
            )}

            {/* Archive / Unarchive */}
            <button
              onClick={onArchive}
              className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
              title={isArchivedView ? "Unarchive Selected" : "Archive Selected"}
            >
              {isArchivedView ? <ArchiveRestore size={18} /> : <Archive size={18} />}
            </button>

            {/* Delete */}
            <button
              onClick={onDelete}
              className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
              title="Delete Selected"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
