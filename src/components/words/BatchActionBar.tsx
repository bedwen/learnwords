import { Layers, FolderPlus, FolderMinus, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

interface BatchActionBarProps {
  selectedCount: number;
  canRemoveFromFolder: boolean;
  disabled?: boolean;
  onChangeLevel: () => void;
  onAddToFolder: () => void;
  onRemoveFromFolder: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BatchActionBar({
  selectedCount,
  canRemoveFromFolder,
  disabled = false,
  onChangeLevel,
  onAddToFolder,
  onRemoveFromFolder,
  onDelete,
  onClear,
}: BatchActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      id="batch-action-bar"
      role="toolbar"
      aria-label="Batch word actions"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-2xl px-5 py-3 flex flex-wrap items-center gap-3 animate-in fade-in-0 slide-in-from-bottom-4 duration-200"
    >
      <Badge variant="secondary" className="px-3 py-1 font-semibold text-xs whitespace-nowrap">
        {selectedCount} {selectedCount === 1 ? 'word' : 'words'} selected
      </Badge>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          id="batch-change-level"
          variant="secondary"
          size="sm"
          onClick={onChangeLevel}
          disabled={disabled}
          className="gap-1.5"
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Change Level</span>
        </Button>

        <Button
          id="batch-add-to-folder"
          variant="secondary"
          size="sm"
          onClick={onAddToFolder}
          disabled={disabled}
          className="gap-1.5"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          <span>Add to Folder</span>
        </Button>

        {canRemoveFromFolder && (
          <Button
            id="batch-remove-from-folder"
            variant="secondary"
            size="sm"
            onClick={onRemoveFromFolder}
            disabled={disabled}
            className="gap-1.5"
          >
            <FolderMinus className="h-3.5 w-3.5" />
            <span>Remove from Folder</span>
          </Button>
        )}

        <Button
          id="batch-delete"
          variant="danger"
          size="sm"
          onClick={onDelete}
          disabled={disabled}
          className="gap-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Delete</span>
        </Button>

        <Button
          id="batch-clear-selection"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground h-8 px-2 gap-1 text-xs"
        >
          <X className="h-3.5 w-3.5" />
          <span>Clear</span>
        </Button>
      </div>
    </div>
  );
}
