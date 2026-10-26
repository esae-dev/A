import { describe, expect, it } from 'vitest'
import { routinePalette } from '../config'
import { contrastInk } from './colorContrast'

describe('routine check contrast', () => {
  it.each(routinePalette)('uses dark navy for the light $name preset', ({ value }) => {
    expect(contrastInk(value)).toBe('#182336')
  })
  it.each(['#8b63c7', '#3974db', '#000000'])('keeps white checks on darker stored colors %s', color => {
    expect(contrastInk(color)).toBe('#ffffff')
  })
  it('supports mixed-case light legacy colors', () => {
    expect(contrastInk('#FaFafA')).toBe('#182336')
  })
})
