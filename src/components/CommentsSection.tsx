import type { Comments } from '../types'

export default function CommentsSection({ comments }: { comments: Comments }) {
  return (
    <div>
      <h3 style={{ marginBottom: 12, color: '#94a3b8', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1 }}>
        Comentarios operativos
      </h3>
      {comments.daily.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ color: '#e2e8f0', fontSize: 13, marginBottom: 8, fontWeight: 600 }}>Diario</h4>
          {comments.daily.map((c, i) => (
            <p key={i} style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>{c}</p>
          ))}
        </div>
      )}
      {comments.weekly.length > 0 && (
        <div>
          <h4 style={{ color: '#e2e8f0', fontSize: 13, marginBottom: 8, fontWeight: 600 }}>Semanal</h4>
          {comments.weekly.map((c, i) => (
            <p key={i} style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6, lineHeight: 1.5 }}>{c}</p>
          ))}
        </div>
      )}
      {comments.daily.length === 0 && comments.weekly.length === 0 && (
        <p style={{ color: '#64748b', fontSize: 13 }}>Sin comentarios disponibles.</p>
      )}
    </div>
  )
}
