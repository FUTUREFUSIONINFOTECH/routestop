import { useEffect, useState } from 'react';
import { QrCode } from 'lucide-react';
import { DemoShareModal } from './components/DemoShareModal';
import { usePlatformSocket } from './hooks/usePlatformSocket';
import { DriverPortal } from './portals/DriverPortal';
import { PassengerPortal } from './portals/PassengerPortal';
import { RestaurantPortal } from './portals/RestaurantPortal';
import { SuperAdminPortal } from './portals/SuperAdminPortal';
import type { PortalView } from './types/platform';

function readInitialUrlParams(): { view: PortalView; qr: string } {
  const params = new URLSearchParams(window.location.search);
  const rawView = params.get('view');
  const view: PortalView =
    rawView === 'restaurant' || rawView === 'driver' || rawView === 'admin' || rawView === 'passenger'
      ? rawView
      : 'passenger';
  const qr = params.get('qr') || 'RS-TN45-CHM-01';
  return { view, qr };
}

export default function App() {
  const initial = readInitialUrlParams();
  const [activeView, setActiveView] = useState<PortalView>(initial.view);
  const [activeQrToken, setActiveQrToken] = useState<string>(initial.qr);
  const [shareOpen, setShareOpen] = useState<boolean>(false);

  const { state, loading, error, refresh, post, patch } = usePlatformSocket();

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', activeView);
    if (activeView === 'passenger' && activeQrToken) {
      url.searchParams.set('qr', activeQrToken);
    } else {
      url.searchParams.delete('qr');
    }
    window.history.replaceState({}, '', url.toString());
  }, [activeView, activeQrToken]);

  const handleOpenPassengerQr = (token: string) => {
    setActiveQrToken(token);
    setActiveView('passenger');
    post('/api/qr/scan', { token }).catch(() => {});
  };

  const navLinks: { id: PortalView; label: string }[] = [
    { id: 'passenger', label: 'Passenger QR' },
    { id: 'restaurant', label: 'Restaurant App' },
    { id: 'driver', label: 'Driver & Crew' },
    { id: 'admin', label: 'Super Admin' },
  ];

  return (
    <div className="min-h-screen bg-[#F7FAF8] text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-emerald-100">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveView('passenger')}
            className="text-lg font-extrabold tracking-tight text-emerald-900 whitespace-nowrap shrink-0 font-display"
          >
            RouteStop
          </button>

          {/* Zone 2: 4 clean single-line text navigation links */}
          <nav className="flex items-center gap-5 sm:gap-7 overflow-x-auto" aria-label="Platform Portals">
            {navLinks.map((link) => {
              const active = activeView === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveView(link.id)}
                  className={`py-2 text-sm font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    active
                      ? 'border-emerald-600 text-emerald-950 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-emerald-900'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <QrCode className="w-3.5 h-3.5" />
              QR & Demo Link
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1">
        {loading ? (
          <div className="max-w-4xl mx-auto px-6 py-20 text-center space-y-3">
            <div className="h-8 w-48 bg-slate-200 rounded mx-auto animate-pulse" />
            <div className="h-4 w-72 bg-slate-200 rounded mx-auto animate-pulse" />
          </div>
        ) : error || !state ? (
          <div className="max-w-md mx-auto px-6 py-20 text-center space-y-4">
            <p className="text-sm text-red-700">{error || 'Unable to load platform state.'}</p>
            <button
              type="button"
              onClick={refresh}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium"
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <>
            {activeView === 'passenger' && (
              <PassengerPortal
                state={state}
                activeQrToken={activeQrToken}
                onSelectQrToken={setActiveQrToken}
                post={post}
              />
            )}
            {activeView === 'restaurant' && (
              <RestaurantPortal state={state} post={post} patch={patch} />
            )}
            {activeView === 'driver' && (
              <DriverPortal state={state} post={post} patch={patch} />
            )}
            {activeView === 'admin' && (
              <SuperAdminPortal
                state={state}
                post={post}
                patch={patch}
                onOpenPassengerQr={handleOpenPassengerQr}
              />
            )}
          </>
        )}
      </div>

      {/* Share Demo Link & Scannable QR Modal */}
      {state && (
        <DemoShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          state={state}
          onSelectQrAndOpenPassenger={handleOpenPassengerQr}
          onSwitchView={setActiveView}
        />
      )}
    </div>
  );
}
