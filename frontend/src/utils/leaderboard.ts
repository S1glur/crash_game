/**
 * Турнирная таблица. На бэкенде её нет — эндпоинта /topic/leaderboard не
 * существует, поэтому соперники имитируются на клиенте (ТЗ это прямо
 * разрешает: живой рейтинг — дополнительный модуль, имитация допустима).
 * Очки текущего игрока при этом настоящие, их считает сервер.
 */

export interface LeaderRow {
  name: string
  points: number
  isPlayer: boolean
}

const BOTS = [
  { name: 'Геннадий П.', base: 1240 },
  { name: 'Марина', base: 1105 },
  { name: 'Полина', base: 870 },
  { name: 'Сергей М.', base: 640 },
  { name: 'goshara228', base: 515 },
  { name: 'Артемий', base: 430 },
  { name: 'Ника', base: 360 },
]

/** Соперники медленно набирают очки со временем — рейтинг выглядит живым. */
export function leaderboard(playerPoints: number, elapsedSec: number): LeaderRow[] {
  const rows: LeaderRow[] = BOTS.map((bot, index) => ({
    name: bot.name,
    points: bot.base + Math.floor(elapsedSec * (1.6 - index * 0.15)),
    isPlayer: false,
  }))
  rows.push({ name: 'Вы', points: playerPoints, isPlayer: true })
  return rows.sort((a, b) => b.points - a.points)
}

export function playerPlace(rows: LeaderRow[]) {
  return rows.findIndex((row) => row.isPlayer) + 1
}
