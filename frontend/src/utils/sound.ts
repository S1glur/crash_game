/**
 * Звук игры в стилистике Alto's Odyssey — под визуальное решение проекта.
 *
 * Три приёма, из которых складывается это звучание:
 *  1. Пентатоника. Любые её ноты сочетаются между собой, поэтому случайно
 *     наложившиеся звуки (уровень + бустер + птица) никогда не дадут диссонанса.
 *  2. Мягкая атака и длинный хвост вместо щелчков — звук «вплывает».
 *  3. Общий реверб: он склеивает отдельные сигналы в одно пространство, и игра
 *     перестаёт звучать как набор системных «бипов».
 *
 * ТЗ требует звук в обязательных модулях (§1.3 — уровень, §1.4 — бустер) и
 * пение птиц каждые 1.8–5 секунд на экране выбора темы (§1.1).
 *
 * Всё синтезируется на месте: ни одного файла-ассета, нечему не догрузиться.
 */

const MUTE_KEY = 'balloon.muted'

/** Ре-мажорная пентатоника, три октавы — основа всех сигналов. */
const SCALE = [
  146.83, 164.81, 185.00, 220.00, 246.94,
  293.66, 329.63, 369.99, 440.00, 493.88,
  587.33, 659.25, 739.99, 880.00, 987.77,
]

let ctx: AudioContext | null = null
let master: GainNode | null = null
let reverbSend: GainNode | null = null
let muted = readMuted()

let windSource: AudioBufferSourceNode | null = null
let windGain: GainNode | null = null
let birdTimer: number | null = null

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Браузеры не дают создать звук до жеста пользователя, поэтому граф собирается
 * лениво — на первом клике.
 */
function audio(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()

    master = ctx.createGain()
    master.gain.value = 0.9

    // Мягкий срез верха: убирает «цифровую» резкость синтеза.
    const tame = ctx.createBiquadFilter()
    tame.type = 'lowpass'
    tame.frequency.value = 5200

    const reverb = ctx.createConvolver()
    reverb.buffer = impulseResponse(ctx, 2.6, 2.4)

    reverbSend = ctx.createGain()
    reverbSend.gain.value = 0.32

    master.connect(tame).connect(ctx.destination)
    master.connect(reverbSend).connect(reverb).connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Синтетический импульсный отклик — экспоненциально затухающий шум. */
function impulseResponse(context: AudioContext, seconds: number, decay: number): AudioBuffer {
  const frames = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(2, frames, context.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** decay
    }
  }
  return buffer
}

interface NoteOptions {
  type?: OscillatorType
  gain?: number
  delay?: number
  attack?: number
  detune?: number
  sweepTo?: number
}

/** Одна нота с мягкой атакой и долгим затуханием. */
function note(freq: number, duration: number, options: NoteOptions = {}) {
  const context = audio()
  if (!context || !master) return

  const { type = 'sine', gain = 0.18, delay = 0, attack = 0.03, detune = 0, sweepTo } = options
  const start = context.currentTime + delay

  const osc = context.createOscillator()
  osc.type = type
  osc.detune.value = detune
  osc.frequency.setValueAtTime(freq, start)
  if (sweepTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), start + duration)
  }

  const amp = context.createGain()
  amp.gain.setValueAtTime(0.0001, start)
  amp.gain.exponentialRampToValueAtTime(gain, start + attack)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  osc.connect(amp).connect(master)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** Фильтрованный шум — ветер, хлопок, шелест. */
function noise(
  duration: number,
  options: { gain?: number; cutoff?: number; type?: BiquadFilterType; delay?: number } = {},
) {
  const context = audio()
  if (!context || !master) return

  const { gain = 0.2, cutoff = 900, type = 'lowpass', delay = 0 } = options
  const start = context.currentTime + delay
  const frames = Math.floor(context.sampleRate * duration)
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2
  }

  const source = context.createBufferSource()
  source.buffer = buffer

  const filter = context.createBiquadFilter()
  filter.type = type
  filter.frequency.value = cutoff

  const amp = context.createGain()
  amp.gain.setValueAtTime(gain, start)
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  source.connect(filter).connect(amp).connect(master)
  source.start(start)
}

/**
 * Щебет птицы: быстрый скользящий свист с вибрато. Несколько слогов со
 * случайной высотой — чтобы два подряд не звучали одинаково.
 */
function chirp() {
  const context = audio()
  if (!context || !master) return

  const syllables = 2 + Math.floor(Math.random() * 3)
  const base = 1900 + Math.random() * 1400

  for (let i = 0; i < syllables; i++) {
    const start = context.currentTime + i * (0.07 + Math.random() * 0.05)
    const duration = 0.06 + Math.random() * 0.05
    const from = base * (0.85 + Math.random() * 0.4)
    const to = from * (Math.random() > 0.45 ? 1.5 : 0.62)

    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(from, start)
    osc.frequency.exponentialRampToValueAtTime(to, start + duration)

    // Вибрато — без него свист звучит как сигнал прибора, а не как птица.
    const vibrato = context.createOscillator()
    vibrato.frequency.value = 28 + Math.random() * 22
    const vibratoDepth = context.createGain()
    vibratoDepth.gain.value = from * 0.045
    vibrato.connect(vibratoDepth).connect(osc.frequency)

    const amp = context.createGain()
    amp.gain.setValueAtTime(0.0001, start)
    amp.gain.exponentialRampToValueAtTime(0.05, start + 0.012)
    amp.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    osc.connect(amp).connect(master)
    osc.start(start)
    osc.stop(start + duration + 0.05)
    vibrato.start(start)
    vibrato.stop(start + duration + 0.05)
  }
}

/**
 * Браузер держит звук выключенным до первого действия пользователя. Ловим
 * любое — клик, касание, клавишу — и будим контекст: иначе фоновая атмосфера
 * молчала бы до первого нажатия на кнопку, а это первый же экран игры.
 */
if (typeof window !== 'undefined') {
  const unlock = () => {
    audio()
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}

export const sound = {
  /**
   * Пересечение уровня (§1.3). Нота поднимается по пентатонике вместе с
   * номером уровня — подъём слышно, а не только видно.
   */
  level(levelIndex: number) {
    const index = Math.min(SCALE.length - 1, 5 + levelIndex)
    note(SCALE[index], 1.1, { type: 'triangle', gain: 0.13, attack: 0.02 })
    note(SCALE[index] * 2, 0.8, { type: 'sine', gain: 0.05, attack: 0.02, delay: 0.01 })
  },

  /**
   * Бустер (§1.4): арпеджио вверх по той же пентатонике. Заметно крупнее
   * уровня, но из того же звукоряда — не выбивается из атмосферы.
   */
  boost() {
    ;[5, 7, 9, 11, 13].forEach((step, i) => {
      note(SCALE[step], 1.5, { type: 'triangle', gain: 0.13, delay: i * 0.06, attack: 0.02 })
    })
    note(SCALE[2], 2.2, { type: 'sine', gain: 0.1, attack: 0.08 })
  },

  /** Забрали выигрыш: тёплая терция с лёгким расстроем. */
  cashout() {
    note(SCALE[8], 1.6, { type: 'sine', gain: 0.16, attack: 0.04 })
    note(SCALE[10], 1.8, { type: 'sine', gain: 0.13, attack: 0.05, delay: 0.08 })
    note(SCALE[8], 1.6, { type: 'sine', gain: 0.06, attack: 0.05, detune: 7 })
  },

  /** Крах: шар сдувается — выдох воздуха и уходящий вниз тон, без резкости. */
  crash() {
    noise(0.7, { gain: 0.22, cutoff: 1600 })
    note(SCALE[5], 1.3, { type: 'sine', gain: 0.14, attack: 0.01, sweepTo: SCALE[0] * 0.6 })
    noise(1.4, { gain: 0.08, cutoff: 500, delay: 0.2 })
  },

  /** Выбор темы: «капля воды» из брифа. */
  select() {
    note(1180, 0.5, { type: 'sine', gain: 0.15, attack: 0.006, sweepTo: 520 })
    note(SCALE[10], 1.4, { type: 'sine', gain: 0.07, attack: 0.06, delay: 0.05 })
  },

  /** Старт раунда: выдох горелки и низкая опора. */
  launch() {
    noise(0.5, { gain: 0.16, cutoff: 700 })
    note(SCALE[0], 2.4, { type: 'sine', gain: 0.12, attack: 0.12 })
    note(SCALE[3], 2.0, { type: 'sine', gain: 0.07, attack: 0.16, delay: 0.1 })
  },

  /** Одиночный щебет — можно дёрнуть вручную. */
  bird() {
    chirp()
  },

  /**
   * Фоновая атмосфера: ровный ветер и редкие птицы (§1.1 — каждые 1.8–5 с).
   * Интервал каждый раз новый, поэтому пение не превращается в метроном.
   */
  startAmbience() {
    const context = audio()
    if (!context || !master || windSource) return

    // Зацикленный шум с медленно гуляющим фильтром — ровный ветер без «швов».
    const seconds = 4
    const frames = context.sampleRate * seconds
    const buffer = context.createBuffer(1, frames, context.sampleRate)
    const data = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < frames; i++) {
      // Коричневый шум: мягче белого, ближе к настоящему ветру.
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995
      data[i] = last * 3
    }

    windSource = context.createBufferSource()
    windSource.buffer = buffer
    windSource.loop = true

    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420

    const sweep = context.createOscillator()
    sweep.frequency.value = 0.07
    const sweepDepth = context.createGain()
    sweepDepth.gain.value = 160
    sweep.connect(sweepDepth).connect(filter.frequency)
    sweep.start()

    windGain = context.createGain()
    windGain.gain.setValueAtTime(0.0001, context.currentTime)
    windGain.gain.exponentialRampToValueAtTime(0.09, context.currentTime + 2.5)

    windSource.connect(filter).connect(windGain).connect(master)
    windSource.start()

    const scheduleBird = () => {
      chirp()
      birdTimer = window.setTimeout(scheduleBird, 1800 + Math.random() * 3200)
    }
    birdTimer = window.setTimeout(scheduleBird, 1800 + Math.random() * 3200)
  },

  stopAmbience() {
    if (birdTimer !== null) {
      clearTimeout(birdTimer)
      birdTimer = null
    }
    if (windGain && ctx) {
      // Плавный уход вместо обрыва — иначе на смене экрана слышен щелчок.
      windGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8)
    }
    const source = windSource
    windSource = null
    if (source) {
      setTimeout(() => source.stop(), 900)
    }
  },

  get muted() {
    return muted
  },

  toggleMute(): boolean {
    muted = !muted
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // Настройка не переживёт перезагрузку — на игру это не влияет.
    }
    if (muted) {
      sound.stopAmbience()
      if (ctx) void ctx.suspend()
    } else if (ctx) {
      void ctx.resume()
    }
    return muted
  },
}
