import { useMemo, useState } from 'react';
import {
  Bell,
  Bus,
  Check,
  Clock,
  IndianRupee,
  MapPin,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { RouteMapVisualizer } from '../components/RouteMapVisualizer';
import type { OrderStatus, PlatformState } from '../types/platform';

interface RestaurantPortalProps {
  state: PlatformState;
  post: <T = unknown>(url: string, body?: unknown) => Promise<T>;
  patch: <T = unknown>(url: string, body?: unknown) => Promise<T>;
}

export function RestaurantPortal({ state, post, patch }: RestaurantPortalProps) {
  const approvedRestaurants = useMemo(
    () => state.restaurants.filter((r) => r.status === 'APPROVED'),
    [state.restaurants]
  );

  const [selectedRestId, setSelectedRestId] = useState<string>(approvedRestaurants[0]?.id || 'rest-a2b');
  const [activeTab, setActiveTab] = useState<'orders' | 'buses' | 'menu' | 'settlements'>('orders');
  const [pickupVerifyCode, setPickupVerifyCode] = useState<string>('');
  const [verifyFeedback, setVerifyFeedback] = useState<string | null>(null);

  // Add Menu Item Modal State
  const [showAddDish, setShowAddDish] = useState(false);
  const [dishName, setDishName] = useState('');
  const [dishCat, setDishCat] = useState('South Indian Classics');
  const [dishPrice, setDishPrice] = useState('180');
  const [dishDesc, setDishDesc] = useState('');
  const [dishVeg, setDishVeg] = useState(true);

  const restaurant = useMemo(
    () => state.restaurants.find((r) => r.id === selectedRestId) || approvedRestaurants[0],
    [state.restaurants, selectedRestId, approvedRestaurants]
  );

  const restaurantOrders = useMemo(
    () =>
      state.orders.filter(
        (o) => o.restaurantId === restaurant?.id && o.paymentStatus !== 'FAILED'
      ),
    [state.orders, restaurant]
  );

  const incomingBuses = useMemo(() => {
    if (!restaurant) return [];
    return state.trips
      .map((trip) => {
        const stopEta = trip.stopEtas.find((s) => s.restaurantId === restaurant.id);
        if (!stopEta) return null;
        const vehicle = state.vehicles.find((v) => v.id === trip.vehicleId);
        const route = state.routes.find((r) => r.id === trip.routeId);
        const queuedOrders = restaurantOrders.filter(
          (o) =>
            o.tripId === trip.id &&
            ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)
        );
        return { trip, stopEta, vehicle, route, queuedOrders };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [state.trips, state.vehicles, state.routes, restaurant, restaurantOrders]);

  const restaurantMenu = useMemo(
    () => state.menuItems.filter((m) => m.restaurantId === restaurant?.id),
    [state.menuItems, restaurant]
  );

  const restaurantAlerts = useMemo(
    () =>
      state.notifications
        .filter((n) => n.targetRole === 'RESTAURANT' && (!n.targetId || n.targetId === restaurant?.id))
        .slice(0, 4),
    [state.notifications, restaurant]
  );

  const restaurantSettlements = useMemo(
    () => state.settlements.filter((s) => s.restaurantId === restaurant?.id),
    [state.settlements, restaurant]
  );

  const financialSummary = useMemo(() => {
    const valid = restaurantOrders.filter((o) => o.status !== 'REJECTED' && o.status !== 'CANCELLED');
    const gross = valid.reduce((s, o) => s + o.subtotal, 0);
    const commission = valid.reduce((s, o) => s + o.platformCommission, 0);
    const netPayable = valid.reduce((s, o) => s + o.restaurantPayable, 0);
    const settledIds = new Set(restaurantSettlements.flatMap((s) => s.orderIds));
    const pendingSettlement = valid
      .filter((o) => !settledIds.has(o.id))
      .reduce((s, o) => s + o.restaurantPayable, 0);
    return { gross, commission, netPayable, pendingSettlement, count: valid.length };
  }, [restaurantOrders, restaurantSettlements]);

  if (!restaurant) return null;

  const advanceOrder = async (orderId: string, status: OrderStatus, reason?: string) => {
    await patch(`/api/orders/${orderId}/status`, {
      status,
      reason,
      actorRole: 'RESTAURANT',
    });
  };

  const handleVerifyPickup = async () => {
    const code = pickupVerifyCode.trim();
    if (!code) return;
    const match = restaurantOrders.find(
      (o) => (o.pickupCode === code || o.id.toLowerCase() === code.toLowerCase()) && o.status === 'READY'
    );
    if (!match) {
      setVerifyFeedback('No READY order matches that pickup code or Order ID.');
      return;
    }
    await advanceOrder(match.id, 'COMPLETED');
    setPickupVerifyCode('');
    setVerifyFeedback(`Verified & completed ${match.id} (${match.passengerName}).`);
    window.setTimeout(() => setVerifyFeedback(null), 4000);
  };

  const handleCreateDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishName.trim()) return;
    await post('/api/menu-items', {
      restaurantId: restaurant.id,
      category: dishCat,
      name: dishName,
      description: dishDesc,
      price: Number(dishPrice) || 150,
      isVeg: dishVeg,
    });
    setDishName('');
    setDishDesc('');
    setShowAddDish(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Restaurant Partner Context Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <div className="text-xs text-slate-500">Restaurant Partner App · Kitchen & Manager View</div>
            <div className="flex items-center gap-3 mt-1">
              <select
                value={restaurant.id}
                onChange={(e) => setSelectedRestId(e.target.value)}
                aria-label="Select Restaurant Partner"
                className="text-lg font-bold text-slate-900 bg-transparent border-b border-slate-300 pb-0.5 pr-4 focus:outline-none focus:border-emerald-700"
              >
                {approvedRestaurants.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.city})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-500 hidden sm:block">
            <span>FSSAI {restaurant.fssaiNumber}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            <span>Commission {restaurant.commissionPct}%</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              patch(`/api/restaurants/${restaurant.id}`, {
                acceptingOrders: !restaurant.acceptingOrders,
              })
            }
            className={`min-h-[40px] px-4 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors ${
              restaurant.acceptingOrders
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
            }`}
          >
            {restaurant.acceptingOrders ? (
              <>
                <ToggleRight className="w-4 h-4" /> Accepting Orders
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4" /> Orders Paused
              </>
            )}
          </button>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {[
              { id: 'orders', label: `Orders (${restaurantOrders.filter((o) => ['NEW', 'ACCEPTED', 'PREPARING', 'READY'].includes(o.status)).length})` },
              { id: 'buses', label: `Incoming Buses (${incomingBuses.length})` },
              { id: 'menu', label: 'Menu & Stock' },
              { id: 'settlements', label: 'Sales & Payouts' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Real-time Notification Strip */}
      {restaurantAlerts.length > 0 && (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-emerald-950">
            <Bell className="w-4 h-4 text-emerald-700 shrink-0" />
            <div>
              <span className="font-semibold">{restaurantAlerts[0].title}:</span>{' '}
              <span>{restaurantAlerts[0].message}</span>
            </div>
          </div>
          <span className="text-[11px] font-mono text-emerald-700 whitespace-nowrap shrink-0">
            Live Push
          </span>
        </div>
      )}

      {/* TAB 1: ORDERS & KITCHEN WORKFLOW */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Quick Pickup Verification Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Express Pickup Verification:</span> Enter
              passenger&apos;s 4-digit pickup code or Order ID to complete handoff.
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={pickupVerifyCode}
                  onChange={(e) => setPickupVerifyCode(e.target.value)}
                  placeholder="Code e.g. 4821"
                  className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono w-40 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <button
                type="button"
                onClick={handleVerifyPickup}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Verify & Complete
              </button>
            </div>
          </div>

          {verifyFeedback && (
            <div className="p-3 rounded-lg bg-slate-900 text-white text-xs">{verifyFeedback}</div>
          )}

          {/* Kanban / Stage Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {(
              [
                { status: 'NEW', title: 'New Paid Orders', empty: 'No new incoming orders' },
                { status: 'ACCEPTED', title: 'Accepted Queue', empty: 'No accepted orders waiting' },
                { status: 'PREPARING', title: 'In Preparation', empty: 'Kitchen line is clear' },
                { status: 'READY', title: 'Ready for Collection', empty: 'No orders awaiting pickup' },
              ] as const
            ).map((col) => {
              const colOrders = restaurantOrders.filter((o) => o.status === col.status);
              return (
                <div
                  key={col.status}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-900">{col.title}</h3>
                    <span className="text-xs font-mono tabular-nums font-semibold text-slate-500">
                      {colOrders.length}
                    </span>
                  </div>

                  {colOrders.length === 0 ? (
                    <div className="py-10 text-center text-xs text-slate-400">{col.empty}</div>
                  ) : (
                    colOrders.map((ord) => {
                      const veh = state.vehicles.find((v) => v.id === ord.vehicleId);
                      const trip = state.trips.find((t) => t.id === ord.tripId);
                      const stopEta = trip?.stopEtas.find((s) => s.restaurantId === restaurant.id);

                      return (
                        <div
                          key={ord.id}
                          className="border border-slate-200 rounded-lg p-3.5 bg-slate-50/50 space-y-2.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-mono font-bold text-slate-900">{ord.id}</span>
                            <span className="font-mono text-emerald-700 font-semibold">
                              Code {ord.pickupCode}
                            </span>
                          </div>

                          <div className="text-xs text-slate-600">
                            <span className="font-semibold text-slate-900">{ord.passengerName}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{ord.orderType === 'DINE_IN' ? `Dine-In (${ord.dineInGuests || 1})` : 'Takeaway'}</span>
                            {ord.seatNumber && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span>Seat {ord.seatNumber}</span>
                              </>
                            )}
                          </div>

                          <div className="text-xs font-mono text-slate-600 flex items-center justify-between bg-white border border-slate-200 rounded px-2.5 py-1.5">
                            <span>{veh?.regNumber}</span>
                            <span className="text-emerald-700 font-semibold">
                              {stopEta?.passed ? 'At Stop' : `ETA ${stopEta?.etaMinutes ?? ord.etaMinutesAtOrder}m`}
                            </span>
                          </div>

                          <ul className="text-xs text-slate-800 space-y-1">
                            {ord.items.map((it) => (
                              <li key={it.menuItemId} className="flex justify-between">
                                <span>
                                  {it.qty}× {it.name}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {(ord.specialInstructions || ord.dietaryNotes) && (
                            <div className="text-[11px] text-emerald-900 bg-emerald-50 rounded px-2 py-1">
                              Note: {ord.specialInstructions || ord.dietaryNotes}
                            </div>
                          )}

                          <div className="pt-2 flex items-center gap-2">
                            {ord.status === 'NEW' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => advanceOrder(ord.id, 'ACCEPTED')}
                                  className="flex-1 min-h-[36px] rounded-lg bg-emerald-800 text-white text-xs font-medium hover:bg-emerald-900 inline-flex items-center justify-center gap-1"
                                >
                                  <Check className="w-3.5 h-3.5" /> Accept
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    advanceOrder(ord.id, 'REJECTED', 'Item unavailable for bus arrival window')
                                  }
                                  className="min-h-[36px] px-3 rounded-lg border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50 inline-flex items-center justify-center gap-1"
                                >
                                  <X className="w-3.5 h-3.5" /> Reject
                                </button>
                              </>
                            )}
                            {ord.status === 'ACCEPTED' && (
                              <button
                                type="button"
                                onClick={() => advanceOrder(ord.id, 'PREPARING')}
                                className="w-full min-h-[36px] rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800"
                              >
                                Start Preparing
                              </button>
                            )}
                            {ord.status === 'PREPARING' && (
                              <button
                                type="button"
                                onClick={() => advanceOrder(ord.id, 'READY')}
                                className="w-full min-h-[36px] rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800"
                              >
                                Mark Food Ready
                              </button>
                            )}
                            {ord.status === 'READY' && (
                              <button
                                type="button"
                                onClick={() => advanceOrder(ord.id, 'COMPLETED')}
                                className="w-full min-h-[36px] rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
                              >
                                Confirm Handover
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: INCOMING BUSES & LIVE GPS MAP */}
      {activeTab === 'buses' && (
        <div className="space-y-5">
          {incomingBuses.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              No active buses scheduled to stop at {restaurant.name}.
            </div>
          ) : (
            incomingBuses.map(({ trip, stopEta, vehicle, route, queuedOrders }) => (
              <div key={trip.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                      <Bus className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{vehicle?.regNumber}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-xs text-slate-600">{route?.name}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Trip Status: {trip.status} · Speed {trip.speedKmh} km/h
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <div className="text-xs text-slate-400">Queued Orders</div>
                      <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                        {queuedOrders.length}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Distance Away</div>
                      <div className="text-base font-bold font-mono tabular-nums text-slate-900">
                        {stopEta.passed ? 'Passed' : `${stopEta.distanceRemainingKm} km`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Live ETA</div>
                      <div className="text-base font-bold font-mono tabular-nums text-emerald-700">
                        {stopEta.passed ? '—' : `${stopEta.etaMinutes} mins`}
                      </div>
                    </div>
                  </div>
                </div>

                {route && (
                  <RouteMapVisualizer
                    route={route}
                    trip={trip}
                    restaurants={state.restaurants}
                    highlightedRestaurantId={restaurant.id}
                    compact
                  />
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: MENU & AVAILABILITY MANAGEMENT */}
      {activeTab === 'menu' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Menu & Real-Time Stock Control</h2>
              <p className="text-xs text-slate-500">
                Toggling availability updates Passenger QR menus immediately and blocks out-of-stock checkouts.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddDish((v) => !v)}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Menu Item
            </button>
          </div>

          {showAddDish && (
            <form
              onSubmit={handleCreateDish}
              className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
            >
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Dish Name</label>
                <input
                  type="text"
                  required
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                  placeholder="e.g. Rava Kesari & Pongal Combo"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={dishCat}
                  onChange={(e) => setDishCat(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white"
                >
                  <option>South Indian Classics</option>
                  <option>Rice & Biryani</option>
                  <option>Executive Meals</option>
                  <option>Beverages & Quick Bites</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Price (₹)</label>
                <input
                  type="number"
                  min={20}
                  value={dishPrice}
                  onChange={(e) => setDishPrice(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={dishVeg}
                    onChange={(e) => setDishVeg(e.target.checked)}
                  />
                  Veg
                </label>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800"
                >
                  Save Dish
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {restaurantMenu.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-14 h-14 rounded-lg object-cover bg-slate-100 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <div className="text-xs text-slate-500">
                      {item.category} · {item.isVeg ? 'Veg' : 'Non-Veg'} · {item.prepMinutes} mins prep
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{item.name}</div>
                    <div className="text-xs text-slate-500 line-clamp-1">{item.description}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm font-mono font-bold tabular-nums text-slate-900">
                    ₹{item.price}
                  </span>
                  <button
                    type="button"
                    onClick={() => patch(`/api/menu-items/${item.id}`, { available: !item.available })}
                    className={`min-h-[36px] px-3.5 rounded-lg text-xs font-medium transition-colors ${
                      item.available
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    {item.available ? 'In Stock' : 'Marked Sold Out'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SALES, COMMISSION & SETTLEMENT HISTORY */}
      {activeTab === 'settlements' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Gross Food Sales</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                ₹{financialSummary.gross.toFixed(2)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Platform Commission ({restaurant.commissionPct}%)</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                ₹{financialSummary.commission.toFixed(2)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Net Earned Payable</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                ₹{financialSummary.netPayable.toFixed(2)}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs text-slate-500">Pending Settlement</div>
              <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                ₹{financialSummary.pendingSettlement.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Settlement Payout History</h3>
              <span className="text-xs text-slate-500 font-mono">{restaurant.bankAccount}</span>
            </div>
            {restaurantSettlements.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No payouts settled yet. Super Admin can trigger disbursement from the Payments tab.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-medium">Settlement ID</th>
                      <th className="py-3 px-4 font-medium">Orders</th>
                      <th className="py-3 px-4 font-medium text-right">Gross</th>
                      <th className="py-3 px-4 font-medium text-right">Commission + Fees</th>
                      <th className="py-3 px-4 font-medium text-right">Net Settled</th>
                      <th className="py-3 px-4 font-medium">UTR Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {restaurantSettlements.map((stl) => (
                      <tr key={stl.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">{stl.id}</td>
                        <td className="py-3 px-4 font-mono">{stl.orderIds.join(', ')}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          ₹{stl.grossAmount.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                          ₹{(stl.commissionAmount + stl.gatewayFeeTotal + stl.gstOnFees).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                          ₹{stl.netPayable.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">{stl.utrRef}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
