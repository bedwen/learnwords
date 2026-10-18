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

      <div className="pl-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-border/40"
            style={{ backgroundColor: `${folder.color}18` }}
          >
            <FolderIcon className="h-5 w-5" style={{ color: folder.color }} />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold text-foreground tracking-tight line-clamp-1">
              {folder.name}
            </h3>
            <Badge variant="secondary" className="text-xs font-normal">
              {folder.wordCount} {folder.wordCount === 1 ? 'word' : 'words'}
            </Badge>
          </div>
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

      <div className="pl-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-border/40 bg-secondary/80 text-muted-foreground">
            <FolderArchive className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold text-muted-foreground tracking-tight">
              Ungrouped
            </h3>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              {count} {count === 1 ? 'word' : 'words'}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}

interface TrashCardProps {
  count: number;
  onClick: () => void;
}

export function TrashCard({ count, onClick }: TrashCardProps) {
  return (
    <Card
      onClick={onClick}
      className="group relative border-dashed border-border bg-card/60 p-5 text-left transition-all duration-200 hover:shadow-md hover:border-destructive/40 cursor-pointer overflow-hidden"
    >
      <div
        className={`absolute left-0 top-3 bottom-3 w-1.5 rounded-r-full transition-colors ${
          count > 0 ? 'bg-destructive/60' : 'bg-muted-foreground/30'
        }`}
      />

      <div className="pl-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-border/40 transition-colors ${
              count > 0 ? 'bg-destructive/10 text-destructive' : 'bg-secondary/80 text-muted-foreground'
            }`}
          >
            <Trash2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-base font-semibold text-foreground tracking-tight">
              Trash Bin
            </h3>
            <Badge
              variant={count > 0 ? 'secondary' : 'outline'}
              className={`text-xs font-normal ${
                count > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'
              }`}
            >
              {count} deleted {count === 1 ? 'word' : 'words'}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
}
