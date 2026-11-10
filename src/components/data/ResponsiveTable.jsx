import { cn } from '@/lib/utils.js';

// ResponsiveTable (RESPONSIVE.md 15.2 and 15.8 item 4): a full table from 640 px; stacked cards on
// phones showing the leading avatar, the title, a secondary line, a status and the key value.
// Wide data scrolls only inside its own container, never the page. A table too wide for a tablet
// (RESPONSIVE.md: tables on tablets only when all columns fit) passes cardsBelow="lg" and stays as
// cards up to 1024 px.

/** Where the cards give way to the table (complete class names, for Tailwind). */
const SWITCH = /** @type {const} */ ({
  sm: { cards: 'sm:hidden', table: 'sm:block' },
  lg: { cards: 'lg:hidden', table: 'lg:block' },
});

/**
 * @template Row
 * @typedef {object} Column
 * @property {string} key
 * @property {string} header
 * @property {(row: Row) => import('react').ReactNode} cell
 * @property {'leading' | 'title' | 'secondary' | 'status' | 'value' | 'detail' | 'actions' | 'hidden'} [card]
 *   how the column appears in the phone card; 'detail' columns show as label and value rows;
 *   'actions' show as a row of buttons at the bottom of the card, without a label
 * @property {'start' | 'end'} [align]
 */

/**
 * @template Row
 * @param {{ caption: string, columns: Column<Row>[], rows: Row[], getRowKey: (row: Row) => string, empty?: import('react').ReactNode, className?: string,
 *   cardsBelow?: 'sm' | 'lg' }} props
 */
export function ResponsiveTable({ caption, columns, rows, getRowKey, empty, className, cardsBelow = 'sm' }) {
  const at = SWITCH[cardsBelow];
  if (rows.length === 0 && empty) return <>{empty}</>;
  /** @param {Column<Row>['card']} role */
  const byRole = (role) => columns.filter((c) => c.card === role);
  const [leading] = byRole('leading');
  const [title] = byRole('title');
  const secondary = byRole('secondary');
  const status = byRole('status');
  const value = byRole('value');
  const details = byRole('detail');
  const actions = byRole('actions');

  return (
    <div data-slot="responsive-table" className={className}>
      <ul className={cn('m-0 flex list-none flex-col gap-3 p-0', at.cards)} aria-label={caption}>
        {rows.map((row) => (
          <li key={getRowKey(row)} className="flex flex-col gap-3 rounded-md border border-hairline bg-card p-4">
            <div className="flex items-center gap-3">
              {leading ? <span className="shrink-0">{leading.cell(row)}</span> : null}
              <div className="flex min-w-0 flex-1 flex-col">
                {title ? <span className="truncate text-headline text-ink">{title.cell(row)}</span> : null}
                {secondary.map((c) => (
                  <span key={c.key} className="truncate text-body-sm text-ink-secondary">
                    {c.cell(row)}
                  </span>
                ))}
              </div>
              {value.map((c) => (
                <span key={c.key} className="shrink-0 text-body text-ink tabular-nums">
                  {c.cell(row)}
                </span>
              ))}
            </div>
            {status.length ? <div className="flex flex-wrap gap-2">{status.map((c) => <span key={c.key}>{c.cell(row)}</span>)}</div> : null}
            {details.length ? (
              <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-body-sm">
                {details.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-ink-secondary">{c.header}</dt>
                    <dd className="m-0 text-ink">{c.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {actions.length ? (
              <div className="flex flex-wrap gap-2">
                {actions.map((c) => (
                  <span key={c.key} className="contents">
                    {c.cell(row)}
                  </span>
                ))}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <div className={cn('hidden max-w-full overflow-x-auto rounded-md border border-hairline bg-card', at.table)}>
        <table className="w-full border-collapse text-left text-body-sm tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-fill">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn('h-12 px-4 text-caption whitespace-nowrap text-ink-secondary', c.align === 'end' && 'text-right')}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-t border-hairline">
                {columns.map((c) => (
                  <td key={c.key} className={cn('h-12 px-4 py-2 text-ink', c.align === 'end' && 'text-right')}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
