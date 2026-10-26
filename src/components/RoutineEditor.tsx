import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Category, Routine, RoutineInput, Weekday } from '../domain/types';
import { Icon } from './Icon';

const copy = {
  ko: {
    create: '루틴 추가', edit: '루틴 수정', name: '습관 이름', namePlaceholder: '습관 이름', memo: '메모', optional: '선택', memoPlaceholder: '메모 (선택)', category: '카테고리', color: '색상', repeat: '반복 빈도', daily: '매일', selected: '요일 선택', submit: '만들기', save: '변경 저장', saving: '저장 중…', close: '닫기', remove: '루틴 삭제', confirm: '이 루틴을 삭제할까요?', confirmDetail: '루틴과 기록이 목록에서 사라집니다.', cancel: '취소', deleteConfirm: '삭제', nameError: '습관 이름을 입력해주세요.', daysError: '반복할 요일을 하나 이상 선택해주세요.', error: '저장하지 못했습니다. 다시 시도해주세요.', required: '필수', scheduleNote: '요일 변경은 내일부터 적용됩니다.',
    categories: { other: '기타', health: '건강', learning: '배움', mind: '마음', life: '생활' },
    days: ['일', '월', '화', '수', '목', '금', '토'],
    colors: ['블루', '그린', '퍼플', '오렌지', '핑크', '슬레이트'],
  },
  en: {
    create: 'Add routine', edit: 'Edit routine', name: 'Habit name', namePlaceholder: 'Habit name', memo: 'Note', optional: 'Optional', memoPlaceholder: 'Note (optional)', category: 'Category', color: 'Color', repeat: 'Repeat', daily: 'Every day', selected: 'Choose days', submit: 'Create routine', save: 'Save changes', saving: 'Saving…', close: 'Close', remove: 'Delete routine', confirm: 'Delete this routine?', confirmDetail: 'The routine and its records will leave your lists.', cancel: 'Cancel', deleteConfirm: 'Delete', nameError: 'Please enter a habit name.', daysError: 'Choose at least one day.', error: 'Could not save. Please try again.', required: 'Required', scheduleNote: 'Schedule changes apply from tomorrow.',
    categories: { other: 'Other', health: 'Health', learning: 'Learning', mind: 'Mindfulness', life: 'Life' },
    days: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    colors: ['Blue', 'Green', 'Purple', 'Orange', 'Pink', 'Slate'],
  },
};
const palette = ['#3974db', '#25866b', '#8b63c7', '#c77634', '#c35e85', '#63758b'];
const allDays: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

interface Props {
  routine?: Routine;
  language: 'ko' | 'en';
  busy: boolean;
  onSave: (input: RoutineInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function RoutineEditor({ routine, language, busy, onSave, onDelete, onClose }: Props) {
  const t = copy[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const initialDays = routine?.scheduleHistory.at(-1)?.days ?? allDays;
  const [name, setName] = useState(routine?.name ?? '');
  const [memo, setMemo] = useState(routine?.memo ?? '');
  const [category, setCategory] = useState<Category>(routine?.category ?? 'other');
  const [color, setColor] = useState(routine?.color ?? palette[0]);
  const [daily, setDaily] = useState(initialDays.length === 7);
  const [days, setDays] = useState<Weekday[]>(initialDays);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<'nameError' | 'daysError' | 'error' | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
      nameInput.current?.focus({ preventScroll: true });
    }
    nameInput.current?.focus();
    return () => { if (element?.open) element.close(); };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!name.trim()) { setError('nameError'); nameInput.current?.focus(); return; }
    if (!daily && days.length === 0) { setError('daysError'); return; }
    setError(null);
    try { await onSave({ name, memo, category, color, days: daily ? allDays : days }); }
    catch { setError('error'); }
  }

  async function remove() {
    if (busy || !onDelete) return;
    setError(null);
    try { await onDelete(); }
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
          <div className="form-field">
            <label htmlFor="routine-category">{t.category}</label>
            <select id="routine-category" value={category} onChange={event => setCategory(event.target.value as Category)}>
              {(Object.keys(t.categories) as Category[]).map(key => <option key={key} value={key}>{t.categories[key]}</option>)}
            </select>
          </div>
          <fieldset className="palette-field"><legend>{t.color}</legend><div className="color-palette">
            {palette.map((value, index) => <button key={value} type="button" className={`color-option${color === value ? ' selected' : ''}`} style={{ color: value }} aria-label={t.colors[index]} aria-pressed={color === value} onClick={() => setColor(value)}><span style={{ backgroundColor: value }}>{color === value && <Icon name="check" size={18} />}</span></button>)}
          </div></fieldset>
          <fieldset className="repeat-field"><legend>{t.repeat}</legend>
            <div className="segmented-control repeat-control"><button type="button" className={daily ? 'selected' : ''} aria-pressed={daily} onClick={() => setDaily(true)}>{t.daily}</button><button type="button" className={!daily ? 'selected' : ''} aria-pressed={!daily} onClick={() => setDaily(false)}>{t.selected}</button></div>
            {!daily && <div className="weekday-picker">{allDays.map(day => <button type="button" key={day} className={days.includes(day) ? 'selected' : ''} aria-pressed={days.includes(day)} aria-label={new Intl.DateTimeFormat(language, { weekday: 'long' }).format(new Date(2026, 0, 4 + day))} onClick={() => toggleDay(day)}>{t.days[day]}</button>)}</div>}
            {routine && <p className="schedule-note">{t.scheduleNote}</p>}
          </fieldset>
        </fieldset>
        {error && <p className="form-error" role="alert">{t[error]}</p>}
        <button type="submit" className="primary-button editor-submit" disabled={busy}>{busy ? t.saving : routine ? t.save : t.submit}</button>
      </form>
      {routine && onDelete && <div className="editor-delete">
        {confirmDelete ? <div className="delete-confirmation" role="group" aria-label={t.confirm}>
          <strong>{t.confirm}</strong><p>{t.confirmDetail}</p><div className="delete-confirmation-actions"><button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)} disabled={busy}>{t.cancel}</button><button type="button" className="danger-button" onClick={() => void remove()} disabled={busy}>{t.deleteConfirm}</button></div>
        </div> : <button type="button" className="delete-link" onClick={() => setConfirmDelete(true)} disabled={busy}>{t.remove}</button>}
      </div>}
    </div>
  </dialog>;
}
