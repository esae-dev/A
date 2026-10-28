import type { Page } from '@playwright/test'

export async function routineAction(page: Page, name: string, action: 'edit' | 'finish' | 'delete', language: 'ko' | 'en' = 'ko', touch = false) {
  const trigger = page.getByRole('button', { name: `${name} ${language === 'ko' ? '메뉴' : 'Actions'}`, exact: true })
  if (touch) await trigger.tap(); else await trigger.click()
  const labels = { ko: { edit: '수정', finish: '루틴 마무리', delete: '삭제' }, en: { edit: 'Edit', finish: 'Finish routine', delete: 'Delete' } }
  const item = page.getByRole('menuitem', { name: labels[language][action], exact: true })
  if (touch) await item.tap(); else await item.click()
}
