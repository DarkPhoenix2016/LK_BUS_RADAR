'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildTransportObjects } from '../project/data/dataBuilder'
import { createLookupMaps } from '../project/data/lookupMaps'
import { fetchLiveVehicles, fetchTransportDatasets } from '../project/services/transportApi'

export const useTransportData = ({
  baseUrl = '',
  pollIntervalMs = 15000,
  autoStart = true,
  fetchOptions,
} = {}) => {
  const [datasets, setDatasets] = useState(null)
  const [liveVehicles, setLiveVehicles] = useState([])
  const [loading, setLoading] = useState(Boolean(autoStart))
  const [error, setError] = useState(null)

  const loadInitial = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await fetchTransportDatasets({ baseUrl, fetchOptions })
      setDatasets(data)
      setLiveVehicles(Array.isArray(data.liveVehicles) ? data.liveVehicles : [])
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [baseUrl, fetchOptions])

  const refreshLive = useCallback(async () => {
    try {
      const rows = await fetchLiveVehicles({ baseUrl, fetchOptions })
      setLiveVehicles(rows)
    } catch (err) {
      setError(err)
    }
  }, [baseUrl, fetchOptions])

  useEffect(() => {
    if (!autoStart) return
    loadInitial()
  }, [autoStart, loadInitial])

  useEffect(() => {
    if (!autoStart || !pollIntervalMs) return

    const timer = setInterval(() => {
      refreshLive()
    }, pollIntervalMs)

    return () => clearInterval(timer)
  }, [autoStart, pollIntervalMs, refreshLive])

  const lookups = useMemo(() => {
    if (!datasets) return null

    return createLookupMaps({
      ...datasets,
      liveVehicles,
    })
  }, [datasets, liveVehicles])

  const transportObjects = useMemo(() => {
    if (!datasets || !lookups) return []

    return buildTransportObjects(
      {
        ...datasets,
        liveVehicles,
      },
      lookups
    )
  }, [datasets, liveVehicles, lookups])

  return {
    transportObjects,
    datasets,
    liveVehicles,
    loading,
    error,
    refetchAll: loadInitial,
    refetchLive: refreshLive,
  }
}
