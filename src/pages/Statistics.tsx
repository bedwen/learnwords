import { useEffect, useState } from 'react';
import {
  Target,
  CheckCircle2,
  History,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import { DetailedStats } from '../types';
import { getDetailedStats } from '../api/home';
import { getCached, setCached } from '../api/cache';
import { Badge } from '../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Progress } from '../components/ui/Progress';

export function Statistics() {
  const cachedStats = getCached<DetailedStats>('detailed_stats');
  const [stats, setStats] = useState<DetailedStats | null>(cachedStats);
  const [loading, setLoading] = useState(!cachedStats);

  useEffect(() => {
    getDetailedStats()
      .then((data) => {
        setStats(data);
        setCached('detailed_stats', data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading && !stats) {
    return (
      <div className="py-6 max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-10 w-48 bg-card rounded-lg border border-border" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-card rounded-xl border border-border" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-72 bg-card rounded-xl border border-border" />
          <div className="h-72 bg-card rounded-xl border border-border" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="py-20 text-center text-destructive font-medium">
        Failed to load statistics.
      </div>
    );
  }

  const getRatingBadgeVariant = (rating: string) => {
    switch (rating) {
      case 'again': return 'destructive';
      case 'hard': return 'Strong';
      case 'good': return 'Mastered';
      case 'easy': return 'Familiar';
      default: return 'secondary';
    }
  };

  const getLevelProgressColor = (level: string) => {
    switch (level) {
      case 'A1': return 'bg-rose-400';
      case 'A2': return 'bg-red-500';
      case 'B1': return 'bg-sky-500';
      case 'B2': return 'bg-blue-600';
      case 'C1': return 'bg-emerald-500';
      case 'C2': return 'bg-emerald-700';
      default: return 'bg-primary';
    }
  };

  return (
    <div className="py-4 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Learning Statistics
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Detailed metrics, retention rates, and vocabulary development overview
        </p>
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Vocabulary
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalWords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered words</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Reviews
            </CardTitle>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalReviews.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Flashcard submissions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Review Accuracy
            </CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.accuracy}%</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalCorrect} correct · {stats.totalWrong} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Correct Ratio
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.totalReviews > 0 ? `${Math.round((stats.totalCorrect / stats.totalReviews) * 100)}%` : '0%'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Successful retention rate
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* CEFR Level Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">CEFR Level Distribution</CardTitle>
            <CardDescription>Breakdown across difficulty categories</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => {
              const stat = stats.cefrDistribution.find((d) => d.level === level);
              const count = stat ? stat.count : 0;
              const percentage = stats.totalWords > 0 ? Math.round((count / stats.totalWords) * 100) : 0;

              return (
                <div key={level} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant={level as any} className="text-2xs px-2 py-0">
                        {level}
                      </Badge>
                      <span className="font-medium text-foreground">{count} {count === 1 ? 'word' : 'words'}</span>
                    </div>
                    <span className="text-muted-foreground">{percentage}%</span>
                  </div>
                  <Progress
                    value={percentage}
                    max={100}
                    className="h-1.5"
                    indicatorClassName={getLevelProgressColor(level)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Mastery Progression Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Learning Status</CardTitle>
            <CardDescription>Progress through spaced repetition stages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'New', val: 0, color: 'bg-muted-foreground' },
              { label: 'Learning', val: 1, color: 'bg-purple-500' },
              { label: 'Familiar', val: 2, color: 'bg-blue-500' },
              { label: 'Strong', val: 3, color: 'bg-amber-500' },
              { label: 'Mastered', val: 4, color: 'bg-emerald-500' },
            ].map((m) => {
              const stat = stats.masteryDistribution.find((d) => d.mastery === m.val);
              const count = stat ? stat.count : 0;
              const percentage = stats.totalWords > 0 ? Math.round((count / stats.totalWords) * 100) : 0;

              return (
                <div key={m.val} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant={m.label as any} className="text-2xs px-2 py-0">
                        {m.label}
                      </Badge>
                      <span className="font-medium text-foreground">{count} {count === 1 ? 'word' : 'words'}</span>
                    </div>
                    <span className="text-muted-foreground">{percentage}%</span>
                  </div>
                  <Progress
                    value={percentage}
                    max={100}
                    className="h-1.5"
                    indicatorClassName={m.color}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Recent Reviews & Difficult Words */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Reviews */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Recent Reviews</CardTitle>
              <CardDescription>Latest flashcard review responses</CardDescription>
            </div>
            <History className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {stats.recentReviews.length === 0 ? (
                <p className="p-8 text-center text-xs text-muted-foreground">
                  No review activity recorded yet.
                </p>
              ) : (
                stats.recentReviews.map((r, i) => (
                  <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <span className="font-medium text-sm text-foreground">{r.word}</span>
                      <Badge variant={r.level} className="text-2xs px-1.5 py-0">
                        {r.level}
                      </Badge>
                    </div>
                    <Badge variant={getRatingBadgeVariant(r.rating) as any} className="capitalize text-xs font-semibold">
                      {r.rating}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Difficult Words */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">Difficult Words</CardTitle>
              <CardDescription>Vocabulary requiring extra attention</CardDescription>
            </div>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {stats.difficultWords.length === 0 ? (
                <div className="p-8 text-center space-y-1">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                  <p className="text-sm font-medium text-foreground">All clear!</p>
                  <p className="text-xs text-muted-foreground">No recurring review failures detected.</p>
                </div>
              ) : (
                stats.difficultWords.map((w) => (
                  <div key={w.id} className="px-5 py-3 flex items-center justify-between hover:bg-muted/40 transition-colors">
                    <div className="space-y-0.5">
                      <p className="font-medium text-sm text-foreground">{w.word}</p>
                      <p className="text-2xs text-muted-foreground">
                        <span className="text-destructive font-medium">{w.learning_state.wrong_count} failed</span> · {w.learning_state.correct_count} correct
                      </p>
                    </div>
                    <Badge variant={w.level} className="text-2xs px-2 py-0.5">
                      {w.level}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
