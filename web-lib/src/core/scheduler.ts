export interface SchedulerOptions {
  leadTimeMs: number
  jitterMs: number
  minIntervalMs: number
  onTrigger: () => void
}

export interface ScheduleResult {
  nextRefreshAtMs: number
}

export function createScheduler({ leadTimeMs, jitterMs, minIntervalMs, onTrigger }: SchedulerOptions) {
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
    const target = expiresAtMs - leadTimeMs - jitter
    const delay = target <= now ? 250 : Math.max(target - now, minIntervalMs)
    const nextRefreshAtMs = now + delay

    timeoutId = window.setTimeout(() => {
      timeoutId = null
      onTrigger()
    }, delay)

    return { nextRefreshAtMs }
  }

  return {
    schedule,
    reschedule: schedule,
    cancel,
  }
}
