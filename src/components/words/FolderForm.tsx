import React, { useState } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Folder } from '../../types';

const PRESET_COLORS = [
  '#94a3b8', // slate gray
  '#f87171', // soft red
  '#fb923c', // soft orange
  '#fbbf24', // amber
  '#a3e635', // lime
  '#34d399', // emerald
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
];

interface FolderFormProps {
  initialData?: Folder;
  onSubmit: (data: { name: string; color: string }) => Promise<void>;
  onCancel: () => void;
}

export function FolderForm({ initialData, onSubmit, onCancel }: FolderFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(initialData?.name || '');
  const [color, setColor] = useState(initialData?.color || PRESET_COLORS[0]);
  const [showCustom, setShowCustom] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Folder name is required');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), color });
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Input
        label="Folder Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        placeholder="e.g. Business English"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-surface-700">Color</label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { setColor(c); setShowCustom(false); }}
              className="w-8 h-8 rounded-lg border-2 transition-all"
              style={{
                backgroundColor: c,
                borderColor: color === c && !showCustom ? '#1e293b' : 'transparent',
                transform: color === c && !showCustom ? 'scale(1.1)' : 'scale(1)',
              }}
              title={c}
            />
          ))}
          <button
            type="button"
            onClick={() => setShowCustom(!showCustom)}
            className="w-8 h-8 rounded-lg border-2 border-dashed border-surface-300 flex items-center justify-center text-surface-400 hover:border-surface-400 transition-colors text-xs"
            title="Custom color"
          >
            +
          </button>
        </div>
        {showCustom && (
          <div className="flex items-center gap-3 mt-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-10 h-8 rounded border border-surface-200 cursor-pointer"
            />
            <span className="text-xs text-surface-500">{color}</span>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-surface-100">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : initialData ? 'Save Changes' : 'Create Folder'}
        </Button>
      </div>
    </form>
  );
}
