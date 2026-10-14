import React from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';

interface WordsFilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  level: string;
  onLevelChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
}

export function WordsFilterBar({
  search,
  onSearchChange,
  level,
  onLevelChange,
  status,
  onStatusChange,
}: WordsFilterBarProps) {
  const hasActiveFilters = Boolean(search || level || status);

  const handleClearFilters = () => {
    onSearchChange('');
    onLevelChange('');
    onStatusChange('');
  };

  return (
    <div className="bg-card p-3 sm:p-4 rounded-xl shadow-xs border border-border">
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="flex-1 w-full relative">
          <Input
            placeholder="Search words, meanings, or notes..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-1/2 sm:w-40">
            <Select
              options={[
                { value: '', label: 'All Levels' },
                { value: 'A1', label: 'Level A1' },
                { value: 'A2', label: 'Level A2' },
                { value: 'B1', label: 'Level B1' },
                { value: 'B2', label: 'Level B2' },
                { value: 'C1', label: 'Level C1' },
                { value: 'C2', label: 'Level C2' },
              ]}
              value={level}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onLevelChange(e.target.value)}
            />
          </div>

          <div className="w-1/2 sm:w-40">
            <Select
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'New', label: 'New' },
                { value: 'Learning', label: 'Learning' },
                { value: 'Familiar', label: 'Familiar' },
                { value: 'Strong', label: 'Strong' },
                { value: 'Mastered', label: 'Mastered' },
              ]}
              value={status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onStatusChange(e.target.value)}
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilters}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0 h-9 px-2.5"
              title="Clear all filters"
            >
              <X className="h-4 w-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
