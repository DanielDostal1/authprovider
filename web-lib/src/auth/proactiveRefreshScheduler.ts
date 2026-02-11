interface SchedulerOptions {
  leadTimeMs: number
  jitterMs: number
  minIntervalMs: number
  onTrigger: () => void
}

export interface ScheduleResult {
  nextRefreshAtMs: number
}

export function createProactiveRefreshScheduler({
  leadTimeMs,
  jitterMs,
  minIntervalMs,
  onTrigger,
}: SchedulerOptions) {
  let timeoutId: number | null = null

  const cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  const schedule = (expiresAtMs: number): ScheduleResult => {
    cancel()

    const now = Date.now()
    const jitter = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0
    const calculatedAt = expiresAtMs - leadTimeMs - jitter

    let delay = calculatedAt - now
    if (delay <= 0) {
      delay = 250
    } else {
      delay = Math.max(delay, minIntervalMs)
    }

    const nextRefreshAtMs = now + delay
    timeoutId = window.setTimeout(() => {
      timeoutId = null
      onTrigger()
    }, delay)

    return { nextRefreshAtMs }
  }

  const reschedule = (expiresAtMs: number): ScheduleResult => {
    return schedule(expiresAtMs)
  }

  return {
    schedule,
    reschedule,
    cancel,
  }
}
