import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Clock,
  Award,
  TrendingUp,
  GraduationCap,
  Plus,
  ArrowRight,
  CalendarDays,
  Flame,
} from 'lucide-react';
import { ActivityDay, HomeSummary } from '../types';
import { getHomeSummary } from '../api/home';
import { getCached, setCached } from '../api/cache';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Progress } from '../components/ui/Progress';
import { Badge } from '../components/ui/Badge';

export function Home() {
  const navigate = useNavigate();
  const cachedSummary = getCached<HomeSummary>('home_summary') ?? getCached<HomeSummary>('dashboard_summary');
  const [summary, setSummary] = useState<HomeSummary | null>(cachedSummary);
  const [loading, setLoading] = useState(!cachedSummary);

  const loadHomeData = useCallback(() => {
    getHomeSummary()
      .then((data) => {
        setSummary(data);
        setCached('home_summary', data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadHomeData();
    window.addEventListener('learnwords:synced', loadHomeData);
    return () => window.removeEventListener('learnwords:synced', loadHomeData);
  }, [loadHomeData]);

  const { weeks, monthLabels } = useMemo(() => {
    if (!summary) return { weeks: [], monthLabels: [] };
    const days: ActivityDay[] = summary.activityDays ?? summary.reviewActivity ?? [];
    const weekList: ActivityDay[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      weekList.push(days.slice(i, i + 7));
    }

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels: { colIndex: number; label: string }[] = [];
    let lastLabeledMonth = -1;

    weekList.forEach((week, colIndex) => {
      for (const day of week) {
        if (day && day.date) {
          const [, mStr, dStr] = day.date.split('-');
          const m = parseInt(mStr, 10);
          const d = parseInt(dStr, 10);
          const monthIdx = m - 1;
          if (monthIdx !== lastLabeledMonth) {
            if (d <= 7 || (colIndex === 0 && d <= 14)) {
              labels.push({ colIndex, label: MONTHS[monthIdx] });
              lastLabeledMonth = monthIdx;
              break;
            }
          }
        }
      }
    });

    return { weeks: weekList, monthLabels: labels };
  }, [summary]);

  if (loading && !summary) {
    return (
      <div className="py-6 space-y-8 animate-pulse">
        <div className="h-44 rounded-2xl bg-card border border-border" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl bg-card border border-border" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:grid-flow-col lg:grid-rows-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-card border border-border" />
          ))}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="py-20 text-center">
        <p className="text-destructive font-medium">Failed to load home data.</p>
        <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const totalMastered = summary.cefrDistribution.reduce((acc, curr) => acc + curr.masteredWords, 0);
  const masteryRate = summary.totalWords > 0 ? Math.round((totalMastered / summary.totalWords) * 100) : 0;
  const activeDaysCount = summary.activeDaysLast90 ?? summary.activeDaysLastYear ?? summary.activeDaysLast60 ?? 0;
  const totalActivitiesCount = summary.totalContributionsLast90 ?? summary.totalContributionsLastYear ?? summary.totalReviewsLast60 ?? 0;

  const getLevelBorderClass = (level: string) => {
    switch (level) {
      case 'A1': return 'hover:border-rose-400/50';
      case 'A2': return 'hover:border-red-500/50';
      case 'B1': return 'hover:border-sky-500/50';
      case 'B2': return 'hover:border-blue-600/50';
      case 'C1': return 'hover:border-emerald-500/50';
      case 'C2': return 'hover:border-emerald-700/50';
      default: return 'hover:border-border';
    }
  };

  const getProgressColor = (level: string) => {
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

  const getHeatmapColor = (count: number) => {
    if (count === 0) {
      return 'bg-secondary/80 dark:bg-secondary/50 border border-border/60';
    }
    if (count <= 2) {
      return 'bg-emerald-800/20 dark:bg-emerald-400/20';
    }
    if (count <= 5) {
      return 'bg-emerald-800/45 dark:bg-emerald-400/45';
    }
    if (count <= 10) {
      return 'bg-emerald-800/70 dark:bg-emerald-400/70';
    }
    return 'bg-primary dark:bg-primary';
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const d = new Date(year, month - 1, day);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const getTooltipText = (day: ActivityDay) => {
    if (!day.date) return 'No activity';
    const formatted = formatDate(day.date);
    const activityWord = day.count === 1 ? 'activity' : 'activities';
    const reviewWord = day.reviews === 1 ? 'review' : 'reviews';
    const wordWord = day.wordsAdded === 1 ? 'word' : 'words';
    return `${day.count} ${activityWord} on ${formatted} (${day.reviews} ${reviewWord}, ${day.wordsAdded} ${wordWord} added)`;
  };

  return (
    <div className="py-4 space-y-8">
      {/* 2-Card 50/50 Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Card 1: Review Hub & Quick Action (50%) */}
        <Card className="relative overflow-hidden border-border bg-gradient-to-br from-card via-card to-secondary/30 flex flex-col justify-between p-6 sm:p-8">
          <div className="absolute right-0 top-0 -mt-10 -mr-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="space-y-4 relative z-10">
            {/* Optional Streak Badge */}
            {summary.currentStreak && summary.currentStreak > 0 ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 w-fit">
                <Flame className="h-3.5 w-3.5" />
                <span>{summary.currentStreak} day streak</span>
              </div>
            ) : null}

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {summary.dueForReview > 0 ? (
                  <span>{summary.dueForReview} {summary.dueForReview === 1 ? 'word' : 'words'} ready for review</span>
                ) : (
                  <span>Review queue is clear</span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">
                {summary.dueForReview > 0
                  ? 'Consistent daily reviews reinforce long-term memory.'
                  : 'Great job! Keep growing your vocabulary or practice anytime.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-6 relative z-10">
            <Button
              size="lg"
              className="h-12 flex-1 justify-center gap-2 rounded-2xl font-semibold shadow-xs"
              onClick={() => navigate('/study')}
            >
              <GraduationCap className="h-4 w-4" />
              <span>{summary.dueForReview > 0 ? 'Start Review' : 'Study Any Word'}</span>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 flex-1 justify-center gap-2 rounded-2xl"
              onClick={() => navigate('/words')}
            >
              <Plus className="h-4 w-4" />
              <span>Manage Words</span>
            </Button>
          </div>
        </Card>

        {/* Card 2: 90-Day Activity Calendar (50%) */}
        <Card className="border-border bg-card flex flex-col justify-between p-6 sm:p-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 pb-2 border-b border-border/40">
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                <CalendarDays className="h-3.5 w-3.5 text-primary" />
                <span>Activity Calendar</span>
                <span className="text-[11px] text-muted-foreground font-normal">(Past 90 Days)</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">
                  Active: <strong className="text-foreground font-medium">{activeDaysCount}/90 days</strong>
                </span>
                <span className="text-muted-foreground">
                  Total: <strong className="text-foreground font-medium">{totalActivitiesCount} {totalActivitiesCount === 1 ? 'activity' : 'activities'}</strong>
                </span>
              </div>
            </div>

            {/* Heatmap Grid (13-14 cols x 7 rows) */}
            <div className="pt-1 flex justify-center sm:justify-start overflow-x-auto pb-1">
              <div className="inline-flex gap-2 items-start">
                {/* Weekday Labels: Mon, Wed, Fri */}
                <div className="flex flex-col shrink-0 select-none pr-1">
                  {/* Top spacer matching month label row */}
                  <div className="h-3.5 mb-1" />
                  {/* 7 rows matching squares */}
                  <div className="flex flex-col gap-[3px]">
                    <div className="h-3 sm:h-3.5" />
                    <div className="h-3 sm:h-3.5 text-[9px] sm:text-[10px] text-muted-foreground leading-none flex items-center justify-end">Mon</div>
                    <div className="h-3 sm:h-3.5" />
                    <div className="h-3 sm:h-3.5 text-[9px] sm:text-[10px] text-muted-foreground leading-none flex items-center justify-end">Wed</div>
                    <div className="h-3 sm:h-3.5" />
                    <div className="h-3 sm:h-3.5 text-[9px] sm:text-[10px] text-muted-foreground leading-none flex items-center justify-end">Fri</div>
                    <div className="h-3 sm:h-3.5" />
                  </div>
                </div>

                {/* Calendar Columns Body */}
                <div className="flex flex-col">
                  {/* Month Headers Row */}
                  <div className="flex gap-[3px] mb-1">
                    {weeks.map((_, colIdx) => {
                      const labelObj = monthLabels.find((l) => l.colIndex === colIdx);
                      return (
                        <div key={colIdx} className="w-3 sm:w-3.5 relative h-3.5 shrink-0">
                          {labelObj && (
                            <span className="absolute left-0 top-0 text-[10px] text-muted-foreground whitespace-nowrap leading-none select-none">
                              {labelObj.label}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 13-14 Columns x 7 Rows Grid */}
                  <div className="flex gap-[3px]">
                    {weeks.map((week, colIdx) => (
                      <div key={colIdx} className="flex flex-col gap-[3px] shrink-0">
                        {week.map((day, rowIdx) => (
                          <div
                            key={day.date || `${colIdx}-${rowIdx}`}
                            title={getTooltipText(day)}
                            className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-[4px] transition-colors ${getHeatmapColor(day.count)}`}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground pt-3 border-t border-border/40 mt-4">
            <span>Less</span>
            <div className="w-2.5 h-2.5 rounded-[3px] bg-secondary/80 dark:bg-secondary/50 border border-border/60" />
            <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-800/20 dark:bg-emerald-400/20" />
            <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-800/45 dark:bg-emerald-400/45" />
            <div className="w-2.5 h-2.5 rounded-[3px] bg-emerald-800/70 dark:bg-emerald-400/70" />
            <div className="w-2.5 h-2.5 rounded-[3px] bg-primary dark:bg-primary" />
            <span>More</span>
          </div>
        </Card>
      </div>

      {/* KPI Overview Metrics — Unified Stat Ribbon */}
      <div className="rounded-2xl bg-secondary/45 border border-border/60 p-4 sm:p-6 grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:divide-x lg:divide-border/60">
        <div className="flex flex-col justify-between lg:first:pl-0 lg:pl-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Words
            </CardTitle>
            <div className="w-8 h-8 rounded-xl bg-card/80 border border-border/50 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              {summary.totalWords.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Active in your dictionary
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between lg:first:pl-0 lg:pl-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Due For Review
            </CardTitle>
            <div className="w-8 h-8 rounded-xl bg-card/80 border border-border/50 flex items-center justify-center">
              <Clock className={`h-4 w-4 ${summary.dueForReview > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              {summary.dueForReview.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.dueForReview > 0 ? 'Scheduled for today' : 'Up to date'}
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between lg:first:pl-0 lg:pl-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Mastered Words
            </CardTitle>
            <div className="w-8 h-8 rounded-xl bg-card/80 border border-border/50 flex items-center justify-center">
              <Award className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              {totalMastered.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Step 4 mastery achieved
            </p>
          </div>
        </div>

        <div className="flex flex-col justify-between lg:first:pl-0 lg:pl-6">
          <div className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Mastery Rate
            </CardTitle>
            <div className="w-8 h-8 rounded-xl bg-card/80 border border-border/50 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-foreground">
              {masteryRate}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Of all registered vocabulary
            </p>
          </div>
        </div>
      </div>

      {/* CEFR Level Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              CEFR Level Breakdown
            </h2>
            <p className="text-sm text-muted-foreground">
              Vocabulary distribution and mastery progress by difficulty level
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/words')}
          >
            <span>Explore all words</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 lg:grid-flow-col lg:grid-rows-2 gap-4">
          {summary.cefrDistribution.map((stat) => {
            const levelPercentage = stat.totalWords > 0
              ? Math.round((stat.masteredWords / stat.totalWords) * 100)
              : 0;

            return (
              <Card
                key={stat.level}
                className={`transition-all duration-200 hover:shadow-md cursor-pointer border-border ${getLevelBorderClass(stat.level)}`}
                onClick={() => navigate(`/words`)}
              >
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={stat.level} className="text-sm px-3 py-1 font-bold">
                      {stat.level}
                    </Badge>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {levelPercentage}% Mastered
                  </span>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-baseline justify-between pt-1">
                    <span className="text-2xl font-bold text-foreground">
                      {stat.totalWords}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {stat.masteredWords} mastered
                    </span>
                  </div>

                  <Progress
                    value={levelPercentage}
                    max={100}
                    className="h-1.5"
                    indicatorClassName={getProgressColor(stat.level)}
                  />

                  <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                    <span>{stat.totalWords === 1 ? '1 word' : `${stat.totalWords} words`}</span>
                    <span className="text-primary hover:underline font-medium inline-flex items-center gap-0.5">
                      View <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const Dashboard = Home;
export default Home;
