import type { AxiosError } from 'axios'
import type { ApiError } from '../auth/types'

interface ErrorPayload {
  error?: string
}

export function normalizeApiError(error: unknown): ApiError {
  const axiosError = error as AxiosError<ErrorPayload>
  const status = axiosError?.response?.status ?? 0
  const errorCode = axiosError?.response?.data?.error ?? 'unknown_error'
  const message = axiosError?.message ?? 'Request failed'

  return {
    status,
    errorCode,
    message,
  }
}
