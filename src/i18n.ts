import type { Language, Category } from './domain/types'

export const messages = {
  ko: {
    home: '홈', streak: '스트릭', settings: '설정', todayTitle: '오늘의 루틴',
    daily: '매일', todayDone: '오늘 완료',
    emptyTitle: '루틴 없음',
    add: '루틴 추가', emptyStreakTitle: '기록 없음',
    off: '오늘은 쉬는 날', done: '완료', todo: '완료하기', undo: '완료 취소', edit: '수정',
    language: '언어', theme: '테마', light: '라이트', dark: '다크',
    loading: '루틴을 불러오는 중…', error: '저장소를 사용할 수 없어요. 브라우저의 저장 공간과 접근 권한을 확인한 뒤 다시 시도해 주세요.',
    retry: '다시 시도', close: '닫기', navigation: '주요 메뉴',
    progress: '오늘의 완료 비율',
  },
  en: {
    home: 'Home', streak: 'Streaks', settings: 'Settings', todayTitle: 'Today’s routines',
    daily: 'Every day', todayDone: 'Completed today',
    emptyTitle: 'No routines',
    add: 'Add routine', emptyStreakTitle: 'No records',
    off: 'Rest day', done: 'Done', todo: 'Mark complete', undo: 'Undo completion', edit: 'Edit',
    language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark',
    loading: 'Loading your routines…', error: 'Storage is unavailable. Check your browser’s storage space and permissions, then try again.',
    retry: 'Try again', close: 'Close', navigation: 'Main navigation',
    progress: 'Today’s completion rate',
  },
} satisfies Record<Language, Record<string, string>>

export const categories: Record<Language, Record<Category, string>> = {
  ko: { other: '기타', health: '건강', learning: '배움', mind: '마음', life: '생활' },
  en: { other: 'Other', health: 'Health', learning: 'Learning', mind: 'Mind', life: 'Life' },
}

export const weekdays: Record<Language, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}
