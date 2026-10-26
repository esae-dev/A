import type { Page } from '@playwright/test'

export async function routineAction(page: Page, name: string, action: 'edit' | 'delete', language: 'ko' | 'en' = 'ko', touch = false) {
  const trigger = page.getByRole('button', { name: `${name} ${language === 'ko' ? '메뉴' : 'Actions'}`, exact: true })
  if (touch) await trigger.tap(); else await trigger.click()
  const item = page.getByRole('menuitem', { name: language === 'ko' ? action === 'edit' ? '수정' : '삭제' : action === 'edit' ? 'Edit' : 'Delete', exact: true })
  if (touch) await item.tap(); else await item.click()
}
