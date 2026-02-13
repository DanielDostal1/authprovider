import type { AxiosError } from 'axios'
import type { ApiError } from './types'

interface ErrorPayload {
  error?: string
}

export function normalizeApiError(error: unknown): ApiError {
  const axiosError = error as AxiosError<ErrorPayload>
  return {
    status: axiosError?.response?.status ?? 0,
    errorCode: axiosError?.response?.data?.error ?? 'unknown_error',
    message: axiosError?.message ?? 'Request failed',
  }
}
