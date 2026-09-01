import { useEffect, useState } from 'react';
import { DetailedStats } from '../types';
import { getDetailedStats } from '../api/dashboard';
import { Badge } from '../components/ui/Badge';

export function Statistics() {
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDetailedStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-20 text-center text-surface-500">Loading...</div>;
  if (!stats) return <div className="py-20 text-center text-red-500">Failed to load data.</div>;

  return (
    <div className="py-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Statistics</h1>
        <p className="text-sm text-surface-500 mt-1">Overview of the learning process</p>
      </div>

      {/* Vocabulary and Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Vocabulary */}
        <div className="bg-white p-6 rounded-xl border border-surface-100 shadow-sm flex flex-col justify-center items-center text-center">
          <p className="text-surface-500 text-sm mb-2">Total Words</p>
          <p className="text-5xl font-bold text-surface-900">{stats.totalWords}</p>
        </div>

        {/* CEFR Distribution */}
        <div className="bg-white p-6 rounded-xl border border-surface-100 shadow-sm">
          <p className="text-surface-500 text-sm mb-4 font-medium">CEFR Distribution</p>
          <div className="space-y-3">
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(level => {
              const stat = stats.cefrDistribution.find(d => d.level === level);
              const count = stat ? stat.count : 0;
              const percentage = stats.totalWords > 0 ? (count / stats.totalWords) * 100 : 0;
              return (
                <div key={level} className="flex items-center text-sm">
                  <span className="w-8 font-medium text-surface-900">{level}</span>
                  <div className="flex-1 h-2 bg-surface-100 rounded-full mx-3 overflow-hidden">
                    <div className="h-full bg-blue-400 rounded-full" style={{ width: `${percentage}%` }} />
                  </div>
                  <span className="w-8 text-right text-surface-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mastery Distribution */}
        <div className="bg-white p-6 rounded-xl border border-surface-100 shadow-sm">
          <p className="text-surface-500 text-sm mb-4 font-medium">Learning Status</p>
          <div className="space-y-2">
            {[
              { label: 'New', val: 0, color: 'bg-surface-300' },
              { label: 'Learning', val: 1, color: 'bg-orange-300' },
              { label: 'Familiar', val: 2, color: 'bg-yellow-300' },
              { label: 'Strong', val: 3, color: 'bg-green-300' },
              { label: 'Mastered', val: 4, color: 'bg-emerald-500' }
            ].map(m => {
              const stat = stats.masteryDistribution.find(d => d.mastery === m.val);
              const count = stat ? stat.count : 0;
              const percentage = stats.totalWords > 0 ? (count / stats.totalWords) * 100 : 0;
              return (
                <div key={m.val} className="flex items-center text-sm">
                  <span className="w-20 text-surface-600 truncate">{m.label}</span>
                  <div className="flex-1 h-2 bg-surface-100 rounded-full mx-3 overflow-hidden">
                    <div className={`h-full ${m.color} rounded-full`} style={{ width: `${percentage}%` }} />
                  </div>
                  <span className="w-8 text-right text-surface-500">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl border border-surface-100 shadow-sm text-center">
          <p className="text-surface-500 text-sm mb-1">Total Reviews</p>
          <p className="text-3xl font-bold text-surface-900">{stats.totalReviews}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-surface-100 shadow-sm text-center">
          <p className="text-surface-500 text-sm mb-1">Correct Answers</p>
          <p className="text-3xl font-bold text-green-600">{stats.totalCorrect}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-surface-100 shadow-sm text-center">
          <p className="text-surface-500 text-sm mb-1">Wrong Answers</p>
          <p className="text-3xl font-bold text-red-600">{stats.totalWrong}</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-surface-100 shadow-sm text-center">
          <p className="text-surface-500 text-sm mb-1">Accuracy</p>
          <p className="text-3xl font-bold text-surface-900">{stats.accuracy}%</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* Recent Reviews */}
        <div className="bg-white rounded-xl border border-surface-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-100 bg-surface-50/50">
            <h2 className="font-semibold text-surface-900">Recent Reviews</h2>
          </div>
          <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
            {stats.recentReviews.length === 0 ? (
              <p className="p-6 text-center text-surface-500">No reviews yet.</p>
            ) : (
              stats.recentReviews.map((r, i) => (
                <div key={i} className="px-6 py-3 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-surface-900">{r.word}</span>
                    <Badge variant={r.level}>{r.level}</Badge>
                  </div>
                  <Badge variant={
                    r.rating === 'again' ? 'New' : 
                    r.rating === 'hard' ? 'Strong' : 
                    r.rating === 'good' ? 'Mastered' : 'Familiar' // Just mapped for color
                  }>
                    {r.rating}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Difficult Words */}
        <div className="bg-white rounded-xl border border-surface-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-surface-100 bg-surface-50/50">
            <h2 className="font-semibold text-surface-900">Difficult Words</h2>
          </div>
          <div className="divide-y divide-surface-100 max-h-96 overflow-y-auto">
            {stats.difficultWords.length === 0 ? (
              <p className="p-6 text-center text-surface-500">Great! No difficult words.</p>
            ) : (
              stats.difficultWords.map((w) => (
                <div key={w.id} className="px-6 py-3 flex justify-between items-center">
                  <div>
                    <p className="font-medium text-surface-900">{w.word}</p>
                    <p className="text-xs text-surface-500">{w.learning_state.wrong_count} wrong, {w.learning_state.correct_count} correct</p>
                  </div>
                  <Badge variant={w.level}>{w.level}</Badge>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
