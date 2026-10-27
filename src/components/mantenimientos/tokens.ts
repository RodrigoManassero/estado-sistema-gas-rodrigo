// Single place where the maintenance UI gets its colors and spacing, mapped to the
// project's theme.ts. Alpha variants use the same `color + '22'` pattern as the rest of
// the dashboard (see OperacionPage), so theme colors must stay 6-digit hex strings.
import { colors, radius } from '../../theme'
import type { CategoriaKey, SignoImpacto } from '../../types'
import type { Estado } from './utils'

export const mt = {
  surface: colors.surface, // opaque background used by sticky cells
  border: colors.border,
  band: 'rgba(128, 128, 128, 0.10)', // neutral overlay: weekend shading and expanded rows
  muted: colors.textDim,
  today: colors.status.err,
  radius: radius.sm,
  categoria: {
    transporte: colors.accent.blue,
    inyeccion: colors.accent.orange,
    otros: colors.accent.purple,
  } as Record<CategoriaKey, string>,
  signo: {
    negativo: { bg: colors.status.err + '22', fg: colors.status.err },
    positivo: { bg: colors.accent.green + '22', fg: colors.accent.green },
    mixto: { bg: colors.accent.orange + '22', fg: colors.accent.orange },
    cero: { bg: colors.border, fg: colors.textDim },
    sin_dato: { bg: colors.border, fg: colors.textDim },
  } as Record<SignoImpacto, { bg: string; fg: string }>,
  estado: {
    en_curso: { bg: colors.status.err + '22', fg: colors.status.err },
    proximo: { bg: colors.accent.orange + '22', fg: colors.accent.orange },
    futuro: { bg: colors.accent.blue + '22', fg: colors.accent.blue },
    finalizado: { bg: colors.border, fg: colors.textDim },
  } as Record<Estado, { bg: string; fg: string }>,
}

export const CATEGORIA_LABEL: Record<CategoriaKey, string> = {
  transporte: 'Transporte',
  inyeccion: 'Inyección',
  otros: 'Demanda y otros',
}
