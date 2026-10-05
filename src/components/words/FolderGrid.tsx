import React from 'react';
import { Folder } from '../../types';
import { Button } from '../ui/Button';
import { FolderCard, UngroupedCard } from './FolderCard';

interface FolderGridProps {
  folders: Folder[];
  ungroupedCount: number;
  loading: boolean;
  onOpenFolder: (folderId: string, folderName: string) => void;
  onNewFolder: () => void;
  onAddWord: () => void;
  onEditFolder: (e: React.MouseEvent, folder: Folder) => void;
  onDeleteFolder: (e: React.MouseEvent, folder: Folder) => void;
}

export function FolderGrid({
  folders,
  ungroupedCount,
  loading,
  onOpenFolder,
  onNewFolder,
  onAddWord,
  onEditFolder,
  onDeleteFolder,
}: FolderGridProps) {
  return (
    <div className="py-8 space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Words</h1>
          <p className="text-sm text-surface-500 mt-1">Organize your vocabulary into folders</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onNewFolder}>New Folder</Button>
          <Button onClick={onAddWord}>Add Word</Button>
        </div>
      </div>

      {/* Folder Grid */}
      {loading && folders.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-surface-100/60 rounded-2xl border border-surface-200" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onClick={() => onOpenFolder(folder.id, folder.name)}
              onEdit={(e) => onEditFolder(e, folder)}
              onDelete={(e) => onDeleteFolder(e, folder)}
            />
          ))}

          <UngroupedCard
            count={ungroupedCount}
            onClick={() => onOpenFolder('ungrouped', 'Ungrouped')}
          />
        </div>
      )}
    </div>
  );
}
