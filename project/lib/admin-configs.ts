import { auth } from '@/lib/firebase'

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export type AdminConfigValue = string | number
export type AdminConfigMap = Record<string, AdminConfigValue[]>

export async function getAdminToken(): Promise<string> {
  return (await auth.currentUser?.getIdToken()) || ''
}

export async function fetchAdminConfigMap(): Promise<AdminConfigMap> {
  const token = await getAdminToken()
  const res = await fetch(`${BASE}/admin/fleet/configs`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const data = await res.json()
  return data?.success ? data.map || {} : {}
}

export function formatConfigValue(value: AdminConfigValue): string {
  if (typeof value === 'number') return String(value)
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function normalizeConfigInput(key: string, raw: string): AdminConfigValue | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (key === 'geofence_radius') {
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : null
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')

  if (!normalized) return null
  if (key === 'bus_types' && !normalized.endsWith('_bus')) {
    return `${normalized}_bus`
  }
  return normalized
}
