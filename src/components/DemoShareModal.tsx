import { useState } from 'react';
import { Check, Copy, Download, ExternalLink, QrCode, X } from 'lucide-react';
import type { PlatformState, PortalView } from '../types/platform';

interface DemoShareModalProps {
  open: boolean;
  onClose: () => void;
  state: PlatformState;
  onSelectQrAndOpenPassenger: (qrToken: string) => void;
  onSwitchView: (view: PortalView) => void;
}

export function DemoShareModal({
  open,
  onClose,
  state,
  onSelectQrAndOpenPassenger,
  onSwitchView,
}: DemoShareModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!open) return null;

  const origin = window.location.origin;
  const demoUrl = origin;

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback ignored
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-share-title"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div>
            <h2 id="demo-share-title" className="text-lg font-semibold text-slate-900">
              Live Demo Link & Bus Partnership QR Codes
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Share the platform URL or scan any active bus QR code to launch the Passenger ordering flow.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Primary Demo URL Box */}
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
            <div className="text-xs font-medium text-slate-500 mb-2">Interactive Demo URL</div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                readOnly
                value={demoUrl}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 select-all"
              />
              <button
                type="button"
                onClick={() => handleCopy(demoUrl, 'root')}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-800 text-white text-sm font-medium hover:bg-emerald-900 transition-colors whitespace-nowrap shrink-0"
              >
                {copiedKey === 'root' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiedKey === 'root' ? 'Copied' : 'Copy Link'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500">Direct portal links:</span>
              {(['passenger', 'restaurant', 'driver', 'admin'] as PortalView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => {
                    onSwitchView(view);
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900 transition-colors capitalize"
                >
                  {view === 'admin' ? 'Super Admin' : `${view} Portal`}
                </button>
              ))}
            </div>
          </div>

          {/* Bus Partnership QR Codes */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900">Active Bus Partnership QR Codes</h3>
              <span className="text-xs text-slate-500">Scan with phone camera or test directly</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {state.qrCodes.map((qr) => {
                const vehicle = state.vehicles.find((v) => v.id === qr.vehicleId);
                const route = state.routes.find((r) => r.id === qr.routeId);
                const deepLink = `${origin}/?view=passenger&qr=${encodeURIComponent(qr.token)}`;

                return (
                  <div
                    key={qr.id}
                    className="border border-slate-200 rounded-xl p-4 flex flex-col justify-between bg-white"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                        <span className="font-mono font-semibold text-slate-900">{vehicle?.regNumber}</span>
                        <span className={qr.active ? 'text-emerald-700 font-medium' : 'text-red-600 font-medium'}>
                          {qr.active ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mb-3 truncate" title={route?.name}>
                        {route?.name}
                      </p>

                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-center mb-3">
                        <img
                          src={`/api/qr/${encodeURIComponent(qr.token)}/svg?origin=${encodeURIComponent(origin)}`}
                          alt={`QR code for ${vehicle?.regNumber}`}
                          className="w-36 h-36 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="text-xs font-mono text-slate-600 text-center mb-3">
                        {qr.token} · {qr.scanCount} scans
                      </div>
                    </div>

                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={!qr.active}
                        onClick={() => {
                          onSelectQrAndOpenPassenger(qr.token);
                          onClose();
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 disabled:opacity-40 transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Test Scan in Passenger View
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(deepLink, qr.id)}
                          className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          {copiedKey === qr.id ? <Check className="w-3.5 h-3.5" /> : <ExternalLink className="w-3.5 h-3.5" />}
                          {copiedKey === qr.id ? 'Copied' : 'Copy URL'}
                        </button>
                        <a
                          href={`/api/qr/${encodeURIComponent(qr.token)}/png?origin=${encodeURIComponent(origin)}`}
                          download={`${qr.token}.png`}
                          className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PNG
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
