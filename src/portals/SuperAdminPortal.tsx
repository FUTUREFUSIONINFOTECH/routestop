import { useMemo, useState } from 'react';
import {
  Building2,
  Bus,
  Check,
  Download,
  FileSpreadsheet,
  GitBranch,
  IndianRupee,
  LayoutDashboard,
  Link2,
  MapPin,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Store,
  X,
} from 'lucide-react';
import { RouteMapVisualizer } from '../components/RouteMapVisualizer';
import type { PlatformState } from '../types/platform';

interface SuperAdminPortalProps {
  state: PlatformState;
  post: <T = unknown>(url: string, body?: unknown) => Promise<T>;
  patch: <T = unknown>(url: string, body?: unknown) => Promise<T>;
  onOpenPassengerQr: (qrToken: string) => void;
}

type AdminSection =
  | 'dashboard'
  | 'restaurants'
  | 'transport'
  | 'routes'
  | 'partnerships'
  | 'orders'
  | 'payments'
  | 'reports';

export function SuperAdminPortal({
  state,
  post,
  patch,
  onOpenPassengerQr,
}: SuperAdminPortalProps) {
  const [section, setSection] = useState<AdminSection>('dashboard');
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7d' | 'month'>('today');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>('ALL');

  // Forms state
  const [showNewRest, setShowNewRest] = useState(false);
  const [newRest, setNewRest] = useState({
    name: '',
    ownerName: '',
    city: '',
    mobile: '',
    gstNumber: '',
    fssaiNumber: '',
    commissionPct: '5',
  });

  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newComp, setNewComp] = useState({ name: '', ownerName: '', mobile: '', registrationNo: '' });

  const [showNewVehicle, setShowNewVehicle] = useState(false);
  const [newVeh, setNewVeh] = useState({
    regNumber: '',
    type: 'AC Sleeper' as const,
    seatingCapacity: '36',
    companyId: state.companies[0]?.id || 'comp-kpn',
    routeId: state.routes[0]?.id || 'route-chm',
  });

  const [showNewRoute, setShowNewRoute] = useState(false);
  const [newRoute, setNewRoute] = useState({
    name: '',
    origin: '',
    destination: '',
    totalKm: '280',
    restaurantIds: [] as string[],
  });

  const [showNewPart, setShowNewPart] = useState(false);
  const [newPart, setNewPart] = useState({
    companyId: state.companies[0]?.id || 'comp-kpn',
    vehicleId: state.vehicles[0]?.id || 'veh-tn45',
    routeId: state.routes[0]?.id || 'route-chm',
    restaurantIds: ['rest-a2b'] as string[],
    startDate: '2026-11-25',
    endDate: '2027-11-25',
  });

  const origin = window.location.origin;

  // Computed KPI Metrics
  const kpis = useMemo(() => {
    const validOrders = state.orders.filter(
      (o) => o.paymentStatus === 'VERIFIED' && o.status !== 'REJECTED' && o.status !== 'CANCELLED'
    );
    const completedOrders = state.orders.filter((o) => o.status === 'COMPLETED');
    const cancelledOrders = state.orders.filter(
      (o) => o.status === 'CANCELLED' || o.status === 'REJECTED'
    );
    const paymentFailures = state.orders.filter((o) => o.paymentStatus === 'FAILED');
    const grossOrderValue = validOrders.reduce((s, o) => s + o.totalAmount, 0);
    const platformCommission = validOrders.reduce((s, o) => s + o.platformCommission, 0);

    const settledIds = new Set(state.settlements.flatMap((s) => s.orderIds));
    const pendingSettlements = validOrders
      .filter((o) => !settledIds.has(o.id))
      .reduce((s, o) => s + o.restaurantPayable, 0);

    return {
      totalRestaurants: state.restaurants.length,
      activeRestaurants: state.restaurants.filter((r) => r.status === 'APPROVED').length,
      pendingRestaurants: state.restaurants.filter((r) => r.status === 'PENDING').length,
      totalCompanies: state.companies.length,
      totalVehicles: state.vehicles.length,
      registeredDrivers: state.staff.filter((s) => s.role === 'DRIVER').length,
      activeTrips: state.trips.filter((t) => t.status === 'IN_PROGRESS').length,
      totalOrders: state.orders.length,
      completedOrders: completedOrders.length,
      cancelledOrders: cancelledOrders.length,
      grossOrderValue,
      platformCommission,
      pendingSettlements,
      paymentFailures: paymentFailures.length,
    };
  }, [state]);

  const filteredOrders = useMemo(() => {
    return state.orders.filter((ord) => {
      if (orderStatusFilter !== 'ALL' && ord.status !== orderStatusFilter) return false;
      if (!orderSearch.trim()) return true;
      const q = orderSearch.toLowerCase();
      const rest = state.restaurants.find((r) => r.id === ord.restaurantId);
      const veh = state.vehicles.find((v) => v.id === ord.vehicleId);
      return (
        ord.id.toLowerCase().includes(q) ||
        ord.passengerName.toLowerCase().includes(q) ||
        (rest?.name.toLowerCase().includes(q) ?? false) ||
        (veh?.regNumber.toLowerCase().includes(q) ?? false)
      );
    });
  }, [state.orders, state.restaurants, state.vehicles, orderSearch, orderStatusFilter]);

  const restaurantSettlementRows = useMemo(() => {
    const settledIds = new Set(state.settlements.flatMap((s) => s.orderIds));
    return state.restaurants
      .filter((r) => r.status === 'APPROVED')
      .map((rest) => {
        const restOrders = state.orders.filter(
          (o) =>
            o.restaurantId === rest.id &&
            o.paymentStatus === 'VERIFIED' &&
            o.status !== 'REJECTED' &&
            o.status !== 'CANCELLED'
        );
        const gross = restOrders.reduce((s, o) => s + o.subtotal, 0);
        const commission = restOrders.reduce((s, o) => s + o.platformCommission, 0);
        const gateway = restOrders.reduce((s, o) => s + o.gatewayFee, 0);
        const unsettled = restOrders.filter((o) => !settledIds.has(o.id));
        const pendingPayable = unsettled.reduce((s, o) => s + o.restaurantPayable, 0);
        return {
          restaurant: rest,
          orderCount: restOrders.length,
          gross,
          commission,
          gateway,
          unsettledCount: unsettled.length,
          pendingPayable,
        };
      });
  }, [state.restaurants, state.orders, state.settlements]);

  const exportCsv = () => {
    const header = [
      'Order ID',
      'Vehicle',
      'Route',
      'Restaurant',
      'Passenger',
      'Mode',
      'Subtotal',
      'Total Paid',
      'Commission',
      'Restaurant Payable',
      'Payment Status',
      'Order Status',
      'Created At',
    ];
    const rows = state.orders.map((o) => {
      const v = state.vehicles.find((veh) => veh.id === o.vehicleId)?.regNumber || '';
      const r = state.routes.find((rt) => rt.id === o.routeId)?.name || '';
      const rest = state.restaurants.find((rs) => rs.id === o.restaurantId)?.name || '';
      return [
        o.id,
        v,
        r,
        rest,
        o.passengerName,
        o.orderType,
        o.subtotal.toFixed(2),
        o.totalAmount.toFixed(2),
        o.platformCommission.toFixed(2),
        o.restaurantPayable.toFixed(2),
        o.paymentStatus,
        o.status,
        o.createdAt,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csvContent = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `routestop-orders-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const navItems: { id: AdminSection; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'restaurants', label: 'Restaurants', icon: Store, badge: kpis.pendingRestaurants || undefined },
    { id: 'transport', label: 'Transport & Fleet', icon: Bus },
    { id: 'routes', label: 'Routes & Stops', icon: GitBranch },
    { id: 'partnerships', label: 'Partnerships & QR', icon: QrCode },
    { id: 'orders', label: 'Master Orders', icon: ShoppingBag },
    { id: 'payments', label: 'Payments & Payouts', icon: IndianRupee },
    { id: 'reports', label: 'Reports & Export', icon: FileSpreadsheet },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
      {/* Left Sidebar Navigation */}
      <aside className="lg:w-60 shrink-0">
        <div className="bg-white border border-slate-200 rounded-xl p-2 flex lg:flex-col gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'bg-emerald-900 text-white'
                    : 'text-slate-600 hover:bg-emerald-50/60 hover:text-emerald-950'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge ? (
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      active ? 'text-emerald-300' : 'text-amber-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}

          <div className="hidden lg:block pt-3 mt-2 border-t border-slate-100 px-2 pb-1">
            <button
              type="button"
              onClick={() => post('/api/reset-demo')}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset Demo Data
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 space-y-6">
        {/* SECTION 4.1: DASHBOARD */}
        {section === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Super Admin Operations Overview</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time corridor telemetry, partner kitchens, fleet trips, and financial reconciliation
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
                {(
                  [
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: '7d', label: 'Last 7 Days' },
                    { id: 'month', label: 'This Month' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDateFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                      dateFilter === f.id
                        ? 'bg-emerald-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-4">
              {[
                { label: 'Active Restaurants', value: `${kpis.activeRestaurants} / ${kpis.totalRestaurants}`, sub: `${kpis.pendingRestaurants} pending approval` },
                { label: 'Transport & Fleet', value: `${kpis.totalCompanies} Cos · ${kpis.totalVehicles} Bus`, sub: `${kpis.registeredDrivers} registered drivers` },
                { label: 'Active Live Trips', value: String(kpis.activeTrips), sub: `${state.trips.length} total scheduled` },
                { label: 'Orders (Done / Fail)', value: `${kpis.totalOrders} (${kpis.completedOrders} / ${kpis.cancelledOrders})`, sub: `${kpis.paymentFailures} payment failure(s)` },
                { label: 'Gross Order Value', value: `₹${kpis.grossOrderValue.toFixed(0)}`, sub: `Comm ₹${kpis.platformCommission.toFixed(2)} · Pend ₹${kpis.pendingSettlements.toFixed(0)}` },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-xs text-slate-500">{kpi.label}</div>
                  <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                    {kpi.value}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums truncate">
                    {kpi.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* Active Trips Live Map */}
            {state.trips.filter((t) => t.status === 'IN_PROGRESS').map((trip) => {
              const route = state.routes.find((r) => r.id === trip.routeId);
              const veh = state.vehicles.find((v) => v.id === trip.vehicleId);
              if (!route) return null;
              return (
                <div key={trip.id} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">
                      Live Active Trip · {veh?.regNumber}
                    </span>
                    <span className="font-mono tabular-nums">Progress {trip.progressPct}%</span>
                  </div>
                  <RouteMapVisualizer
                    route={route}
                    trip={trip}
                    restaurants={state.restaurants}
                    compact
                  />
                </div>
              );
            })}

            {/* Recent Audit Logs */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Platform Security & Financial Audit Log</h2>
                <span className="text-xs text-slate-500">Latest {Math.min(6, state.auditLogs.length)} events</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {state.auditLogs.slice(0, 6).map((log) => (
                  <div key={log.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-slate-900">{log.action}</span>
                      <span className="text-slate-600">{log.details}</span>
                    </div>
                    <span className="font-mono text-slate-400">
                      {log.actorRole} · {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4.2: RESTAURANT MANAGEMENT */}
        {section === 'restaurants' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Restaurant Partner Management</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Approve registrations, configure commission rates, FSSAI/GST records, and order acceptance
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewRest((v) => !v)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Register Restaurant
              </button>
            </div>

            {showNewRest && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await post('/api/restaurants', {
                    ...newRest,
                    commissionPct: Number(newRest.commissionPct),
                  });
                  setNewRest({
                    name: '',
                    ownerName: '',
                    city: '',
                    mobile: '',
                    gstNumber: '',
                    fssaiNumber: '',
                    commissionPct: '5',
                  });
                  setShowNewRest(false);
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Restaurant Name</label>
                  <input
                    required
                    value={newRest.name}
                    onChange={(e) => setNewRest({ ...newRest, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Owner Name</label>
                  <input
                    required
                    value={newRest.ownerName}
                    onChange={(e) => setNewRest({ ...newRest, ownerName: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Highway City</label>
                  <input
                    required
                    value={newRest.city}
                    onChange={(e) => setNewRest({ ...newRest, city: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div className="flex gap-2 items-end">
                  <div className="w-24">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Comm %</label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={newRest.commissionPct}
                      onChange={(e) => setNewRest({ ...newRest, commissionPct: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-medium">Restaurant & City</th>
                      <th className="py-3 px-4 font-medium">Owner & Contact</th>
                      <th className="py-3 px-4 font-medium">GST / FSSAI</th>
                      <th className="py-3 px-4 font-medium text-right">Comm %</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.restaurants.map((rest) => (
                      <tr key={rest.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{rest.name}</div>
                          <div className="text-slate-500">
                            {rest.city} · {rest.operatingHours}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="text-slate-900">{rest.ownerName}</div>
                          <div className="text-slate-500 font-mono">{rest.mobile}</div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          <div>GST: {rest.gstNumber}</div>
                          <div>FSSAI: {rest.fssaiNumber}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          <input
                            type="number"
                            min={1}
                            max={25}
                            value={rest.commissionPct}
                            onChange={(e) =>
                              patch(`/api/restaurants/${rest.id}`, {
                                commissionPct: Number(e.target.value) || 5,
                              })
                            }
                            aria-label={`Commission for ${rest.name}`}
                            className="w-14 text-right border border-slate-200 rounded px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="py-3.5 px-4 font-medium">
                          <span
                            className={
                              rest.status === 'APPROVED'
                                ? 'text-emerald-700'
                                : rest.status === 'PENDING'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }
                          >
                            {rest.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
                          {rest.status === 'PENDING' && (
                            <button
                              type="button"
                              onClick={() =>
                                patch(`/api/restaurants/${rest.id}`, {
                                  status: 'APPROVED',
                                  acceptingOrders: true,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800"
                            >
                              Approve
                            </button>
                          )}
                          {rest.status === 'APPROVED' ? (
                            <button
                              type="button"
                              onClick={() =>
                                patch(`/api/restaurants/${rest.id}`, {
                                  status: 'SUSPENDED',
                                  acceptingOrders: false,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                            >
                              Suspend
                            </button>
                          ) : rest.status === 'SUSPENDED' ? (
                            <button
                              type="button"
                              onClick={() =>
                                patch(`/api/restaurants/${rest.id}`, {
                                  status: 'APPROVED',
                                  acceptingOrders: true,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                            >
                              Reactivate
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4.3: TRANSPORT & FLEET */}
        {section === 'transport' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Transport Companies & Vehicles</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Approve operators, manage fleet registrations, and assign drivers & conductors
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewCompany((v) => !v)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  <Building2 className="w-3.5 h-3.5" /> Add Company
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewVehicle((v) => !v)}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Vehicle
                </button>
              </div>
            </div>

            {showNewCompany && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await post('/api/companies', newComp);
                  setNewComp({ name: '', ownerName: '', mobile: '', registrationNo: '' });
                  setShowNewCompany(false);
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Company Name</label>
                  <input
                    required
                    value={newComp.name}
                    onChange={(e) => setNewComp({ ...newComp, name: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Owner Name</label>
                  <input
                    required
                    value={newComp.ownerName}
                    onChange={(e) => setNewComp({ ...newComp, ownerName: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Reg Number</label>
                  <input
                    value={newComp.registrationNo}
                    onChange={(e) => setNewComp({ ...newComp, registrationNo: e.target.value })}
                    placeholder="TN-01-TR-2026"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                  />
                </div>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                >
                  Register Company
                </button>
              </form>
            )}

            {showNewVehicle && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await post('/api/vehicles', {
                    ...newVeh,
                    seatingCapacity: Number(newVeh.seatingCapacity),
                  });
                  setNewVeh({ ...newVeh, regNumber: '' });
                  setShowNewVehicle(false);
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
              >
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Vehicle Reg No</label>
                  <input
                    required
                    value={newVeh.regNumber}
                    onChange={(e) => setNewVeh({ ...newVeh, regNumber: e.target.value })}
                    placeholder="TN 38 XY 9012"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Transport Company</label>
                  <select
                    value={newVeh.companyId}
                    onChange={(e) => setNewVeh({ ...newVeh, companyId: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                  >
                    {state.companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Assigned Route</label>
                  <select
                    value={newVeh.routeId}
                    onChange={(e) => setNewVeh({ ...newVeh, routeId: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                  >
                    {state.routes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  Save Vehicle
                </button>
              </form>
            )}

            {/* Companies Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                Registered Transport Companies ({state.companies.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-medium">Company</th>
                      <th className="py-3 px-4 font-medium">Owner & Mobile</th>
                      <th className="py-3 px-4 font-medium">Registration / Docs</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.companies.map((c) => (
                      <tr key={c.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-semibold text-slate-900">{c.name}</td>
                        <td className="py-3 px-4">
                          {c.ownerName} · <span className="font-mono text-slate-500">{c.mobile}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {c.registrationNo} · {c.documentRef}
                        </td>
                        <td className="py-3 px-4 font-medium">
                          <span
                            className={
                              c.status === 'APPROVED'
                                ? 'text-emerald-700'
                                : c.status === 'PENDING'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {c.status === 'PENDING' ? (
                            <button
                              type="button"
                              onClick={() => patch(`/api/companies/${c.id}`, { status: 'APPROVED' })}
                              className="px-3 py-1 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800"
                            >
                              Approve
                            </button>
                          ) : c.status === 'APPROVED' ? (
                            <button
                              type="button"
                              onClick={() => patch(`/api/companies/${c.id}`, { status: 'SUSPENDED' })}
                              className="px-3 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => patch(`/api/companies/${c.id}`, { status: 'APPROVED' })}
                              className="px-3 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                            >
                              Reactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Vehicles Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                Active Fleet & Crew Assignments ({state.vehicles.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-medium">Vehicle Reg</th>
                      <th className="py-3 px-4 font-medium">Type & Capacity</th>
                      <th className="py-3 px-4 font-medium">Operator</th>
                      <th className="py-3 px-4 font-medium">Assigned Route</th>
                      <th className="py-3 px-4 font-medium">Driver / Conductor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {state.vehicles.map((v) => {
                      const comp = state.companies.find((c) => c.id === v.companyId);
                      const rt = state.routes.find((r) => r.id === v.routeId);
                      const drv = state.staff.find((s) => s.id === v.driverId);
                      const cnd = state.staff.find((s) => s.id === v.conductorId);
                      return (
                        <tr key={v.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{v.regNumber}</td>
                          <td className="py-3 px-4">
                            {v.type} · {v.seatingCapacity} seats
                          </td>
                          <td className="py-3 px-4">{comp?.name}</td>
                          <td className="py-3 px-4">{rt?.name}</td>
                          <td className="py-3 px-4 text-slate-600">
                            {drv?.name} / {cnd?.name}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4.4: ROUTES */}
        {section === 'routes' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Highway Routes & Restaurant Stops</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure origin-to-destination corridors, stop order, and expected arrival windows
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewRoute((v) => !v)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Create Route
              </button>
            </div>

            {showNewRoute && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await post('/api/routes', {
                    ...newRoute,
                    totalKm: Number(newRoute.totalKm),
                  });
                  setNewRoute({ name: '', origin: '', destination: '', totalKm: '280', restaurantIds: [] });
                  setShowNewRoute(false);
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Route Name</label>
                    <input
                      required
                      value={newRoute.name}
                      onChange={(e) => setNewRoute({ ...newRoute, name: e.target.value })}
                      placeholder="Chennai → Coimbatore"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Origin</label>
                    <input
                      required
                      value={newRoute.origin}
                      onChange={(e) => setNewRoute({ ...newRoute, origin: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Destination</label>
                    <input
                      required
                      value={newRoute.destination}
                      onChange={(e) => setNewRoute({ ...newRoute, destination: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Distance (km)</label>
                    <input
                      type="number"
                      value={newRoute.totalKm}
                      onChange={(e) => setNewRoute({ ...newRoute, totalKm: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="text-slate-600 font-medium">Partner Stops:</span>
                    {state.restaurants
                      .filter((r) => r.status === 'APPROVED')
                      .map((r) => (
                        <label key={r.id} className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={newRoute.restaurantIds.includes(r.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...newRoute.restaurantIds, r.id]
                                : newRoute.restaurantIds.filter((id) => id !== r.id);
                              setNewRoute({ ...newRoute, restaurantIds: next });
                            }}
                          />
                          {r.name}
                        </label>
                      ))}
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                  >
                    Save Highway Route
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-5">
              {state.routes.map((rt) => (
                <div key={rt.id} className="space-y-3">
                  <RouteMapVisualizer route={rt} restaurants={state.restaurants} compact />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 4.5 & 4.6: PARTNERSHIPS & QR MANAGEMENT (CORE MODULE) */}
        {section === 'partnerships' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Bus–Restaurant Partnerships & Dynamic QR Management
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Core linking engine associating Transport Company + Vehicle + Route + Partner Kitchens with signed QR tokens
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewPart((v) => !v)}
                className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 inline-flex items-center gap-1.5"
              >
                <Link2 className="w-3.5 h-3.5" /> New Partnership & Generate QR
              </button>
            </div>

            {showNewPart && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await post('/api/partnerships', newPart);
                  setShowNewPart(false);
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Transport Company</label>
                    <select
                      value={newPart.companyId}
                      onChange={(e) => setNewPart({ ...newPart, companyId: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                    >
                      {state.companies
                        .filter((c) => c.status === 'APPROVED')
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Bus / Vehicle</label>
                    <select
                      value={newPart.vehicleId}
                      onChange={(e) => setNewPart({ ...newPart, vehicleId: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                    >
                      {state.vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.regNumber} ({v.type})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Route</label>
                    <select
                      value={newPart.routeId}
                      onChange={(e) => setNewPart({ ...newPart, routeId: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                    >
                      {state.routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Select Multiple Partner Restaurants Along Route
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {state.restaurants
                      .filter((r) => r.status === 'APPROVED')
                      .map((r) => (
                        <label
                          key={r.id}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-xs cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={newPart.restaurantIds.includes(r.id)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...newPart.restaurantIds, r.id]
                                : newPart.restaurantIds.filter((id) => id !== r.id);
                              setNewPart({ ...newPart, restaurantIds: next });
                            }}
                          />
                          {r.name} ({r.city})
                        </label>
                      ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                  >
                    Approve Partnership & Issue QR
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {state.qrCodes.map((qr) => {
                const part = state.partnerships.find((p) => p.id === qr.partnershipId);
                const veh = state.vehicles.find((v) => v.id === qr.vehicleId);
                const comp = state.companies.find((c) => c.id === part?.companyId);
                const route = state.routes.find((r) => r.id === qr.routeId);
                const rests = (part?.restaurantIds || [])
                  .map((id) => state.restaurants.find((r) => r.id === id)?.name)
                  .filter(Boolean);

                return (
                  <div key={qr.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-500">{comp?.name}</div>
                        <div className="text-base font-bold font-mono text-slate-900">{veh?.regNumber}</div>
                        <div className="text-xs text-slate-600">{route?.name}</div>
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          qr.active && part?.status === 'APPROVED' ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {qr.active && part?.status === 'APPROVED' ? 'Active QR' : 'Paused'}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                      <img
                        src={`/api/qr/${encodeURIComponent(qr.token)}/svg?origin=${encodeURIComponent(origin)}`}
                        alt={`QR ${qr.token}`}
                        className="w-24 h-24 bg-white p-1.5 rounded-lg border border-slate-200 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0 text-xs space-y-1.5">
                        <div className="font-mono font-semibold text-slate-900 truncate">{qr.token}</div>
                        <div className="text-slate-600 font-mono tabular-nums">
                          {qr.scanCount} scans · {qr.orderCount} orders
                        </div>
                        <div className="text-slate-500 line-clamp-2">
                          Partners: {rests.join(' → ')}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => onOpenPassengerQr(qr.token)}
                        className="py-2 px-3 rounded-lg bg-slate-900 text-white font-medium hover:bg-slate-800"
                      >
                        Open Passenger Flow
                      </button>
                      <a
                        href={`/api/qr/${encodeURIComponent(qr.token)}/png?origin=${encodeURIComponent(origin)}`}
                        download={`${qr.token}.png`}
                        className="py-2 px-3 rounded-lg border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 inline-flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> PNG
                      </a>
                      <button
                        type="button"
                        onClick={() => post(`/api/qr/${qr.id}/regenerate`)}
                        className="py-2 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Regenerate
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(`/api/qr/${qr.id}/toggle`)}
                        className="py-2 px-3 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                      >
                        {qr.active ? 'Deactivate QR' : 'Activate QR'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SECTION 4.7: MASTER ORDER MANAGEMENT */}
        {section === 'orders' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Master Order Ledger</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Every order preserves exact bus, company, route, restaurant, and GPS/ETA snapshot
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    placeholder="Search ID, bus, passenger..."
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs w-52 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="NEW">NEW</option>
                  <option value="ACCEPTED">ACCEPTED</option>
                  <option value="PREPARING">PREPARING</option>
                  <option value="READY">READY</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-medium">Order / Passenger</th>
                      <th className="py-3 px-4 font-medium">Bus & Route</th>
                      <th className="py-3 px-4 font-medium">Restaurant & Items</th>
                      <th className="py-3 px-4 font-medium">Mode / ETA</th>
                      <th className="py-3 px-4 font-medium text-right">Amount</th>
                      <th className="py-3 px-4 font-medium">Payment</th>
                      <th className="py-3 px-4 font-medium">Prep Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map((ord) => {
                      const veh = state.vehicles.find((v) => v.id === ord.vehicleId);
                      const rt = state.routes.find((r) => r.id === ord.routeId);
                      const rest = state.restaurants.find((r) => r.id === ord.restaurantId);
                      return (
                        <tr key={ord.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4">
                            <div className="font-mono font-bold text-slate-900">{ord.id}</div>
                            <div className="text-slate-600">{ord.passengerName}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-mono font-semibold text-slate-900">{veh?.regNumber}</div>
                            <div className="text-slate-500">{rt?.code}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">{rest?.name}</div>
                            <div className="text-slate-500 truncate max-w-[200px]">
                              {ord.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums">
                            <div>{ord.orderType}</div>
                            <div className="text-slate-500">{ord.etaMinutesAtOrder}m ETA</div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                            ₹{ord.totalAmount.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 font-medium">
                            <span
                              className={
                                ord.paymentStatus === 'VERIFIED'
                                  ? 'text-emerald-700'
                                  : ord.paymentStatus === 'FAILED'
                                    ? 'text-red-600'
                                    : 'text-amber-700'
                              }
                            >
                              {ord.paymentStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{ord.status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4.8: PAYMENTS & COMMISSIONS */}
        {section === 'payments' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Payment Reconciliation, Commissions & Restaurant Settlements
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Preserves historical commission rates per order and accounts for gateway fees & fee GST
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                Restaurant Payable & Settlement Queue
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-medium">Restaurant</th>
                      <th className="py-3 px-4 font-medium text-right">Orders</th>
                      <th className="py-3 px-4 font-medium text-right">Gross Sales</th>
                      <th className="py-3 px-4 font-medium text-right">Platform Comm</th>
                      <th className="py-3 px-4 font-medium text-right">Gateway Fees</th>
                      <th className="py-3 px-4 font-medium text-right">Pending Payable</th>
                      <th className="py-3 px-4 font-medium text-right">Settlement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {restaurantSettlementRows.map((row) => (
                      <tr key={row.restaurant.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-900">{row.restaurant.name}</div>
                          <div className="text-slate-500 font-mono">{row.restaurant.bankAccount}</div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">{row.orderCount}</td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums">
                          ₹{row.gross.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                          ₹{row.commission.toFixed(2)} ({row.restaurant.commissionPct}%)
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-500">
                          ₹{row.gateway.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-700">
                          ₹{row.pendingPayable.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {row.unsettledCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => post(`/api/settlements/${row.restaurant.id}/settle`)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 whitespace-nowrap"
                            >
                              Settle ({row.unsettledCount})
                            </button>
                          ) : (
                            <span className="text-slate-400">Up to date</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4.9: REPORTS & EXPORT */}
        {section === 'reports' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Financial & Operational Reports</h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Export route-wise, restaurant-wise, and item popularity reports in CSV/Excel or print PDF
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={exportCsv}
                  className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Export CSV / Excel
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> Print / PDF
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Route-wise Revenue */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Route-Wise Gross Sales</h2>
                <div className="divide-y divide-slate-100 text-xs">
                  {state.routes.map((rt) => {
                    const rtOrders = state.orders.filter(
                      (o) => o.routeId === rt.id && o.paymentStatus === 'VERIFIED'
                    );
                    const total = rtOrders.reduce((s, o) => s + o.totalAmount, 0);
                    return (
                      <div key={rt.id} className="py-2.5 flex justify-between">
                        <span className="text-slate-700 font-medium">{rt.name}</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {rtOrders.length} orders · ₹{total.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Bus-wise Sales */}
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Vehicle-Wise Order Performance</h2>
                <div className="divide-y divide-slate-100 text-xs">
                  {state.vehicles.map((veh) => {
                    const vOrders = state.orders.filter(
                      (o) => o.vehicleId === veh.id && o.paymentStatus === 'VERIFIED'
                    );
                    const total = vOrders.reduce((s, o) => s + o.totalAmount, 0);
                    return (
                      <div key={veh.id} className="py-2.5 flex justify-between">
                        <span className="font-mono font-medium text-slate-900">{veh.regNumber}</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-900">
                          {vOrders.length} orders · ₹{total.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
