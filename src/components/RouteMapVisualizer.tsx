import type { HighwayRoute, Restaurant, Trip } from '../types/platform';

interface RouteMapVisualizerProps {
  route: HighwayRoute;
  trip?: Trip;
  restaurants: Restaurant[];
  highlightedRestaurantId?: string;
  onSelectRestaurant?: (restaurantId: string) => void;
  compact?: boolean;
}

export function RouteMapVisualizer({
  route,
  trip,
  restaurants,
  highlightedRestaurantId,
  onSelectRestaurant,
  compact = false,
}: RouteMapVisualizerProps) {
  const width = 760;
  const height = compact ? 168 : 220;
  const padX = 56;
  const lineY = compact ? 74 : 96;
  const spanX = width - padX * 2;
  const totalKm = Math.max(1, route.totalKm);

  const progressRatio = trip ? Math.max(0, Math.min(1, trip.progressPct / 100)) : 0;
  const busX = padX + progressRatio * spanX;

  return (
    <div className="w-full overflow-x-auto bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{route.name}</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">{route.totalKm} km corridor</span>
          {onSelectRestaurant && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-medium">Click any kitchen pin to preview</span>
            </>
          )}
        </div>
        {trip && (
          <div className="flex items-center gap-3 text-xs text-slate-600 font-mono tabular-nums">
            <span>{trip.currentKm} km covered</span>
            <span aria-hidden="true">·</span>
            <span>{trip.speedKmh} km/h</span>
            <span aria-hidden="true">·</span>
            <span>
              {trip.currentLat.toFixed(4)}°N, {trip.currentLng.toFixed(4)}°E
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full min-w-[540px] h-auto select-none"
        role="img"
        aria-label={`Live corridor map for ${route.name}`}
      >
        <defs>
          <pattern id={`grid-${route.id}`} width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#F1F5F9" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={width} height={height} rx="8" fill={`url(#grid-${route.id})`} />

        {/* Base highway corridor track */}
        <line
          x1={padX}
          y1={lineY}
          x2={padX + spanX}
          y2={lineY}
          stroke="#CBD5E1"
          strokeWidth="6"
          strokeLinecap="round"
        />

        {/* Completed progress track */}
        {trip && (
          <line
            x1={padX}
            y1={lineY}
            x2={busX}
            y2={lineY}
            stroke="#059669"
            strokeWidth="6"
            strokeLinecap="round"
            style={{ transition: 'all 350ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          />
        )}

        {/* Stops & Partner Restaurants */}
        {route.stops.map((stop, index) => {
          const x = padX + (stop.kmFromOrigin / totalKm) * spanX;
          const rest = stop.restaurantId ? restaurants.find((r) => r.id === stop.restaurantId) : undefined;
          const stopEta = trip?.stopEtas.find((s) => s.stopId === stop.id);
          const isHighlighted = highlightedRestaurantId && stop.restaurantId === highlightedRestaurantId;
          const isPassed = stopEta?.passed;
          const labelTop = index % 2 === 0;
          const interactive = Boolean(rest && onSelectRestaurant);

          return (
            <g
              key={stop.id}
              onClick={() => {
                if (rest && onSelectRestaurant) onSelectRestaurant(rest.id);
              }}
              className={interactive ? 'cursor-pointer group' : undefined}
              role={interactive ? 'button' : undefined}
              tabIndex={interactive ? 0 : undefined}
              onKeyDown={(e) => {
                if (interactive && rest && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelectRestaurant?.(rest.id);
                }
              }}
            >
              {/* Stem */}
              <line
                x1={x}
                y1={lineY}
                x2={x}
                y2={labelTop ? lineY - 26 : lineY + 26}
                stroke={isHighlighted ? '#059669' : '#94A3B8'}
                strokeWidth={isHighlighted ? '2.2' : '1.2'}
                strokeDasharray={rest ? undefined : '2 2'}
              />

              {/* Highlight Halo */}
              {isHighlighted && rest && (
                <circle cx={x} cy={lineY} r="14" fill="#10B981" fillOpacity="0.2" />
              )}

              {/* Stop Node */}
              <circle
                cx={x}
                cy={lineY}
                r={rest ? (isHighlighted ? 9 : 8) : 6}
                fill={isPassed ? '#064E3B' : rest ? (isHighlighted ? '#047857' : '#FFFFFF') : '#F8FAFC'}
                stroke={isPassed ? '#064E3B' : rest ? '#059669' : '#64748B'}
                strokeWidth="2.5"
              />

              {/* Stop / Restaurant Label */}
              <text
                x={x}
                y={labelTop ? lineY - 42 : lineY + 42}
                textAnchor="middle"
                className={`text-[11px] font-semibold ${
                  isHighlighted ? 'fill-emerald-800' : 'fill-slate-900'
                }`}
              >
                {rest ? rest.name : stop.name.split(' ')[0]}
              </text>
              <text
                x={x}
                y={labelTop ? lineY - 29 : lineY + 55}
                textAnchor="middle"
                className="text-[10px] fill-slate-500 font-mono"
              >
                {stop.kmFromOrigin} km
                {stopEta && !stopEta.passed && stop.kmFromOrigin > 0 ? ` · ${stopEta.etaMinutes}m` : ''}
                {stopEta?.passed ? ' · Passed' : ''}
              </text>
            </g>
          );
        })}

        {/* Active Bus Marker */}
        {trip && (
          <g
            transform={`translate(${busX}, ${lineY})`}
            style={{ transition: 'transform 350ms cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <circle r="15" fill="#10B981" fillOpacity="0.2" />
            <rect x="-13" y="-9" width="26" height="18" rx="4" fill="#064E3B" stroke="#FFFFFF" strokeWidth="2" />
            <text
              x="0"
              y="3"
              textAnchor="middle"
              className="text-[8px] font-bold fill-white font-mono"
            >
              BUS
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
