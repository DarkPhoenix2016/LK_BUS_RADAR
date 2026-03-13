const ENDPOINTS = {
  routes: '/api/routes',
  buses: '/api/buses',
  devices: '/api/devices',
  busStops: '/api/busStops',
  routeStops: '/api/routeStops',
  routePermits: '/api/routePermits',
  runningSlots: '/api/runningSlots',
  runningSlotStops: '/api/runningSlotStops',
  runningNumbers: '/api/runningNumbers',
  busTurns: '/api/busTurns',
  liveVehicles: '/api/liveVehicles',
}

const joinUrl = (baseUrl, path) => {
  const base = baseUrl ? String(baseUrl).replace(/\/$/, '') : ''
  return `${base}${path}`
}

const asArray = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.results)) return payload.results
  return []
}

const fetchJson = async (url, fetchOptions = {}) => {
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    ...fetchOptions,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Request failed (${response.status}) ${url}${body ? `: ${body}` : ''}`)
  }

  return response.json()
}

export const fetchTransportDatasets = async ({
  baseUrl = '',
  fetchOptions = {},
  endpoints = ENDPOINTS,
} = {}) => {
  const keys = Object.keys(endpoints)

  const responses = await Promise.all(
    keys.map(async (key) => {
      const json = await fetchJson(joinUrl(baseUrl, endpoints[key]), fetchOptions)
      return [key, asArray(json)]
    })
  )

  return Object.fromEntries(responses)
}

export const fetchLiveVehicles = async ({
  baseUrl = '',
  fetchOptions = {},
  endpoint = ENDPOINTS.liveVehicles,
} = {}) => {
  const json = await fetchJson(joinUrl(baseUrl, endpoint), fetchOptions)
  return asArray(json)
}

export { ENDPOINTS }
