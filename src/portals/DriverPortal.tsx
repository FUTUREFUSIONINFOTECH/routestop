import { useMemo, useState } from 'react';
import {
  Bus,
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  Navigation,
  Play,
  Square,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { RouteMapVisualizer } from '../components/RouteMapVisualizer';
import type { PlatformState } from '../types/platform';

interface DriverPortalProps {
  state: PlatformState;
  post: <T = unknown>(url: string, body?: unknown) => Promise<T>;
  patch: <T = unknown>(url: string, body?: unknown) => Promise<T>;
}

export function DriverPortal({ state, post, patch }: DriverPortalProps) {
  const [selectedTripId, setSelectedTripId] = useState<string>(state.trips[0]?.id || 'trip-1');
  const [crewMode, setCrewMode] = useState<'DRIVER' | 'CONDUCTOR'>('DRIVER');
  const [speedKmh, setSpeedKmh] = useState<number>(68);
  const [offlineMode, setOfflineMode] = useState<boolean>(false);
  const [queuedUpdates, setQueuedUpdates] = useState<{ progressPct: number; speedKmh: number; ts: string }[]>([]);
  const [busy, setBusy] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const trip = useMemo(
    () => state.trips.find((t) => t.id === selectedTripId) || state.trips[0],
    [state.trips, selectedTripId]
  );

  const vehicle = useMemo(
    () => state.vehicles.find((v) => v.id === trip?.vehicleId),
    [state.vehicles, trip]
  );

  const route = useMemo(
    () => state.routes.find((r) => r.id === trip?.routeId),
    [state.routes, trip]
  );

  const driver = useMemo(
    () => state.staff.find((s) => s.id === trip?.driverId),
    [state.staff, trip]
  );

  const conductor = useMemo(
    () => state.staff.find((s) => s.id === trip?.conductorId),
    [state.staff, trip]
  );

  const company = useMemo(
    () => state.companies.find((c) => c.id === vehicle?.companyId),
    [state.companies, vehicle]
  );

  const tripOrders = useMemo(
    () =>
      state.orders.filter(
        (o) =>
          o.tripId === trip?.id &&
          o.paymentStatus === 'VERIFIED' &&
          o.status !== 'REJECTED' &&
          o.status !== 'CANCELLED'
      ),
    [state.orders, trip]
  );

  const nextRestaurantStop = useMemo(() => {
    if (!trip) return null;
    return trip.stopEtas.find((s) => s.restaurantId && !s.passed) || null;
  }, [trip]);

  const nextRestaurant = useMemo(
    () =>
      nextRestaurantStop?.restaurantId
        ? state.restaurants.find((r) => r.id === nextRestaurantStop.restaurantId)
        : null,
    [nextRestaurantStop, state.restaurants]
  );

  if (!trip || !vehicle || !route) return null;

  const pushGpsUpdate = async (nextPct: number) => {
    const clamped = Math.max(0, Math.min(100, nextPct));
    if (trip.status !== 'IN_PROGRESS') return;

    if (offlineMode) {
      setQueuedUpdates((prev) => [
        ...prev,
        { progressPct: clamped, speedKmh, ts: new Date().toLocaleTimeString() },
      ]);
      setStatusMessage(`Offline buffer: saved GPS point (${clamped}%) locally for sync.`);
      return;
    }

    setBusy(true);
    try {
      await post(`/api/trips/${trip.id}/gps`, { progressPct: clamped, speedKmh });
      setStatusMessage(`GPS telemetry synced (${clamped}% corridor progress).`);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleOffline = async () => {
    if (offlineMode) {
      // Reconnecting: flush buffered GPS queue safely
      setOfflineMode(false);
      if (queuedUpdates.length > 0 && trip.status === 'IN_PROGRESS') {
        const latest = queuedUpdates[queuedUpdates.length - 1];
        setBusy(true);
        try {
          await post(`/api/trips/${trip.id}/gps`, {
            progressPct: latest.progressPct,
            speedKmh: latest.speedKmh,
          });
          setStatusMessage(
            `Connectivity restored: flushed ${queuedUpdates.length} queued GPS packet(s) to backend.`
          );
          setQueuedUpdates([]);
        } finally {
          setBusy(false);
        }
      }
    } else {
      setOfflineMode(true);
      setStatusMessage('Offline mode active: GPS packets will buffer safely until network returns.');
    }
  };

  const handleStartTrip = async () => {
    setBusy(true);
    try {
      await post(`/api/trips/${trip.id}/start`);
      setStatusMessage('Trip started. Live GPS broadcasting is now active.');
    } finally {
      setBusy(false);
    }
  };

  const handleEndTrip = async () => {
    setBusy(true);
    try {
      await post(`/api/trips/${trip.id}/end`);
      setQueuedUpdates([]);
      setStatusMessage('Trip completed. GPS broadcasting stopped per compliance rules.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Crew Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
            <Bus className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs text-slate-500">
              {company?.name} · Assigned Vehicle & Trip
            </div>
            <select
              value={trip.id}
              onChange={(e) => {
                setSelectedTripId(e.target.value);
                setQueuedUpdates([]);
                setStatusMessage(null);
              }}
              aria-label="Select Assigned Trip"
              className="text-lg font-bold text-slate-900 bg-transparent border-b border-slate-300 pb-0.5 pr-4 mt-0.5 focus:outline-none focus:border-emerald-700"
            >
              {state.trips.map((t) => {
                const v = state.vehicles.find((veh) => veh.id === t.vehicleId);
                const r = state.routes.find((rt) => rt.id === t.routeId);
                return (
                  <option key={t.id} value={t.id}>
                    {v?.regNumber} — {r?.name} ({t.status})
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Crew Role Switch */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setCrewMode('DRIVER')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                crewMode === 'DRIVER' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Driver Mode ({driver?.name.split(' ')[0]})
            </button>
            <button
              type="button"
              onClick={() => setCrewMode('CONDUCTOR')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                crewMode === 'CONDUCTOR' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Conductor Mode ({conductor?.name.split(' ')[0]})
            </button>
          </div>

          {/* Trip Lifecycle CTA */}
          {trip.status === 'ASSIGNED' || trip.status === 'READY_TO_START' ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleStartTrip}
              className="min-h-[42px] px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" /> Start Trip & Enable GPS
            </button>
          ) : trip.status === 'IN_PROGRESS' ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleEndTrip}
              className="min-h-[42px] px-4 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <Square className="w-3.5 h-3.5" /> End Trip & Stop GPS
            </button>
          ) : (
            <span className="px-3.5 py-2 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold">
              Trip Completed
            </span>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className="bg-slate-900 text-white rounded-xl px-4 py-2.5 text-xs flex items-center justify-between">
          <span>{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Primary KPI & Next Restaurant Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Trip State</div>
          <div className="text-lg font-bold text-slate-900 mt-1">{trip.status.replace(/_/g, ' ')}</div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {vehicle.type} · {vehicle.seatingCapacity} seats
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Next Partner Restaurant</div>
          <div className="text-lg font-bold text-slate-900 mt-1 truncate">
            {nextRestaurant ? nextRestaurant.name : 'End of Route'}
          </div>
          <div className="text-xs text-emerald-700 font-medium mt-1">
            {nextRestaurantStop ? nextRestaurantStop.stopName : route.destination}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Distance & ETA to Stop</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {nextRestaurantStop ? `${nextRestaurantStop.distanceRemainingKm} km` : '0 km'}
          </div>
          <div className="text-xs font-mono tabular-nums text-emerald-700 font-semibold mt-1">
            {nextRestaurantStop ? `ETA ${nextRestaurantStop.etaMinutes} mins` : 'Arrived'}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs text-slate-500">Active Passenger Pre-Orders</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
            {tripOrders.filter((o) => o.status !== 'COMPLETED').length} Pending
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {tripOrders.filter((o) => o.status === 'READY').length} Ready for Pickup
          </div>
        </div>
      </div>

      {/* Live Map */}
      <RouteMapVisualizer
        route={route}
        trip={trip}
        restaurants={state.restaurants}
        highlightedRestaurantId={nextRestaurant?.id}
      />

      {/* Driver GPS Broadcast Console OR Conductor Order Assist */}
      {crewMode === 'DRIVER' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* GPS Telemetry Controls */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Live GPS Broadcast Controls</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Push live coordinates along {route.code} to update restaurant & passenger ETAs.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleOffline}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border ${
                  offlineMode
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {offlineMode ? <WifiOff className="w-3.5 h-3.5" /> : <Wifi className="w-3.5 h-3.5" />}
                {offlineMode ? `Offline (${queuedUpdates.length})` : 'Network Online'}
              </button>
            </div>

            {trip.status !== 'IN_PROGRESS' ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                GPS broadcasting is locked. {trip.status === 'COMPLETED' ? 'Completed trips cannot broadcast GPS.' : 'Click "Start Trip & Enable GPS" above to begin sending coordinates.'}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-600">Route Progress</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {trip.progressPct}% ({trip.currentKm} / {route.totalKm} km)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={trip.progressPct}
                    onChange={(e) => pushGpsUpdate(Number(e.target.value))}
                    className="w-full accent-emerald-600 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Cruising Speed (km/h)
                    </label>
                    <input
                      type="number"
                      min={25}
                      max={105}
                      value={speedKmh}
                      onChange={(e) => setSpeedKmh(Number(e.target.value) || 65)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pushGpsUpdate(Math.min(100, trip.progressPct + 6))}
                      className="w-full min-h-[38px] rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 inline-flex items-center justify-center gap-1.5"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Drive +25 km
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-3 gap-2 text-xs font-mono tabular-nums">
                  <div>
                    <span className="text-slate-400 block">Latitude</span>
                    <span className="text-slate-900">{trip.currentLat.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Longitude</span>
                    <span className="text-slate-900">{trip.currentLng.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Heading</span>
                    <span className="text-slate-900 flex items-center gap-1">
                      <Compass className="w-3 h-3" /> {trip.headingDeg}°
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upcoming Partner Stops & Order Counts */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-slate-900 mb-4">
              Upcoming Partner Stops & Order Summary
            </h2>
            <div className="divide-y divide-slate-100">
              {trip.stopEtas.map((stopEta) => {
                const rest = stopEta.restaurantId
                  ? state.restaurants.find((r) => r.id === stopEta.restaurantId)
                  : null;
                const stopOrders = stopEta.restaurantId
                  ? tripOrders.filter((o) => o.restaurantId === stopEta.restaurantId)
                  : [];
                const dineInCount = stopOrders.filter((o) => o.orderType === 'DINE_IN').length;
                const takeawayCount = stopOrders.filter((o) => o.orderType === 'TAKEAWAY').length;

                return (
                  <div key={stopEta.stopId} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <MapPin
                        className={`w-4 h-4 mt-0.5 shrink-0 ${
                          stopEta.passed
                            ? 'text-slate-300'
                            : rest
                              ? 'text-emerald-600'
                              : 'text-slate-400'
                        }`}
                      />
                      <div>
                        <div className="text-sm font-semibold text-slate-900">
                          {rest ? rest.name : stopEta.stopName}
                        </div>
                        <div className="text-xs text-slate-500">
                          {stopEta.stopName} · Marker {stopEta.kmFromOrigin} km
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-xs">
                      {rest && (
                        <div className="text-right">
                          <div className="font-semibold text-slate-900 font-mono tabular-nums">
                            {stopOrders.length} Orders
                          </div>
                          <div className="text-slate-500">
                            {dineInCount} Dine-in · {takeawayCount} Takeaway
                          </div>
                        </div>
                      )}
                      <div className="w-24 text-right font-mono tabular-nums">
                        {stopEta.passed ? (
                          <span className="text-slate-400">Passed</span>
                        ) : stopEta.kmFromOrigin === 0 ? (
                          <span className="text-slate-500">Origin</span>
                        ) : (
                          <>
                            <div className="font-semibold text-emerald-700">{stopEta.etaMinutes} mins</div>
                            <div className="text-slate-500">{stopEta.distanceRemainingKm} km</div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* CONDUCTOR ASSIST VIEW */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-600" />
              <h2 className="text-base font-semibold text-slate-900">
                Conductor Passenger Order Assist ({tripOrders.length})
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              Authorized to assist passengers & confirm collection at restaurant stops
            </span>
          </div>

          {tripOrders.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No active passenger orders on this trip yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-medium">Order / Code</th>
                    <th className="py-3 px-4 font-medium">Passenger & Seat</th>
                    <th className="py-3 px-4 font-medium">Restaurant Stop</th>
                    <th className="py-3 px-4 font-medium">Mode</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Conductor Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tripOrders.map((ord) => {
                    const rest = state.restaurants.find((r) => r.id === ord.restaurantId);
                    return (
                      <tr key={ord.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono">
                          <div className="font-semibold text-slate-900">{ord.id}</div>
                          <div className="text-emerald-700">Code {ord.pickupCode}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{ord.passengerName}</div>
                          <div className="text-slate-500">Seat {ord.seatNumber || '—'} · {ord.passengerPhone}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{rest?.name}</div>
                          <div className="text-slate-500">{rest?.city}</div>
                        </td>
                        <td className="py-3 px-4">{ord.orderType}</td>
                        <td className="py-3 px-4 font-medium">
                          <span
                            className={
                              ord.status === 'READY'
                                ? 'text-emerald-700'
                                : ord.status === 'COMPLETED'
                                  ? 'text-slate-500'
                                  : 'text-amber-700'
                            }
                          >
                            {ord.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {ord.status === 'READY' ? (
                            <button
                              type="button"
                              onClick={() =>
                                patch(`/api/orders/${ord.id}/status`, {
                                  status: 'COMPLETED',
                                  actorRole: 'CONDUCTOR',
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm Collection
                            </button>
                          ) : ord.status === 'COMPLETED' ? (
                            <span className="text-slate-400">Collected</span>
                          ) : (
                            <span className="text-slate-400 inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" /> In Kitchen
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
