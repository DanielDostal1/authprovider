import axios from 'axios'

export function createHttp(baseURL: string) {
  const defaults = {
    baseURL,
    timeout: 15000,
    headers: {
      'Content-Type': 'application/json',
    },
  }

  return {
    http: axios.create(defaults),
    refreshHttp: axios.create(defaults),
  }
}
