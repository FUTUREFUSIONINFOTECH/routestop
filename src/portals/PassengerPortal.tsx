import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bus,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Minus,
  Navigation,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Utensils,
} from 'lucide-react';
import { RouteMapVisualizer } from '../components/RouteMapVisualizer';
import type { Order, OrderType, PlatformState, Restaurant } from '../types/platform';

interface PassengerPortalProps {
  state: PlatformState;
  activeQrToken: string;
  onSelectQrToken: (token: string) => void;
  post: <T = unknown>(url: string, body?: unknown) => Promise<T>;
}

const ORDER_STEPS: { key: Order['status']; label: string }[] = [
  { key: 'NEW', label: 'Paid & Sent' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Food Ready' },
  { key: 'COMPLETED', label: 'Collected' },
];

export function PassengerPortal({
  state,
  activeQrToken,
  onSelectQrToken,
  post,
}: PassengerPortalProps) {
  const [step, setStep] = useState<'landing' | 'menu' | 'checkout' | 'tracking'>('landing');
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [vegOnly, setVegOnly] = useState<boolean>(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // Order Preferences
  const [orderType, setOrderType] = useState<OrderType>('TAKEAWAY');
  const [dineInGuests, setDineInGuests] = useState<number>(2);
  const [passengerName, setPassengerName] = useState<string>('Karthik Subramanian');
  const [passengerPhone, setPassengerPhone] = useState<string>('+91 98401 77412');
  const [seatNumber, setSeatNumber] = useState<string>('U6');
  const [specialInstructions, setSpecialInstructions] = useState<string>('');
  const [dietaryNotes, setDietaryNotes] = useState<string>('');

  // Checkout & Tracking state
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => `idem-${Date.now()}`);
  const [trackedOrderId, setTrackedOrderId] = useState<string | null>(null);

  const activeQr = useMemo(
    () => state.qrCodes.find((q) => q.token === activeQrToken) || state.qrCodes[0],
    [state.qrCodes, activeQrToken]
  );

  const partnership = useMemo(
    () => state.partnerships.find((p) => p.id === activeQr?.partnershipId),
    [state.partnerships, activeQr]
  );

  const vehicle = useMemo(
    () => state.vehicles.find((v) => v.id === activeQr?.vehicleId),
    [state.vehicles, activeQr]
  );

  const company = useMemo(
    () => state.companies.find((c) => c.id === partnership?.companyId),
    [state.companies, partnership]
  );

  const route = useMemo(
    () => state.routes.find((r) => r.id === activeQr?.routeId),
    [state.routes, activeQr]
  );

  const trip = useMemo(
    () => state.trips.find((t) => t.vehicleId === activeQr?.vehicleId && t.routeId === activeQr?.routeId),
    [state.trips, activeQr]
  );

  // Eligible Partner Restaurants per PRD Screen 2 rules
  const partnerRestaurants = useMemo(() => {
    if (!partnership || partnership.status !== 'APPROVED' || company?.status !== 'APPROVED') return [];
    return partnership.restaurantIds
      .map((id) => state.restaurants.find((r) => r.id === id))
      .filter((r): r is Restaurant => Boolean(r && r.status === 'APPROVED'));
  }, [partnership, company, state.restaurants]);

  useEffect(() => {
    if (!selectedRestaurantId && partnerRestaurants.length > 0) {
      const firstAccepting = partnerRestaurants.find((r) => r.acceptingOrders) || partnerRestaurants[0];
      setSelectedRestaurantId(firstAccepting.id);
    }
  }, [partnerRestaurants, selectedRestaurantId]);

  const selectedRestaurant = useMemo(
    () => state.restaurants.find((r) => r.id === selectedRestaurantId),
    [state.restaurants, selectedRestaurantId]
  );

  const nextAvailableStop = useMemo(() => {
    for (const rest of partnerRestaurants) {
      const eta = trip?.stopEtas.find((s) => s.restaurantId === rest.id);
      if (rest.acceptingOrders && (!eta || !eta.passed)) {
        return { restaurant: rest, eta };
      }
    }
    return null;
  }, [partnerRestaurants, trip]);

  const restaurantMenu = useMemo(
    () => state.menuItems.filter((m) => m.restaurantId === selectedRestaurantId),
    [state.menuItems, selectedRestaurantId]
  );

  const categories = useMemo(() => {
    const cats = Array.from(new Set(restaurantMenu.map((m) => m.category)));
    return ['All', ...cats];
  }, [restaurantMenu]);

  const filteredMenu = useMemo(() => {
    return restaurantMenu.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (vegOnly && !item.isVeg) return false;
      return true;
    });
  }, [restaurantMenu, selectedCategory, vegOnly]);

  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, qty]) => {
        const item = state.menuItems.find((m) => m.id === menuItemId);
        return item ? { item, qty } : null;
      })
      .filter((entry): entry is { item: (typeof state.menuItems)[number]; qty: number } => Boolean(entry));
  }, [cart, state.menuItems]);

  const totalItemCount = useMemo(
    () => cartItems.reduce((sum, entry) => sum + entry.qty, 0),
    [cartItems]
  );

  const subtotal = useMemo(
    () => cartItems.reduce((sum, { item, qty }) => sum + item.price * qty, 0),
    [cartItems]
  );
  const gstAmount = Number((subtotal * 0.05).toFixed(2));
  const serviceFee = subtotal > 0 ? 10 : 0;
  const totalPayable = Number((subtotal + gstAmount + serviceFee).toFixed(2));

  const busOrders = useMemo(
    () => state.orders.filter((o) => o.vehicleId === activeQr?.vehicleId),
    [state.orders, activeQr]
  );

  const activeTrackedOrder = useMemo(() => {
    if (trackedOrderId) {
      return state.orders.find((o) => o.id === trackedOrderId) || busOrders[0];
    }
    return busOrders[0];
  }, [trackedOrderId, state.orders, busOrders]);

  const handleScanSwitch = async (token: string) => {
    onSelectQrToken(token);
    setCart({});
    setSelectedRestaurantId('');
    setStep('landing');
    try {
      await post('/api/qr/scan', { token });
    } catch {
      // Non-blocking scan telemetry
    }
  };

  const handleSelectRestaurant = (restId: string, openMenu = false) => {
    if (selectedRestaurantId !== restId) {
      setCart({});
      setSelectedCategory('All');
    }
    setSelectedRestaurantId(restId);
    if (openMenu) {
      setStep('menu');
    }
  };

  const updateCart = (menuItemId: string, delta: number, itemName?: string, itemRestaurantId?: string) => {
    if (itemRestaurantId && selectedRestaurantId !== itemRestaurantId) {
      setSelectedRestaurantId(itemRestaurantId);
      setCart({ [menuItemId]: Math.max(1, delta) });
    } else {
      setCart((prev) => {
        const nextQty = Math.max(0, (prev[menuItemId] || 0) + delta);
        const copy = { ...prev };
        if (nextQty === 0) delete copy[menuItemId];
        else copy[menuItemId] = nextQty;
        return copy;
      });
    }
    if (delta > 0 && itemName) {
      setAddedToast(`Added ${itemName} to tray`);
      window.setTimeout(() => setAddedToast(null), 2200);
    }
  };

  const handlePlaceOrder = async (simulateOutcome: 'SUCCESS' | 'FAIL') => {
    if (!activeQr || !selectedRestaurantId || cartItems.length === 0) return;
    setSubmitting(true);
    setCheckoutError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          qrId: activeQr.id,
          restaurantId: selectedRestaurantId,
          items: cartItems.map(({ item, qty }) => ({ menuItemId: item.id, qty })),
          orderType,
          dineInGuests: orderType === 'DINE_IN' ? dineInGuests : undefined,
          passengerName,
          passengerPhone,
          seatNumber,
          specialInstructions,
          dietaryNotes,
          simulateOutcome,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; order?: Order; error?: string };
      if (json.order) {
        setTrackedOrderId(json.order.id);
        setIdempotencyKey(`idem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
        if (json.ok) {
          setCart({});
        }
        setStep('tracking');
      } else {
        setCheckoutError(json.error || 'Could not process order');
      }
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Network error during checkout');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryPayment = async (orderId: string) => {
    setSubmitting(true);
    try {
      await post(`/api/orders/${orderId}/retry-payment`);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeQr || !route || !vehicle) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center text-slate-600">
        No active bus QR configuration found. Create a partnership in the Super Admin dashboard first.
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28">
      {/* Interactive Bus QR Switcher + Step Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:pb-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap shrink-0 mr-1">
            <QrCode className="w-4 h-4 text-emerald-700" />
            <span>Bus QR:</span>
          </div>
          {state.qrCodes.map((qr) => {
            const v = state.vehicles.find((veh) => veh.id === qr.vehicleId);
            const r = state.routes.find((rt) => rt.id === qr.routeId);
            const isCurrent = qr.token === activeQr.token;
            return (
              <button
                key={qr.id}
                type="button"
                disabled={!qr.active}
                onClick={() => handleScanSwitch(qr.token)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all border ${
                  isCurrent
                    ? 'bg-emerald-900 text-white border-emerald-900'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 disabled:opacity-40'
                }`}
              >
                <span className="font-mono font-semibold">{v?.regNumber}</span>
                <span className={`ml-1.5 ${isCurrent ? 'text-emerald-200' : 'text-slate-500'}`}>
                  {r?.origin.split(' ')[0]} → {r?.destination.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sub-view stepper */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto shrink-0">
          {[
            { id: 'landing', label: '1. Route & Stops' },
            { id: 'menu', label: '2. Menu' },
            { id: 'checkout', label: `3. Cart (${totalItemCount})` },
            { id: 'tracking', label: `4. Live Orders (${busOrders.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStep(tab.id as typeof step)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                step === tab.id
                  ? 'bg-white text-emerald-950 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Subtle Instant Add-to-Cart Toast */}
      <AnimatePresence>
        {addedToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className="mb-4 px-4 py-2.5 rounded-xl bg-emerald-900 text-white text-xs font-medium flex items-center justify-between"
          >
            <span className="inline-flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-300" />
              {addedToast}
            </span>
            <button
              type="button"
              onClick={() => setStep('checkout')}
              className="text-emerald-200 hover:text-white font-semibold inline-flex items-center gap-1"
            >
              Checkout <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* SCREEN 1 & 2: QR LANDING & RESTAURANT SELECTION */}
        {step === 'landing' && (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {/* Interactive Hero Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between gap-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-3">
                    <span className="font-mono font-semibold text-emerald-700">{vehicle.regNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{company?.name}</span>
                    <span aria-hidden="true">·</span>
                    <span>{vehicle.type}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{activeQr.token}</span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance mb-3">
                    Pre-order fresh meals along {route.name}
                  </h1>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-xl mb-5">
                    Pick a highway kitchen below or click any stop pin on your live route map. Your meal is
                    prepared fresh and timed to your bus&apos;s real-time GPS arrival.
                  </p>

                  {/* Immediate Interactive Primary CTAs right on Hero */}
                  <div className="flex flex-wrap items-center gap-3">
                    {nextAvailableStop && (
                      <button
                        type="button"
                        onClick={() => handleSelectRestaurant(nextAvailableStop.restaurant.id, true)}
                        className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 active:scale-[0.99] transition-all inline-flex items-center gap-2"
                      >
                        <span>
                          Order for Next Stop ({nextAvailableStop.restaurant.name}
                          {nextAvailableStop.eta ? ` · ${nextAvailableStop.eta.etaMinutes}m` : ''})
                        </span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                    {busOrders.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setStep('tracking')}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium hover:border-emerald-400 hover:bg-emerald-50/40 transition-colors inline-flex items-center gap-2"
                      >
                        <Clock className="w-4 h-4 text-emerald-700" />
                        <span>Track Active Order ({busOrders.length})</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5 border-t border-slate-100">
                  <div>
                    <div className="text-xs text-slate-500">Destination</div>
                    <div className="text-sm font-semibold text-slate-900 mt-0.5 truncate">
                      {route.destination}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Trip Status</div>
                    <div className="text-sm font-semibold text-emerald-700 mt-0.5">
                      {trip?.status === 'IN_PROGRESS'
                        ? 'En Route Live'
                        : trip?.status === 'COMPLETED'
                          ? 'Completed'
                          : 'Scheduled'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Current Speed</div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                      {trip?.speedKmh ?? 0} km/h
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Route Partners</div>
                    <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                      {partnerRestaurants.length} Kitchens
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 relative min-h-[240px] bg-slate-100">
                <img
                  src="/src/assets/images/highway_plaza_hero_1795667339325.jpg"
                  alt="Highway food plaza and coach bay"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent flex items-end p-5">
                  <div className="text-white text-xs">
                    <div className="font-semibold">Zero App Install Required</div>
                    <div className="text-slate-200 mt-0.5">
                      Dine-in table prep or express seat takeaway
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Live Bus Corridor Map */}
            <RouteMapVisualizer
              route={route}
              trip={trip}
              restaurants={state.restaurants}
              highlightedRestaurantId={selectedRestaurantId}
              onSelectRestaurant={(restId) => handleSelectRestaurant(restId, false)}
            />

            {/* Partner Restaurants Along Route */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Partner Restaurants on Your Route
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Click any restaurant card or map pin to preview signature dishes or browse full menu
                  </p>
                </div>
              </div>

              {!activeQr.active || partnership?.status !== 'APPROVED' ? (
                <div className="bg-white border border-red-200 rounded-xl p-6 text-center text-sm text-red-700">
                  This bus QR partnership is currently paused or inactive. Please check with your conductor.
                </div>
              ) : partnerRestaurants.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
                  No approved restaurants are linked to this route yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {partnerRestaurants.map((rest, idx) => {
                    const stopEta = trip?.stopEtas.find((s) => s.restaurantId === rest.id);
                    const isPassed = stopEta?.passed;
                    const canOrder = rest.acceptingOrders && !isPassed;
                    const isFocused = selectedRestaurantId === rest.id;

                    return (
                      <div
                        key={rest.id}
                        onClick={() => handleSelectRestaurant(rest.id, false)}
                        className={`group bg-white rounded-xl overflow-hidden flex flex-col justify-between transition-all cursor-pointer border ${
                          isFocused
                            ? 'border-emerald-600 ring-2 ring-emerald-600/15'
                            : 'border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <div>
                          <div className="aspect-[16/10] bg-slate-100 relative overflow-hidden">
                            <img
                              src={rest.heroImage}
                              alt={rest.name}
                              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                          <div className="p-5">
                            <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                              <span>Stop {idx + 1} · {rest.city}</span>
                              <span className="font-mono tabular-nums font-medium text-slate-700">
                                ★ {rest.rating.toFixed(1)}
                              </span>
                            </div>
                            <h3 className="text-base font-semibold text-slate-900">{rest.name}</h3>
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{rest.address}</p>

                            <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-slate-400 block">Bus Distance</span>
                                <span className="font-mono tabular-nums font-semibold text-slate-900">
                                  {isPassed ? 'Stop Passed' : `${stopEta?.distanceRemainingKm ?? '—'} km`}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Estimated Arrival</span>
                                <span className="font-mono tabular-nums font-semibold text-emerald-700">
                                  {isPassed ? '—' : `${stopEta?.etaMinutes ?? '—'} mins`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="px-5 pb-5">
                          <button
                            type="button"
                            disabled={!canOrder}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectRestaurant(rest.id, true);
                            }}
                            className={`w-full min-h-[44px] rounded-xl text-sm font-medium transition-colors inline-flex items-center justify-center gap-2 ${
                              canOrder
                                ? 'bg-emerald-800 text-white hover:bg-emerald-900'
                                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {isPassed ? (
                              'Bus Already Passed Stop'
                            ) : !rest.acceptingOrders ? (
                              'Temporarily Paused'
                            ) : (
                              <>
                                <span>Browse Menu & Pre-Order</span>
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Interactive Quick-Add Signature Dishes Preview for Selected Stop */}
            {selectedRestaurant && restaurantMenu.length > 0 && selectedRestaurant.acceptingOrders && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-xs text-emerald-700 font-medium">
                      Quick Pre-Order Preview · {selectedRestaurant.name}
                    </div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Popular Express Dishes for This Stop
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep('menu')}
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1"
                  >
                    Open Full Menu ({restaurantMenu.length}) <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {restaurantMenu.slice(0, 3).map((item) => {
                    const qty = cart[item.id] || 0;
                    return (
                      <div
                        key={item.id}
                        className="border border-slate-200 rounded-xl p-3.5 flex items-center gap-3.5 hover:border-emerald-300 transition-colors"
                      >
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 rounded-lg object-cover bg-slate-100 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">{item.name}</div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            ₹{item.price} · {item.prepMinutes}m prep
                          </div>
                          <div className="mt-2">
                            {!item.available ? (
                              <span className="text-xs text-red-600 font-medium">Sold Out</span>
                            ) : qty === 0 ? (
                              <button
                                type="button"
                                onClick={() => updateCart(item.id, 1, item.name, item.restaurantId)}
                                className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-semibold hover:bg-emerald-700 hover:text-white transition-colors"
                              >
                                + Add
                              </button>
                            ) : (
                              <div className="inline-flex items-center border border-emerald-800 rounded-lg overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => updateCart(item.id, -1)}
                                  className="px-2 py-1 text-emerald-900 hover:bg-emerald-50"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="px-2 text-xs font-mono font-bold tabular-nums">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => updateCart(item.id, 1, item.name, item.restaurantId)}
                                  className="px-2 py-1 text-emerald-900 hover:bg-emerald-50"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* SCREEN 3: RESTAURANT MENU */}
        {step === 'menu' && selectedRestaurant && (
          <motion.div
            key="menu"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => setStep('landing')}
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                  aria-label="Back to route restaurants"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div>
                  <div className="text-xs text-slate-500">
                    {selectedRestaurant.city} · {selectedRestaurant.operatingHours}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">{selectedRestaurant.name}</h2>
                  {(() => {
                    const eta = trip?.stopEtas.find((s) => s.restaurantId === selectedRestaurant.id);
                    return eta && !eta.passed ? (
                      <div className="text-xs text-emerald-700 font-medium mt-1 font-mono tabular-nums">
                        Bus {vehicle.regNumber} arriving in {eta.etaMinutes} mins ({eta.distanceRemainingKm} km away)
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setVegOnly((v) => !v)}
                  className={`min-h-[40px] px-3.5 rounded-lg border text-xs font-medium transition-colors ${
                    vegOnly
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {vegOnly ? 'Pure Veg Filter On' : 'Veg Only'}
                </button>
                {cartItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep('checkout')}
                    className="min-h-[40px] px-4 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    View Cart · ₹{totalPayable.toFixed(0)}
                  </button>
                )}
              </div>
            </div>

            {/* Category Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    selectedCategory === cat
                      ? 'bg-emerald-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMenu.map((item) => {
                const qty = cart[item.id] || 0;
                return (
                  <div
                    key={item.id}
                    className="group bg-white border border-slate-200 hover:border-emerald-300 rounded-xl p-4 flex gap-4 justify-between transition-all"
                  >
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                          <span
                            className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-[3px] border ${
                              item.isVeg ? 'border-emerald-700' : 'border-red-700'
                            }`}
                            aria-label={item.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                item.isVeg ? 'bg-emerald-700' : 'bg-red-700'
                              }`}
                            />
                          </span>
                          <span>{item.isVeg ? 'Veg' : 'Non-Veg'}</span>
                          <span aria-hidden="true">·</span>
                          <span>Prep {item.prepMinutes}m</span>
                        </div>
                        <h3 className="text-sm font-semibold text-slate-900">{item.name}</h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                      </div>

                      <div className="flex items-center justify-between mt-4">
                        <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                          ₹{item.price}
                        </span>

                        {!item.available ? (
                          <span className="text-xs font-medium text-red-600">Sold Out</span>
                        ) : qty === 0 ? (
                          <button
                            type="button"
                            onClick={() => updateCart(item.id, 1, item.name, item.restaurantId)}
                            className="min-h-[40px] px-4 rounded-lg border border-emerald-800 text-emerald-900 text-xs font-semibold hover:bg-emerald-800 hover:text-white transition-colors"
                          >
                            Add to Cart
                          </button>
                        ) : (
                          <div className="inline-flex items-center border border-emerald-900 rounded-lg overflow-hidden">
                            <button
                              type="button"
                              onClick={() => updateCart(item.id, -1)}
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-emerald-900 hover:bg-emerald-50"
                              aria-label={`Decrease quantity of ${item.name}`}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="px-2.5 text-xs font-mono font-bold tabular-nums text-slate-900">
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCart(item.id, 1, item.name, item.restaurantId)}
                              className="min-h-[40px] min-w-[40px] flex items-center justify-center text-emerald-900 hover:bg-emerald-50"
                              aria-label={`Increase quantity of ${item.name}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="w-28 h-28 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* SCREEN 4, 5 & 6: CART, PREFERENCES & PAYMENT CHECKOUT */}
        {step === 'checkout' && (
          <motion.div
            key="checkout"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            <div className="lg:col-span-7 space-y-6">
              {/* Cart Summary */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Your Pre-Order Cart</h2>
                  <button
                    type="button"
                    onClick={() => setStep('menu')}
                    className="text-xs font-medium text-emerald-700 hover:underline"
                  >
                    Add More Items
                  </button>
                </div>

                {cartItems.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500 space-y-3">
                    <p>Your cart is empty. Browse a partner restaurant menu to add items.</p>
                    <button
                      type="button"
                      onClick={() => setStep('landing')}
                      className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold"
                    >
                      Explore Partner Stops
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {cartItems.map(({ item, qty }) => (
                      <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-500 font-mono tabular-nums">
                            ₹{item.price} × {qty}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="inline-flex items-center border border-slate-200 rounded-lg">
                            <button
                              type="button"
                              onClick={() => updateCart(item.id, -1)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-50"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 text-xs font-mono font-semibold tabular-nums">{qty}</span>
                            <button
                              type="button"
                              onClick={() => updateCart(item.id, 1)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-700 hover:bg-slate-50"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="w-16 text-right text-sm font-mono font-semibold tabular-nums text-slate-900">
                            ₹{(item.price * qty).toFixed(0)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Order Preferences (Dine-in vs Takeaway) */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Dining Preference & Passenger Details
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Required so the kitchen packs for bus-seat delivery or reserves a table on arrival.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-2">
                    Fulfillment Mode (Mandatory)
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setOrderType('TAKEAWAY')}
                      className={`min-h-[48px] px-4 py-3 rounded-xl border text-left transition-colors flex items-center gap-3 ${
                        orderType === 'TAKEAWAY'
                          ? 'border-emerald-900 bg-emerald-900 text-white'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">Takeaway Pack</div>
                        <div
                          className={`text-xs ${
                            orderType === 'TAKEAWAY' ? 'text-emerald-200' : 'text-slate-500'
                          }`}
                        >
                          Express counter or bus bay pickup
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderType('DINE_IN')}
                      className={`min-h-[48px] px-4 py-3 rounded-xl border text-left transition-colors flex items-center gap-3 ${
                        orderType === 'DINE_IN'
                          ? 'border-emerald-900 bg-emerald-900 text-white'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <Utensils className="w-4 h-4 shrink-0" />
                      <div>
                        <div className="text-sm font-semibold">Dine-In Table</div>
                        <div
                          className={`text-xs ${
                            orderType === 'DINE_IN' ? 'text-emerald-200' : 'text-slate-500'
                          }`}
                        >
                          Served hot at restaurant table
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Passenger Name</label>
                    <input
                      type="text"
                      value={passengerName}
                      onChange={(e) => setPassengerName(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Mobile Number</label>
                    <input
                      type="tel"
                      value={passengerPhone}
                      onChange={(e) => setPassengerPhone(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Bus Seat Number</label>
                    <input
                      type="text"
                      value={seatNumber}
                      onChange={(e) => setSeatNumber(e.target.value)}
                      placeholder="e.g. U6, L12"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  {orderType === 'DINE_IN' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Number of Guests (Dine-In)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={dineInGuests}
                        onChange={(e) => setDineInGuests(Number(e.target.value) || 1)}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Special Instructions
                    </label>
                    <input
                      type="text"
                      value={specialInstructions}
                      onChange={(e) => setSpecialInstructions(e.target.value)}
                      placeholder="Less spicy, extra chutney..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Dietary Notes</label>
                    <input
                      type="text"
                      value={dietaryNotes}
                      onChange={(e) => setDietaryNotes(e.target.value)}
                      placeholder="No onion/garlic, nut allergy..."
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Summary & Gateway Checkout */}
            <div className="lg:col-span-5">
              <div className="bg-white border border-slate-200 rounded-xl p-6 sticky top-20 space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Payment Summary</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedRestaurant?.name} · {vehicle.regNumber}
                  </p>
                </div>

                <div className="space-y-2.5 text-sm border-y border-slate-100 py-4">
                  <div className="flex justify-between text-slate-600">
                    <span>Item Subtotal</span>
                    <span className="font-mono tabular-nums">₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>GST (5%)</span>
                    <span className="font-mono tabular-nums">₹{gstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Platform Convenience Fee</span>
                    <span className="font-mono tabular-nums">₹{serviceFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
                    <span>Total Payable</span>
                    <span className="font-mono tabular-nums">₹{totalPayable.toFixed(2)}</span>
                  </div>
                </div>

                {checkoutError && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{checkoutError}</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={submitting || cartItems.length === 0}
                    onClick={() => handlePlaceOrder('SUCCESS')}
                    className="w-full min-h-[48px] rounded-xl bg-emerald-700 text-white text-sm font-semibold hover:bg-emerald-800 disabled:opacity-40 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    {submitting
                      ? 'Verifying Payment...'
                      : `Pay ₹${totalPayable.toFixed(2)} & Confirm Order`}
                  </button>

                  <button
                    type="button"
                    disabled={submitting || cartItems.length === 0}
                    onClick={() => handlePlaceOrder('FAIL')}
                    className="w-full min-h-[40px] rounded-xl border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors"
                  >
                    Test Gateway Failure & Retry Flow
                  </button>
                </div>
                <p className="text-xs text-slate-400 text-center">
                  Backend verifies payment signature with idempotency key before notifying kitchen.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* SCREEN 7 & 8: LIVE ORDER TRACKING & COLLECTION */}
        {step === 'tracking' && (
          <motion.div
            key="tracking"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {busOrders.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                <p className="text-sm text-slate-600 mb-4">No orders placed on this bus yet.</p>
                <button
                  type="button"
                  onClick={() => setStep('landing')}
                  className="px-4 py-2.5 rounded-xl bg-emerald-800 text-white text-sm font-medium"
                >
                  Explore Route Restaurants
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Order Selector List */}
                <div className="lg:col-span-4 space-y-3">
                  <h2 className="text-sm font-semibold text-slate-900">Orders on {vehicle.regNumber}</h2>
                  {busOrders.map((ord) => {
                    const rest = state.restaurants.find((r) => r.id === ord.restaurantId);
                    const isSelected = activeTrackedOrder?.id === ord.id;
                    return (
                      <button
                        key={ord.id}
                        type="button"
                        onClick={() => setTrackedOrderId(ord.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-colors ${
                          isSelected
                            ? 'bg-emerald-950 text-white border-emerald-950'
                            : 'bg-white text-slate-900 border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-mono font-semibold">{ord.id}</span>
                          <span
                            className={`font-medium ${
                              ord.paymentStatus === 'FAILED'
                                ? 'text-red-400'
                                : ord.status === 'READY'
                                  ? 'text-emerald-400'
                                  : isSelected
                                    ? 'text-emerald-300'
                                    : 'text-emerald-700'
                            }`}
                          >
                            {ord.paymentStatus === 'FAILED' ? 'PAYMENT FAILED' : ord.status}
                          </span>
                        </div>
                        <div className="text-sm font-semibold">{rest?.name}</div>
                        <div
                          className={`text-xs mt-1 font-mono tabular-nums ${
                            isSelected ? 'text-slate-300' : 'text-slate-500'
                          }`}
                        >
                          {ord.passengerName} · ₹{ord.totalAmount.toFixed(2)} · {ord.orderType}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Active Tracked Order Detail */}
                {activeTrackedOrder &&
                  (() => {
                    const rest = state.restaurants.find((r) => r.id === activeTrackedOrder.restaurantId);
                    const stopEta = trip?.stopEtas.find(
                      (s) => s.restaurantId === activeTrackedOrder.restaurantId
                    );
                    const activeIdx = ORDER_STEPS.findIndex((s) => s.key === activeTrackedOrder.status);

                    return (
                      <div className="lg:col-span-8 space-y-5">
                        {/* Status Header & Pickup Code */}
                        <div className="bg-white border border-slate-200 rounded-xl p-6">
                          <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-100">
                            <div>
                              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                                <span>{activeTrackedOrder.id}</span>
                                <span aria-hidden="true">·</span>
                                <span>{activeTrackedOrder.orderType}</span>
                                <span aria-hidden="true">·</span>
                                <span>{activeTrackedOrder.paymentRef}</span>
                              </div>
                              <h2 className="text-xl font-bold text-slate-900 mt-1">{rest?.name}</h2>
                              <div className="flex items-center gap-3 text-xs text-slate-600 mt-1">
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5" /> {rest?.city}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="w-3.5 h-3.5" /> {rest?.mobile}
                                </span>
                              </div>
                            </div>

                            {activeTrackedOrder.paymentStatus === 'VERIFIED' &&
                            activeTrackedOrder.status !== 'REJECTED' ? (
                              <div className="bg-emerald-950 text-white rounded-xl px-4 py-2.5 text-center">
                                <div className="text-[11px] text-emerald-300">Pickup Code</div>
                                <div className="text-2xl font-mono font-bold tracking-widest tabular-nums">
                                  {activeTrackedOrder.pickupCode}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {/* Payment Failed Banner + Retry */}
                          {activeTrackedOrder.paymentStatus === 'FAILED' && (
                            <div className="mt-5 p-4 rounded-xl bg-red-50 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="text-xs text-red-800">
                                <div className="font-semibold text-sm">Payment Verification Failed</div>
                                <p className="mt-0.5">
                                  Order is not confirmed or sent to the kitchen until payment succeeds.
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleRetryPayment(activeTrackedOrder.id)}
                                className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Retry Payment (₹{activeTrackedOrder.totalAmount.toFixed(2)})
                              </button>
                            </div>
                          )}

                          {/* Rejected / Refunded Banner */}
                          {activeTrackedOrder.status === 'REJECTED' && (
                            <div className="mt-5 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                              <div className="font-semibold text-sm">Order Rejected & Automatically Refunded</div>
                              <p className="mt-1">
                                Reason: {activeTrackedOrder.rejectionReason}. Full refund of ₹
                                {activeTrackedOrder.totalAmount.toFixed(2)} processed (
                                {activeTrackedOrder.paymentStatus}).
                              </p>
                            </div>
                          )}

                          {/* Live Preparation Pipeline */}
                          {activeTrackedOrder.paymentStatus !== 'FAILED' &&
                            activeTrackedOrder.status !== 'REJECTED' && (
                              <div className="mt-6">
                                <div className="grid grid-cols-5 gap-2">
                                  {ORDER_STEPS.map((st, idx) => {
                                    const done = activeIdx >= idx;
                                    const current = activeIdx === idx;
                                    return (
                                      <div key={st.key} className="text-center">
                                        <div
                                          className={`h-2 rounded-full mb-2 transition-colors ${
                                            done ? 'bg-emerald-600' : 'bg-slate-200'
                                          }`}
                                        />
                                        <div
                                          className={`text-xs font-medium ${
                                            current
                                              ? 'text-slate-900 font-semibold'
                                              : done
                                                ? 'text-emerald-700'
                                                : 'text-slate-400'
                                          }`}
                                        >
                                          {st.label}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {activeTrackedOrder.status === 'READY' && (
                                  <div className="mt-5 p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-3 text-emerald-900">
                                      <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                                      <div className="text-xs">
                                        <div className="font-semibold text-sm">
                                          Food is Ready for{' '}
                                          {activeTrackedOrder.orderType === 'DINE_IN' ? 'Dine-In' : 'Pickup'}!
                                        </div>
                                        <div>
                                          Show pickup code {activeTrackedOrder.pickupCode} at the express
                                          counter.
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}

                          {/* Live Bus ETA Strip */}
                          <div className="mt-6 grid grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-xs">
                            <div className="flex items-center gap-2">
                              <Bus className="w-4 h-4 text-slate-400 shrink-0" />
                              <div>
                                <div className="text-slate-400">Vehicle</div>
                                <div className="font-mono font-semibold text-slate-900">
                                  {vehicle.regNumber}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Navigation className="w-4 h-4 text-slate-400 shrink-0" />
                              <div>
                                <div className="text-slate-400">Live Distance</div>
                                <div className="font-mono tabular-nums font-semibold text-slate-900">
                                  {stopEta?.passed
                                    ? 'Arrived / Passed'
                                    : `${stopEta?.distanceRemainingKm ?? '—'} km`}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                              <div>
                                <div className="text-slate-400">Live Bus ETA</div>
                                <div className="font-mono tabular-nums font-semibold text-emerald-700">
                                  {stopEta?.passed ? '0 mins' : `${stopEta?.etaMinutes ?? '—'} mins`}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Live Route Map */}
                        <RouteMapVisualizer
                          route={route}
                          trip={trip}
                          restaurants={state.restaurants}
                          highlightedRestaurantId={activeTrackedOrder.restaurantId}
                          compact
                        />

                        {/* Ordered Items Breakdown */}
                        <div className="bg-white border border-slate-200 rounded-xl p-5">
                          <h3 className="text-sm font-semibold text-slate-900 mb-3">Ordered Items</h3>
                          <div className="divide-y divide-slate-100 text-sm">
                            {activeTrackedOrder.items.map((it) => (
                              <div key={it.menuItemId} className="py-2 flex justify-between">
                                <span className="text-slate-700">
                                  {it.qty} × {it.name}
                                </span>
                                <span className="font-mono tabular-nums text-slate-900">
                                  ₹{(it.qty * it.unitPrice).toFixed(2)}
                                </span>
                              </div>
                            ))}
                            <div className="pt-3 flex justify-between font-semibold text-slate-900">
                              <span>Total Paid (incl. GST & fee)</span>
                              <span className="font-mono tabular-nums">
                                ₹{activeTrackedOrder.totalAmount.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Sticky Cart Bar when customer has items and isn't on Checkout (respects <=15% height cap) */}
      <AnimatePresence>
        {totalItemCount > 0 && step !== 'checkout' && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.18 }}
            className="fixed bottom-4 left-4 right-4 z-30 max-w-2xl mx-auto"
          >
            <div className="bg-emerald-950 text-white rounded-xl px-4 py-3 shadow-lg flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs text-emerald-300 truncate">{selectedRestaurant?.name}</div>
                <div className="text-sm font-semibold font-mono tabular-nums">
                  {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'} · ₹{totalPayable.toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStep('checkout')}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <span>Proceed to Checkout</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
