import { useEffect, useState } from 'react';
import { DashboardSummary } from '../types';
import { getDashboardSummary } from '../api/dashboard';
import { Button } from '../components/ui/Button';

export function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardSummary()
      .then(setSummary)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="py-20 text-center text-surface-500">Loading...</div>;
  }

  if (!summary) {
    return <div className="py-20 text-center text-red-500">Failed to load data.</div>;
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'A1': return 'bg-teal-100 text-teal-900 border-teal-200';
      case 'A2': return 'bg-indigo-100 text-indigo-900 border-indigo-200';
      case 'B1': return 'bg-blue-100 text-blue-900 border-blue-200';
      case 'B2': return 'bg-green-100 text-green-900 border-green-200';
      case 'C1': return 'bg-orange-100 text-orange-900 border-orange-200';
      case 'C2': return 'bg-purple-100 text-purple-900 border-purple-200';
      default: return 'bg-surface-100 text-surface-900 border-surface-200';
    }
  };

  return (
    <div className="py-12 flex flex-col items-center">
      
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-surface-900 mb-2">LearnWords</h1>
        <p className="text-lg text-surface-500">
          {summary.totalWords.toLocaleString()} words
        </p>
      </div>

      {/* CEFR Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 w-full max-w-5xl mb-16">
        {summary.cefrDistribution.map((stat) => (
          <div 
            key={stat.level} 
            className={`rounded-2xl p-6 border shadow-sm flex flex-col justify-between ${getLevelColor(stat.level)}`}
          >
            <h2 className="text-4xl font-bold mb-4">{stat.level}</h2>
            <div>
              <p className="font-medium opacity-80">{stat.totalWords} words</p>
              <p className="text-sm opacity-70 mt-1">{stat.masteredWords} mastered</p>
            </div>
          </div>
        ))}
      </div>

      {/* Action Area */}
      <div className="flex flex-col items-center space-y-4">
        <Button 
          variant="secondary" 
          className="text-lg px-8 py-3 rounded-full border-surface-300 shadow-sm"
          onClick={() => onNavigate('study')}
        >
          Start Studying
        </Button>
        <p className="text-sm text-surface-400">
          {summary.dueForReview > 0 
            ? `${summary.dueForReview} words due for review.` 
            : 'No words due for review, but you can study anyway.'}
        </p>
      </div>

    </div>
  );
}
