import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Routine, RoutineInput, Weekday } from '../domain/types';
import { Icon } from './Icon';
import { routinePalette } from '../config';
import { contrastInk } from './colorContrast';
import { restoreRoutineFocus } from './DeleteRoutineDialog';

const copy = {
  ko: {
    create: '루틴 추가', edit: '루틴 수정', name: '습관 이름', namePlaceholder: '습관 이름', memo: '메모', optional: '선택', memoPlaceholder: '메모 (선택)', color: '색상', repeat: '반복 빈도', daily: '매일', selected: '요일 선택', submit: '만들기', save: '변경 저장', saving: '저장 중…', close: '닫기', nameError: '습관 이름을 입력해주세요.', daysError: '반복할 요일을 하나 이상 선택해주세요.', error: '저장하지 못했습니다. 다시 시도해주세요.', required: '필수', scheduleNote: '요일 변경은 내일부터 적용됩니다.',
    days: ['일', '월', '화', '수', '목', '금', '토'],
  },
  en: {
    create: 'Add routine', edit: 'Edit routine', name: 'Habit name', namePlaceholder: 'Habit name', memo: 'Note', optional: 'Optional', memoPlaceholder: 'Note (optional)', color: 'Color', repeat: 'Repeat', daily: 'Every day', selected: 'Choose days', submit: 'Create routine', save: 'Save changes', saving: 'Saving…', close: 'Close', nameError: 'Please enter a habit name.', daysError: 'Choose at least one day.', error: 'Could not save. Please try again.', required: 'Required', scheduleNote: 'Schedule changes apply from tomorrow.',
    days: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  },
};
const allDays: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

interface Props {
  routine?: Routine;
  language: 'ko' | 'en';
  busy: boolean;
  onSave: (input: RoutineInput) => Promise<void>;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}

export function RoutineEditor({ routine, language, busy, onSave, onClose, returnFocus }: Props) {
  const t = copy[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const initialDays = routine?.scheduleHistory.at(-1)?.days ?? allDays;
  const [name, setName] = useState(routine?.name ?? '');
  const [memo, setMemo] = useState(routine?.memo ?? '');
  const category = routine?.category ?? 'other';
  const [color, setColor] = useState(routine?.color ?? routinePalette[0].value);
  const [daily, setDaily] = useState(initialDays.length === 7);
  const [days, setDays] = useState<Weekday[]>(initialDays);
  const [pointerFocus, setPointerFocus] = useState(false);
  const [error, setError] = useState<'nameError' | 'daysError' | 'error' | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      nameInput.current?.focus({ preventScroll: true });
    }
    nameInput.current?.focus();
    const keyboard = () => setPointerFocus(false);
    document.addEventListener('keydown', keyboard, true);
    return () => { if (element?.open) element.close(); document.removeEventListener('keydown', keyboard, true); restoreRoutineFocus(returnFocus); };
  }, [returnFocus]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) { setError('nameError'); nameInput.current?.focus(); return; }
    if (!daily && days.length === 0) { setError('daysError'); return; }
    setError(null);
    try { await onSave({ name, memo, category, color, days: daily ? allDays : days }); }
    catch { setError('error'); }
  }

  function toggleDay(day: Weekday) {
    setDays(current => current.includes(day) ? current.filter(value => value !== day) : [...current, day].sort());
  }

  return <dialog className="routine-dialog" ref={dialog} aria-labelledby="editor-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="editor-sheet">
      <div className="editor-header">
        <h2 id="editor-title">{routine ? t.edit : t.create}</h2>
        <button type="button" className="icon-button" aria-label={t.close} onClick={onClose} disabled={busy}><Icon name="close" /></button>
      </div>
      <form onSubmit={submit} noValidate>
        <fieldset className="editor-fields" disabled={busy}>
          <div className="form-field">
            <label htmlFor="routine-name">{t.name} <span className="required-dot" aria-label={t.required}>*</span></label>
            <input autoFocus ref={nameInput} id="routine-name" name="name" value={name} onChange={event => setName(event.target.value)} placeholder={t.namePlaceholder} maxLength={80} required autoComplete="off" aria-invalid={error === 'nameError'} />
          </div>
          <div className="form-field">
            <label htmlFor="routine-memo">{t.memo} <span className="field-optional">{t.optional}</span></label>
            <textarea id="routine-memo" name="memo" value={memo} onChange={event => setMemo(event.target.value)} placeholder={t.memoPlaceholder} maxLength={500} rows={2} />
          </div>
          <fieldset className="palette-field"><legend>{t.color}</legend><div className="color-palette">
            {routinePalette.map(({ value, name }) => {
              const selected = color.toLowerCase() === value.toLowerCase();
              return <button key={value} type="button" className={`color-option${selected ? ' selected' : ''}`} aria-label={name} title={name} aria-pressed={selected} onClick={() => setColor(value)}><span style={{ backgroundColor: value, color: contrastInk(value) }}>{selected && <Icon name="check" size={18} />}</span></button>;
            })}
          </div></fieldset>
          <fieldset className="repeat-field"><legend>{t.repeat}</legend>
            <div className="segmented-control repeat-control"><button type="button" className={daily ? 'selected' : ''} aria-pressed={daily} onClick={() => setDaily(true)}>{t.daily}</button><button type="button" className={!daily ? 'selected' : ''} aria-pressed={!daily} onClick={() => setDaily(false)}>{t.selected}</button></div>
            {!daily && <div className="weekday-picker" data-pointer-focus={pointerFocus} onPointerDownCapture={() => setPointerFocus(true)}>{allDays.map(day => <button type="button" key={day} className={days.includes(day) ? 'selected' : ''} aria-pressed={days.includes(day)} aria-label={new Intl.DateTimeFormat(language, { weekday: 'long' }).format(new Date(2026, 0, 4 + day))} onClick={() => toggleDay(day)}>{t.days[day]}</button>)}</div>}
            {routine && <p className="schedule-note">{t.scheduleNote}</p>}
          </fieldset>
        </fieldset>
        {error && <p className="form-error" role="alert">{t[error]}</p>}
        <button type="submit" className="primary-button editor-submit" disabled={busy}>{busy ? t.saving : routine ? t.save : t.submit}</button>
      </form>

    </div>
  </dialog>;
}
