import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5002'

export const http = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const refreshHttp = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})
