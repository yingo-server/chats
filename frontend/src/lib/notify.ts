// Message notification helpers: browser-safe sound + document.title unread indicator.
// Sound uses Web Audio API (no asset file) and respects autoplay policies:
// before the first user gesture the AudioContext stays suspended; we remember the
// pending beep and fire it once the user interacts (pointer/keyboard/touch).

type AudioContextCtor = typeof AudioContext

let ctx: AudioContext | null = null
let pendingPlay = false

function getCtx(): AudioContext | null {
  if (ctx) return ctx
  try {
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  } catch {
    ctx = null
  }
  return ctx
}

function beep(c: AudioContext) {
  try {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = "sine"
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, c.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, c.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.25)
    osc.connect(gain)
    gain.connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + 0.3)
  } catch {
    // never let notification audio break the app
  }
}

/** Called on every incoming message. Plays a beep; if autoplay is blocked it
 *  queues the beep until the next user gesture (see setupAudioUnlock). */
export function playMessageSound() {
  const c = getCtx()
  if (!c) return
  if (c.state === "suspended") {
    pendingPlay = true
    return
  }
  beep(c)
}

/** Must be called once after mount. Unlocks audio on the first user gesture. */
export function setupAudioUnlock() {
  const unlock = () => {
    const c = getCtx()
    if (!c) return
    if (c.state === "suspended") {
      c.resume()
        .then(() => {
          if (pendingPlay) {
            pendingPlay = false
            beep(c)
          }
        })
        .catch(() => {})
    }
    window.removeEventListener("pointerdown", unlock)
    window.removeEventListener("keydown", unlock)
    window.removeEventListener("touchstart", unlock)
  }
  window.addEventListener("pointerdown", unlock)
  window.addEventListener("keydown", unlock)
  window.addEventListener("touchstart", unlock)
}
