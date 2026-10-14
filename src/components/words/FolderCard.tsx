import React from 'react';
import { Folder as FolderIcon, Pencil, Trash2, FolderArchive } from 'lucide-react';
import { Folder } from '../../types';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

interface FolderCardProps {
  folder: Folder;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function FolderCard({ folder, onClick, onEdit, onDelete }: FolderCardProps) {
  return (
    <Card
      onClick={onClick}
      className="group relative border-border bg-card p-5 text-left transition-all duration-200 hover:shadow-md hover:border-primary/40 cursor-pointer overflow-hidden"
    >
      {/* Color accent pill indicator */}
      <div
        className="absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full"
        style={{ backgroundColor: folder.color }}
      />

      {/* Edit / Delete action icons (visible on hover) */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          title="Edit folder"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          title="Delete folder"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="pl-3 space-y-2">
        <div className="flex items-center gap-2">
          <FolderIcon className="h-4 w-4 shrink-0" style={{ color: folder.color }} />
          <h3 className="text-base font-semibold text-foreground tracking-tight line-clamp-1">
            {folder.name}
          </h3>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Badge variant="secondary" className="text-xs font-normal">
            {folder.wordCount} {folder.wordCount === 1 ? 'word' : 'words'}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

interface UngroupedCardProps {
  count: number;
  onClick: () => void;
}

export function UngroupedCard({ count, onClick }: UngroupedCardProps) {
  return (
    <Card
      onClick={onClick}
      className="group relative border-dashed border-border bg-card/60 p-5 text-left transition-all duration-200 hover:shadow-md hover:border-primary/40 cursor-pointer overflow-hidden"
    >
      <div className="absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full bg-muted-foreground/40" />

      <div className="pl-3 space-y-2">
        <div className="flex items-center gap-2">
          <FolderArchive className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h3 className="text-base font-semibold text-muted-foreground tracking-tight">
            Ungrouped
          </h3>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            {count} {count === 1 ? 'word' : 'words'}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
