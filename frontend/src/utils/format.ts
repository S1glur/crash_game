/** Числа по-русски: неразрывный пробел в тысячах, запятая в дробях. */

export const fmtInt = (value: number) =>
  Math.round(value).toLocaleString('ru-RU').replace(/ /g, ' ')

export const fmtMult = (value: number) => value.toFixed(2).replace('.', ',')

/** Со знаком: прибыль без плюса читается как оборот, а убыток теряется среди чисел. */
export const fmtSigned = (value: number) => `${value > 0 ? '+' : ''}${fmtInt(value)}`

/**
 * Позиция шара на шкале уровней — дробная, чтобы сцена ехала плавно,
 * а не прыгала при пересечении уровня. Между порогами интерполируем
 * по логарифму: коэффициент растёт экспоненциально, значит в лог-шкале равномерно.
 */
export function levelProgress(multiplier: number, thresholds: number[]): number {
  if (!thresholds.length) return 0
  if (multiplier >= thresholds[thresholds.length - 1]) return thresholds.length

  let index = 0
  while (index < thresholds.length && multiplier >= thresholds[index]) index++

  const low = index === 0 ? 1 : thresholds[index - 1]
  const high = thresholds[index]
  const span = Math.log(high) - Math.log(low)
  const fraction = span > 0 ? (Math.log(multiplier) - Math.log(low)) / span : 0
  return index + Math.max(0, Math.min(1, fraction))
}
