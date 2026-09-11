/**
 * Звук игры. ТЗ требует звуковое сопровождение в обязательных модулях:
 * §1.3 — эффект при пересечении уровня, §1.4 — сигнал при срабатывании бустера.
 *
 * Звуки синтезируются через WebAudio, без файлов-ассетов. Так короткие сигналы
 * не тянут за собой мегабайты, не требуют разбирательств с лицензиями на
 * семплы и не могут «не успеть загрузиться» к моменту события.
 */

const MUTE_KEY = 'balloon.muted'

let ctx: AudioContext | null = null
let muted = readMuted()

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    // Приватный режим или заблокированные site data — просто играем со звуком.
    return false
  }
}

/**
 * Браузеры не дают создать звук до жеста пользователя, поэтому контекст
 * появляется лениво — на первом же клике (выбор темы, «Начать»).
 */
function audio(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Один затухающий тон. Длительность в секундах, частоты — в герцах. */
function tone(
  freq: number,
  duration: number,
  options: { type?: OscillatorType; gain?: number; delay?: number; sweepTo?: number } = {},
) {
  const context = audio()
  if (!context) return

  const { type = 'sine', gain = 0.2, delay = 0, sweepTo } = options
  const start = context.currentTime + delay

  const osc = context.createOscillator()
  const amp = context.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), start + duration)
  }

  // Мгновенная атака и экспоненциальное затухание — так сигнал не щёлкает
  // на обрыве и не спорит с музыкой интерфейса.
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(amp).connect(context.destination)
  osc.start(start)
  osc.stop(start + duration + 0.02)
}

/** Шумовой удар — для взрыва шара. */
function noiseBurst(duration: number, gain = 0.25) {
  const context = audio()
  if (!context) return

  const frames = Math.floor(context.sampleRate * duration)
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    // Шум с затуханием к концу — иначе получается «шшш» вместо хлопка.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2
  }

  const source = context.createBufferSource()
  source.buffer = buffer

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1400, context.currentTime)

  const amp = context.createGain()
  amp.gain.setValueAtTime(gain, context.currentTime)

  source.connect(filter).connect(amp).connect(context.destination)
  source.start()
}

export const sound = {
  /** Пересечение уровня: короткий щелчок, тон растёт с номером уровня. */
  level(levelIndex: number) {
    tone(520 + Math.min(levelIndex, 11) * 42, 0.13, { type: 'triangle', gain: 0.16 })
  },

  /** Бустер: восходящий аккорд — событие должно звучать заметно крупнее уровня. */
  boost() {
    tone(523, 0.3, { type: 'triangle', gain: 0.2 })
    tone(659, 0.3, { type: 'triangle', gain: 0.18, delay: 0.07 })
    tone(880, 0.42, { type: 'triangle', gain: 0.2, delay: 0.14 })
  },

  /** Забрали выигрыш: мягкий двузвучный сигнал. */
  cashout() {
    tone(784, 0.22, { type: 'sine', gain: 0.22 })
    tone(1047, 0.34, { type: 'sine', gain: 0.2, delay: 0.1 })
  },

  /** Крах: хлопок плюс падающий тон — шар сдувается. */
  crash() {
    noiseBurst(0.36)
    tone(220, 0.5, { type: 'sawtooth', gain: 0.14, sweepTo: 60 })
  },

  /** Выбор темы: короткая «капля воды» из брифа. */
  select() {
    tone(1200, 0.16, { type: 'sine', gain: 0.18, sweepTo: 520 })
  },

  /** Старт раунда: низкий выдох горелки. */
  launch() {
    tone(180, 0.4, { type: 'sawtooth', gain: 0.12, sweepTo: 320 })
  },

  get muted() {
    return muted
  },

  toggleMute(): boolean {
    muted = !muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Настройка не сохранится между сессиями — на работу игры это не влияет.
    }
    if (muted && ctx) void ctx.suspend()
    if (!muted && ctx) void ctx.resume()
    return muted
  },
}
