import { Input } from '../ui/Input';
import { Select } from '../ui/Select';

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
  return (
    <div className="bg-card transition-colors duration-200 p-4 rounded-xl shadow-sm border border-surface-100">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search word or meaning..."
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            options={[
              { value: '', label: 'All Levels' },
              { value: 'A1', label: 'A1' },
              { value: 'A2', label: 'A2' },
              { value: 'B1', label: 'B1' },
              { value: 'B2', label: 'B2' },
              { value: 'C1', label: 'C1' },
              { value: 'C2', label: 'C2' },
            ]}
            value={level}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onLevelChange(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
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
      </div>
    </div>
  );
}
