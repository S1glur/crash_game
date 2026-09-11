import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import type { RoundEvent } from './types'

/**
 * Подписка на топик раунда. Бэкенд поднимает STOMP поверх SockJS на /ws,
 * поэтому подключаемся через webSocketFactory, а не по ws:// напрямую.
 */
export function subscribeToRound(roundId: string, onEvent: (event: RoundEvent) => void) {
  const client = new Client({
    webSocketFactory: () => new SockJS('/ws') as WebSocket,
    reconnectDelay: 2000,
    onConnect: () => {
      client.subscribe(`/topic/round/${roundId}`, (message) => {
        onEvent(JSON.parse(message.body) as RoundEvent)
      })
    },
  })
  client.activate()
  return () => void client.deactivate()
}
