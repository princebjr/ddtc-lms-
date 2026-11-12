import { useId, useState } from 'react';
import { ResponsiveChart } from '@/components/data/ResponsiveChart.jsx';
import { cn } from '@/lib/utils.js';

// Score distribution chart (Phase 10; D15; DESIGN.md 13 "Score distribution chart"): one bar per band
// from assignment_statistics() (released results only), horizontal axis "Percentage scored", vertical
// axis "Number of learners", the count above each bar, gridlines in hairline. The learner's own band is
// drawn in chart-own with a diagonal pattern and a "Your score" label (pattern as well as colour), and
// a band is never a rank. On narrow widths the labels drop the % sign and never overlap. Tapping a bar
// shows its value under the chart; the text summary is always visible. Plain SVG with tokens only, so
// no chart library is loaded.

/** The chart frame's height in px: ResponsiveChart's "md" frame (h-56, 14 rem). */
const HEIGHT = 224;
const PAD = { top: 28, right: 8, bottom: 44, left: 40 };

/**
 * @param {{ title: string, summary: string, distribution: Array<{ band: string, count: number }>, ownBand?: string | null, className?: string }} props
 */
export function DistributionChart({ title, summary, distribution, ownBand = null, className }) {
  const patternId = useId().replaceAll(':', '');
  const [picked, setPicked] = useState(/** @type {string | null} */ (null));
  const max = Math.max(1, ...distribution.map((d) => d.count));
  // Whole-number gridlines: at most four steps.
  const step = Math.max(1, Math.ceil(max / 4));
  const top = step * Math.ceil(max / step);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const pickedBand = distribution.find((d) => d.band === picked);

  return (
    <div className={cn('flex flex-col gap-2', className)} data-slot="distribution-chart">
      <ResponsiveChart title={title} summary={summary}>
        {({ width, compact }) => {
          const plotW = width - PAD.left - PAD.right;
          const plotH = HEIGHT - PAD.top - PAD.bottom;
          const slot = plotW / Math.max(1, distribution.length);
          const barW = Math.max(8, Math.min(56, slot * 0.64));
          const y = (/** @type {number} */ v) => PAD.top + plotH - (v / top) * plotH;
          return (
            <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="block text-ink-secondary">
              <defs>
                <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" className="fill-chart-own" />
                  <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" className="stroke-card" />
                </pattern>
              </defs>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-hairline" strokeWidth="1" />
                  <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-current text-caption tabular-nums">
                    {t}
                  </text>
                </g>
              ))}
              {distribution.map((d, i) => {
                const own = d.band === ownBand;
                const cx = PAD.left + slot * i + slot / 2;
                const h = (d.count / top) * plotH;
                return (
                  <g key={d.band} onClick={() => setPicked((p) => (p === d.band ? null : d.band))} className="cursor-pointer" data-band={d.band} data-count={d.count}>
                    {/* A wide transparent target, so a tap anywhere in the column picks the bar. */}
                    <rect x={cx - slot / 2} y={PAD.top} width={slot} height={plotH} className="fill-transparent" />
                    <rect
                      x={cx - barW / 2}
                      y={y(d.count)}
                      width={barW}
                      height={h}
                      rx="2"
                      fill={own ? `url(#${patternId})` : undefined}
                      className={own ? undefined : 'fill-chart-bar'}
                    />
                    <text x={cx} y={y(d.count) - 6} textAnchor="middle" className={cn('text-caption tabular-nums', own ? 'fill-chart-own' : 'fill-ink')}>
                      {d.count}
                    </text>
                    {own ? (
                      <text x={cx} y={y(d.count) - 20} textAnchor="middle" className="fill-chart-own text-caption">
                        Your score
                      </text>
                    ) : null}
                    <text x={cx} y={HEIGHT - PAD.bottom + 16} textAnchor="middle" className="fill-current text-caption">
                      {compact ? d.band.replace('%', '') : d.band}
                    </text>
                  </g>
                );
              })}
              <text x={PAD.left + plotW / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-current text-caption">
                Percentage scored
              </text>
              <text transform={`translate(10 ${PAD.top + plotH / 2}) rotate(-90)`} textAnchor="middle" className="fill-current text-caption">
                {compact ? 'Learners' : 'Number of learners'}
              </text>
            </svg>
          );
        }}
      </ResponsiveChart>
      {/* Phase 13 (WCAG 1.1.1): the drawing is hidden from screen readers, so every band and its count is given
          here as a table they read; the visible caption above stays the short summary. */}
      <table className="sr-only" data-testid="distribution-table">
        <caption>{`${title}: learners in each band`}</caption>
        <thead>
          <tr>
            <th scope="col">Band</th>
            <th scope="col">Learners</th>
          </tr>
        </thead>
        <tbody>
          {distribution.map((d) => (
            <tr key={d.band}>
              <th scope="row">{d.band === ownBand ? `${d.band} (your band)` : d.band}</th>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 min-h-5 text-body-sm text-ink" aria-hidden="true">
        {pickedBand ? `${pickedBand.band}: ${pickedBand.count} ${pickedBand.count === 1 ? 'learner' : 'learners'}${pickedBand.band === ownBand ? ' (your band)' : ''}` : ''}
      </p>
    </div>
  );
}
