import React from 'react';
import { Folder } from '../../types';

interface FolderCardProps {
  folder: Folder;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function FolderCard({ folder, onClick, onEdit, onDelete }: FolderCardProps) {
  return (
    <button
      onClick={onClick}
      className="group relative bg-card transition-colors duration-200 rounded-2xl shadow-sm border border-surface-100 p-5 text-left transition-shadow hover:shadow-md"
    >
      {/* Color accent — left border */}
      <div
        className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
        style={{ backgroundColor: folder.color }}
      />

      {/* Edit / Delete icons (top right, visible on hover) */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <span
          onClick={onEdit}
          className="p-1.5 rounded-md hover:bg-surface-100 text-surface-400 hover:text-surface-700 transition-colors cursor-pointer"
          title="Edit folder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </span>
        <span
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-surface-400 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
          title="Delete folder"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </span>
      </div>

      <div className="pl-3">
        <h3 className="text-base font-semibold text-surface-900 mb-1">{folder.name}</h3>
        <p className="text-sm text-surface-400">{folder.wordCount} {folder.wordCount === 1 ? 'word' : 'words'}</p>
      </div>
    </button>
  );
}

interface UngroupedCardProps {
  count: number;
  onClick: () => void;
}

export function UngroupedCard({ count, onClick }: UngroupedCardProps) {
  return (
    <button
      onClick={onClick}
      className="relative bg-card transition-colors duration-200 rounded-2xl shadow-sm border border-dashed border-surface-200 p-5 text-left transition-shadow hover:shadow-md"
    >
      <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-surface-300" />
      <div className="pl-3">
        <h3 className="text-base font-semibold text-surface-500 mb-1">Ungrouped</h3>
        <p className="text-sm text-surface-400">{count} {count === 1 ? 'word' : 'words'}</p>
      </div>
    </button>
  );
}
