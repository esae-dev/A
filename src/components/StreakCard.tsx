import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Completion, Routine } from '../domain/types';
import { addDays, dayOfWeek } from '../domain/dates';
import { calculateStreak, getCellState } from '../domain/streak';
import { recordReferenceDate } from '../domain/routines';
import { Icon } from './Icon';

const copy = {
  ko: { current: '현재 연속', longest: '최장 연속', count: '회', completed: '완료', missed: '미완료', off: '비대상일', future: '예정', history: '최근 26주 기록', weekdays: ['일', '월', '화', '수', '목', '금', '토'], finished: '완료 기록', started: '시작일', finishDate: '마무리일', total: '총 완료 일수', days: '일', finishedHistory: '마무리일 기준 26주 기록', afterFinish: '마무리 이후' },
  en: { current: 'Current streak', longest: 'Best streak', count: '', completed: 'Done', missed: 'Not done', off: 'Not scheduled', future: 'Upcoming', history: 'Last 26 weeks', weekdays: ['S', 'M', 'T', 'W', 'T', 'F', 'S'], finished: 'Completed record', started: 'Started', finishDate: 'Finished', total: 'Completed days', days: 'days', finishedHistory: '26 weeks ending on finish date', afterFinish: 'After finish' },
};

export function StreakCard({ routine, completions, today, language }: { routine: Routine; completions: Completion[]; today: string; language: 'ko' | 'en' }) {
  const t = copy[language];
  const finished = Boolean(routine.finishedAt);
  const through = recordReferenceDate(routine, today);
  const scroll = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState<number>();
  const [firstWeek, setFirstWeek] = useState(0);
  const pitch = useRef(17);
  const records = useMemo(() => completions.filter(item => item.routineId === routine.id), [completions, routine.id]);
  const streak = useMemo(() => calculateStreak(routine, records, through), [routine, records, through]);
  const weeks = useMemo(() => {
    const firstDay = addDays(through, -dayOfWeek(through) - 25 * 7);
    return Array.from({ length: 26 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(firstDay, week * 7 + day)));
  }, [through]);
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
  }, [through, graphWidth]);
  const monthFormat = new Intl.DateTimeFormat(language, { month: 'short' });
  const dateFormat = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const shortDateFormat = new Intl.DateTimeFormat(language, { year: 'numeric', month: 'short', day: 'numeric' });
  const historyLabel = finished ? t.finishedHistory : t.history;
  function dateObject(date: string) { const [year, month, day] = date.split('-').map(Number); return new Date(year, month - 1, day, 12); }

  return <article className={`streak-card${finished ? ' is-finished' : ''}`} style={{ '--routine-color': routine.color } as CSSProperties} data-through-date={through}>
    {finished && <p className="finished-status"><Icon name="check" size={14} />{t.finished}</p>}
    <h2 className="streak-routine-name"><span className="routine-color-dot" />{routine.name}</h2>
    {finished && <dl className="finished-dates">
      <div><dt>{t.started}</dt><dd><time dateTime={routine.createdDate}>{shortDateFormat.format(dateObject(routine.createdDate))}</time></dd></div>
      <div><dt>{t.finishDate}</dt><dd><time dateTime={through}>{shortDateFormat.format(dateObject(through))}</time></dd></div>
    </dl>}
    <div className="streak-stats">
      <div><span className="streak-stat-label">{finished ? t.total : t.current}</span><p className={`streak-value ${finished ? 'total' : 'current'}`}>{finished ? streak.total : streak.current}<span>{finished ? t.days : t.count}</span></p></div>
      <div><span className="streak-stat-label">{t.longest}</span><p className="streak-value longest">{streak.longest}<span>{finished && language === 'en' ? t.days : t.count}</span></p></div>
    </div>
    <div className="heatmap-caption">{historyLabel}</div>
    <div className="heatmap-layout">
      <div className="heatmap-weekdays" aria-hidden="true">{t.weekdays.map((label, index) => <span key={index}>{index % 2 === 1 ? label : ''}</span>)}</div>
      <div className="heatmap-viewport" ref={viewport}>
      <div className="heatmap-scroll" ref={scroll} style={{ width: graphWidth }} tabIndex={0} aria-label={historyLabel} onScroll={event => setFirstWeek(Math.ceil(event.currentTarget.scrollLeft / pitch.current))}>
        <div className="heatmap-content">
        <div className="heatmap-months" aria-hidden="true">{weeks.map((week, index) => {
          const month = week[0].slice(0, 7);
          const nextMonthSoon = weeks.slice(index + 1, index + 3).some(next => next[0].slice(0, 7) !== month);
          // Keep the first visible month readable; avoid overlapping a nearby change.
          const show = index >= firstWeek && ((index === firstWeek && !nextMonthSoon) || (index > firstWeek && month !== weeks[index - 1][0].slice(0, 7)));
          return <span key={week[0]}>{show ? monthFormat.format(dateObject(week[0])) : ''}</span>;
        })}</div>
        <div className="heatmap-grid">{weeks.map(week => <div className="heatmap-week" key={week[0]}>{week.map(date => {
          const state = getCellState(routine, records, date, through);
          const label = `${dateFormat.format(dateObject(date))}: ${state === 'future' && finished ? t.afterFinish : t[state]}`;
          return <span key={date} className={`heatmap-cell ${state}${date === through ? finished ? ' is-finish-date' : ' is-today' : ''}`} title={label} role="img" aria-label={label} />;
        })}</div>)}</div>
        </div>
      </div>
      </div>
    </div>
    <div className="heatmap-legend">{(['completed', 'missed', 'off', 'future'] as const).map(state => <span key={state}><i className={`heatmap-cell ${state}`} aria-hidden="true" />{state === 'future' && finished ? t.afterFinish : t[state]}</span>)}</div>
  </article>;
}
