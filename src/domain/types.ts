import type { supportedLanguages, themes } from '../config';

/** A local calendar date, never a timestamp or a UTC-converted local date. */
export type DateKey = string;

/** JavaScript weekday numbering: Sunday = 0. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Category = 'other' | 'health' | 'learning' | 'mind' | 'life';
export type Language = typeof supportedLanguages[number]['value'];
export type Theme = typeof themes[number];

export interface ScheduleChange {
  effectiveFrom: DateKey;
  days: Weekday[];
}

export interface Routine {
  id: string;
  name: string;
  memo: string;
  category: Category;
  color: string;
  scheduleHistory: ScheduleChange[];
  /** Creation's local day is stored independently of the UTC audit timestamp. */
  createdDate: DateKey;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Completion {
  id: string;
  routineId: string;
  date: DateKey;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineInput {
  name: string;
  memo: string;
  category: Category;
  color: string;
  days: Weekday[];
}

export interface Preferences {
  language: Language;
  theme: Theme;
}
