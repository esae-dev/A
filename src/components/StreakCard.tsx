import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Completion, Routine } from '../domain/types';
import { addDays, dayOfWeek } from '../domain/dates';
import { calculateStreak, getCellState } from '../domain/streak';

const copy = {
  ko: { current: '현재 연속', longest: '최장 연속', count: '회', completed: '완료', missed: '미완료', off: '비대상일', future: '예정', history: '최근 26주 기록', weekdays: ['일', '월', '화', '수', '목', '금', '토'] },
  en: { current: 'Current streak', longest: 'Best streak', count: '', completed: 'Done', missed: 'Not done', off: 'Not scheduled', future: 'Upcoming', history: 'Last 26 weeks', weekdays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'] },
};

export function StreakCard({ routine, completions, today, language }: { routine: Routine; completions: Completion[]; today: string; language: 'ko' | 'en' }) {
  const t = copy[language];
  const scroll = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState<number>();
  const [firstWeek, setFirstWeek] = useState(0);
  const pitch = useRef(17);
  const records = useMemo(() => completions.filter(item => item.routineId === routine.id), [completions, routine.id]);
  const streak = useMemo(() => calculateStreak(routine, records, today), [routine, records, today]);
  const weeks = useMemo(() => {
    const firstDay = addDays(today, -dayOfWeek(today) - 25 * 7);
    return Array.from({ length: 26 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(firstDay, week * 7 + day)));
  }, [today]);
  useEffect(() => {
    const available = viewport.current;
    const element = scroll.current;
    if (!available || !element) return;
    const fit = () => {
      const style = getComputedStyle(element);
      const cell = parseFloat(style.getPropertyValue('--heatmap-cell'));
      const gap = parseFloat(style.getPropertyValue('--heatmap-gap'));
      pitch.current = cell + gap;
      // Include two pixels of clearance at both ends for today's outline.
      const count = Math.max(1, Math.min(26, Math.floor((available.clientWidth - 4 + gap) / pitch.current)));
      setGraphWidth(count * pitch.current - gap + 4);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(available);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = scroll.current;
    if (!element || graphWidth === undefined) return;
    element.scrollLeft = element.scrollWidth - element.clientWidth;
    setFirstWeek(Math.round(element.scrollLeft / pitch.current));
  }, [today, graphWidth]);
  const monthFormat = new Intl.DateTimeFormat(language, { month: 'short' });
  const dateFormat = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  function dateObject(date: string) { const [year, month, day] = date.split('-').map(Number); return new Date(year, month - 1, day, 12); }

  return <article className="streak-card" style={{ '--routine-color': routine.color } as CSSProperties}>
    <h2 className="streak-routine-name"><span className="routine-color-dot" />{routine.name}</h2>
    <div className="streak-stats">
      <div><span className="streak-stat-label">{t.current}</span><p className="streak-value current">{streak.current}<span>{t.count}</span></p></div>
      <div><span className="streak-stat-label">{t.longest}</span><p className="streak-value">{streak.longest}<span>{t.count}</span></p></div>
    </div>
    <div className="heatmap-caption">{t.history}</div>
    <div className="heatmap-layout">
      <div className="heatmap-weekdays" aria-hidden="true">{t.weekdays.map((label, index) => <span key={index}>{index % 2 === 1 ? label : ''}</span>)}</div>
      <div className="heatmap-viewport" ref={viewport}>
      <div className="heatmap-scroll" ref={scroll} style={{ width: graphWidth }} tabIndex={0} aria-label={t.history} onScroll={event => setFirstWeek(Math.ceil(event.currentTarget.scrollLeft / pitch.current))}>
        <div className="heatmap-content">
        <div className="heatmap-months" aria-hidden="true">{weeks.map((week, index) => {
          const month = week[0].slice(0, 7);
          const nextMonthSoon = weeks.slice(index + 1, index + 3).some(next => next[0].slice(0, 7) !== month);
          // Keep the first visible month readable; avoid overlapping a nearby change.
          const show = index >= firstWeek && ((index === firstWeek && !nextMonthSoon) || (index > firstWeek && month !== weeks[index - 1][0].slice(0, 7)));
          return <span key={week[0]}>{show ? monthFormat.format(dateObject(week[0])) : ''}</span>;
        })}</div>
        <div className="heatmap-grid">{weeks.map(week => <div className="heatmap-week" key={week[0]}>{week.map(date => {
          const state = getCellState(routine, records, date, today);
          const label = `${dateFormat.format(dateObject(date))}: ${t[state]}`;
          return <span key={date} className={`heatmap-cell ${state}${date === today ? ' is-today' : ''}`} title={label} role="img" aria-label={label} />;
        })}</div>)}</div>
        </div>
      </div>
      </div>
    </div>
    <div className="heatmap-legend">{(['completed', 'missed', 'off', 'future'] as const).map(state => <span key={state}><i className={`heatmap-cell ${state}`} aria-hidden="true" />{t[state]}</span>)}</div>
  </article>;
}
