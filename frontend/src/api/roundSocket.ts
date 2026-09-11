import { Client, type StompSubscription } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import type { FeedItem, LeaderRow, RoundEvent } from './types'

/**
 * Одно STOMP-соединение на всю сессию вместо нового на каждый раунд.
 *
 * Раньше подписка начиналась только после ответа POST /api/round/start и
 * поднимала SockJS с нуля — сотни миллисекунд. Короткий раунд (шар лопается
 * на 1.00 через десяток миллисекунд) успевал закончиться раньше, чем подписка
 * оформлялась: экран не получал ни тиков, ни round.finished и висел, достраивая
 * коэффициент сам. Готовое соединение сокращает задержку до одного кадра.
 *
 * По этому же соединению идут общие каналы — турнирная таблица и лента
 * завершённых раундов, поэтому подписка сделана по имени топика.
 */
const handlers = new Map<string, (body: unknown) => void>()
const subscriptions = new Map<string, StompSubscription>()

let client: Client | null = null

function subscribe(topic: string) {
  const handler = handlers.get(topic)
  if (!client?.connected || !handler || subscriptions.has(topic)) return

  subscriptions.set(
    topic,
    client.subscribe(topic, (message) => handler(JSON.parse(message.body))),
  )
}

/** Поднимает соединение заранее — вызывается сразу после входа в аккаунт. */
export function connectSocket() {
  if (client) return

  client = new Client({
    webSocketFactory: () => new SockJS('/ws') as WebSocket,
    reconnectDelay: 2000,
    // stompjs переподключается сам, но подписки не восстанавливает: после
    // обрыва их нужно оформить заново, иначе соединение живое, а событий нет.
    onConnect: () => {
      subscriptions.clear()
      handlers.forEach((_, topic) => subscribe(topic))
    },
    onWebSocketClose: () => subscriptions.clear(),
  })
  client.activate()
}

function subscribeToTopic<T>(topic: string, onMessage: (body: T) => void) {
  handlers.set(topic, onMessage as (body: unknown) => void)
  connectSocket()
  subscribe(topic)

  return () => {
    handlers.delete(topic)
    // Отписка по мёртвому соединению бросает исключение, а нам оно ни к чему:
    // сервер и так забудет подписку вместе с сессией сокета.
    if (client?.connected) {
      subscriptions.get(topic)?.unsubscribe()
    }
    subscriptions.delete(topic)
  }
}

export function subscribeToRound(roundId: string, onEvent: (event: RoundEvent) => void) {
  return subscribeToTopic<RoundEvent>(`/topic/round/${roundId}`, onEvent)
}

/** Турнирная таблица всех участников — обновляется, пока кто-то летит. */
export function subscribeToLeaderboard(onRows: (rows: LeaderRow[]) => void) {
  return subscribeToTopic<{ rows: LeaderRow[] }>('/topic/leaderboard', (body) => onRows(body.rows))
}

/** Лента завершённых раундов: чужая игра видна без перезагрузки страницы. */
export function subscribeToFeed(onItem: (item: FeedItem) => void) {
  return subscribeToTopic<FeedItem>('/topic/feed', onItem)
}

/** Рвём соединение при выходе: оно установлено под сессией прежнего аккаунта. */
export function closeSocket() {
  handlers.clear()
  subscriptions.clear()
  void client?.deactivate()
  client = null
}
