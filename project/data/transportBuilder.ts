import { Device, Route } from '../services/transportApi';

export interface EnrichedDevice extends Device {
    route?: Route;
    routeNumber: string;
    busNumber: string;
}

export const buildRelationalMaps = (routes: Route[], devices: Device[]) => {
    const routeMap = new Map<string, Route>();
    routes.forEach((r) => routeMap.set(r.id, r));

    const enrichedDevices: EnrichedDevice[] = devices.map((device) => {
        const nestedBus = device.routePermitBus;
        const nestedRoute = nestedBus?.routePermit?.route;

        // Prefer top-level fields from our backend, fall back to nested structure
        const routeId = device.routeId || nestedRoute?.id || null;
        const busNumber = device.busNumber || nestedBus?.busNumber || "N/A";
        const routeNumber = device.routeNumber || nestedRoute?.routeNumber || "N/A";

        return {
            ...device,
            routeId,
            busNumber,
            routeNumber,
            route: routeId ? (routeMap.get(routeId) || (nestedRoute as Route)) : undefined,
        };
    });

    return {
        routeMap,
        enrichedDevices,
    };
};
