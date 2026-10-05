import { Button } from '../ui/Button';

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
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-2rem)] bg-card border border-surface-200 shadow-xl rounded-2xl px-5 py-3.5 flex flex-wrap items-center gap-4 transition-colors duration-200"
    >
      <span className="text-sm font-medium text-surface-700 bg-surface-50 border border-surface-100 rounded-full px-3 py-1 whitespace-nowrap">
        {selectedCount} {selectedCount === 1 ? 'word' : 'words'} selected
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <Button id="batch-change-level" variant="secondary" onClick={onChangeLevel} disabled={disabled}>
          Change Level
        </Button>
        <Button id="batch-add-to-folder" variant="secondary" onClick={onAddToFolder} disabled={disabled}>
          Add to Folder
        </Button>
        {canRemoveFromFolder && (
          <Button id="batch-remove-from-folder" variant="secondary" onClick={onRemoveFromFolder} disabled={disabled}>
            Remove from Folder
          </Button>
        )}
        <Button id="batch-delete" variant="danger" onClick={onDelete} disabled={disabled}>
          Delete
        </Button>
        <button
          id="batch-clear-selection"
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="text-sm text-surface-400 hover:text-surface-900 px-2 transition-colors disabled:opacity-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
