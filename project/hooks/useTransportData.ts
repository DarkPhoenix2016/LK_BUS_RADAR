import useSWR from 'swr';
import { fetcher, API_ENDPOINTS, Device, Route } from '../services/transportApi';
import { buildRelationalMaps, EnrichedDevice } from '../data/transportBuilder';
import { useMemo } from 'react';

export function useTransportData() {
    const { data: routeData, error: routeError } = useSWR(API_ENDPOINTS.ROUTES + '?perPage=1000', fetcher);
    const { data: devices, error: deviceError, mutate: refreshDevices } = useSWR(API_ENDPOINTS.DEVICES, fetcher, {
        refreshInterval: 15000, // Refresh every 15s
    });

    const routes: Route[] = routeData?.data || [];
    const deviceList: Device[] = Array.isArray(devices) ? devices : [];

    const { routeMap, enrichedDevices } = useMemo(() => {
        return buildRelationalMaps(routes, deviceList);
    }, [routes, deviceList]);

    const loading = !routeError && !routeData && !deviceError && !devices;

    return {
        routes,
        devices: enrichedDevices,
        routeMap,
        loading,
        error: routeError || deviceError,
        refreshDevices,
    };
}
