import type { DailyRow } from '../types'

const cols: { key: keyof DailyRow; label: string }[] = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'iny_tgs', label: 'TGS' },
  { key: 'iny_tgn', label: 'TGN' },
  { key: 'iny_enarsa', label: 'ENARSA/GPM' },
  { key: 'iny_bolivia', label: 'Bolivia' },
  { key: 'iny_total', label: 'Total' },
]

const cell: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #334155', fontSize: 13 }
const hdr: React.CSSProperties = { ...cell, color: '#94a3b8', fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }

export default function InjectionsTable({ data }: { data: DailyRow[] }) {
  const last10 = data.slice(-10).reverse()
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {cols.map(c => <th key={c.key} style={hdr}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {last10.map(row => (
            <tr key={row.fecha}>
              {cols.map(c => (
                <td key={c.key} style={{ ...cell, textAlign: c.key === 'fecha' ? 'left' : 'right', color: c.key === 'iny_total' ? '#f1f5f9' : '#cbd5e1' }}>
                  {c.key === 'fecha' ? row.fecha.slice(5) : (row[c.key] as number | null)?.toFixed(1) ?? '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
