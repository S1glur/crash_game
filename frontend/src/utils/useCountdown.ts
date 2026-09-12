import { useEffect, useState } from 'react'

function secondsLeft(endsAt: number): number {
  return Math.ceil(Math.max(0, endsAt - Date.now()) / 1000)
}

/**
 * Секунды до момента `endsAt` (по часам браузера, как Date.now()).
 *
 * Обычный `setInterval` в роли обратного отсчёта врёт дважды.
 *
 * Во-первых, он просыпается по своей сетке, а не по границе секунды: цифра
 * меняется с опозданием до целого интервала, и отсчёт то замирает на двух
 * кадрах, то перескакивает через значение. Лечить это частым опросом — тратить
 * пять рендеров на одно изменение. Поэтому спим ровно до момента, когда цифра
 * обязана смениться: один рендер на секунду, и смена происходит вовремя.
 *
 * Во-вторых, при смене раунда или темы `endsAt` меняется, а состояние хука —
 * только на следующем срабатывании таймера. Ровно это и видно как «задержку
 * таймера при переключении»: на экране ещё секунду висит отсчёт прошлого
 * раунда. Поэтому значение пересчитывается прямо в рендере, как только
 * `endsAt` стал другим, — до первого кадра с новым раундом.
 */
export function useCountdown(endsAt: number): number {
  const [state, setState] = useState(() => ({ endsAt, seconds: secondsLeft(endsAt) }))

  if (state.endsAt !== endsAt) {
    setState({ endsAt, seconds: secondsLeft(endsAt) })
  }

  useEffect(() => {
    let timer = 0

    const tick = () => {
      const left = Math.max(0, endsAt - Date.now())
      setState({ endsAt, seconds: Math.ceil(left / 1000) })
      if (left === 0) return
      // До ближайшей границы секунды. Хвост в 20 мс — чтобы проснуться уже
      // после неё: таймеры браузера умеют срабатывать на волос раньше срока,
      // и без запаса отсчёт иногда показывал бы одно и то же число дважды.
      const toBoundary = left - Math.floor(left / 1000) * 1000 || 1000
      timer = window.setTimeout(tick, toBoundary + 20)
    }

    tick()
    return () => window.clearTimeout(timer)
  }, [endsAt])

  return state.seconds
}
