/** Add a language here and its translation resources; the selector stays the same. */
export const supportedLanguages = [
  { value: 'ko', label: '한국어', locale: 'ko-KR' },
  { value: 'en', label: 'English', locale: 'en-US' },
] as const

export const themes = ['light', 'dark'] as const

export const routinePalette = [
  { name: 'Soft Blue', value: '#6B94E8' },
  { name: 'Fresh Mint', value: '#61BEA7' },
  { name: 'Lilac', value: '#A28BE5' },
  { name: 'Blush Pink', value: '#DF88AE' },
  { name: 'Soft Coral', value: '#E99D83' },
  { name: 'Clear Sky', value: '#73BADF' },
] as const
