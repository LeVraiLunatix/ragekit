import type { ReactNode } from 'react'
import { AlertTriangle, FileCode2, FileCog, FileBox, PackageOpen } from 'lucide-react'
import type { FileRole, InstallPlan } from '@shared/types'
import { Badge } from './ui'

const ROLE_LABEL: Record<FileRole, string> = {
  asi: 'ASI plugins',
  'script-dll': '.NET script plugins',
  script: 'Script files',
  'root-dll': 'Loader DLLs (game root)',
  'mods-tree': 'Files in mods/ tree',
  asset: 'Config & assets',
  ignored: 'Ignored',
}

const DEP_LABEL: Record<string, string> = {
  scripthookv: 'Script Hook V',
  scripthookvdotnet: 'Script Hook V .NET',
  'openiv-asi': 'OpenIV.asi (mods folder)',
  'community-sh': 'SHVDN runtime',
}

export function PlanPreview({ plan }: { plan: InstallPlan }): ReactNode {
  const byRole = new Map<FileRole, number>()
  for (const f of plan.files) byRole.set(f.role, (byRole.get(f.role) ?? 0) + 1)
  const overwrites = plan.files.filter((f) => f.overwrite).length

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-ink-soft">
          {plan.kind === 'oiv' ? (
            <PackageOpen className="size-4 text-brand" />
          ) : (
            <FileBox className="size-4 text-brand" />
          )}
          {plan.files.length} file{plan.files.length === 1 ? '' : 's'}
        </span>
        {overwrites > 0 && <Badge tone="warn">{overwrites} overwrite{overwrites === 1 ? '' : 's'}</Badge>}
        <Badge tone="brand">{plan.kind === 'oiv' ? 'OIV package' : 'Drop-in'}</Badge>
      </div>

      <ul className="space-y-1">
        {[...byRole.entries()].map(([role, count]) => (
          <li key={role} className="flex items-center gap-2 text-ink-faint">
            {role === 'script' || role === 'script-dll' ? (
              <FileCode2 className="size-3.5" />
            ) : (
              <FileCog className="size-3.5" />
            )}
            <span className="text-ink-soft">{count}×</span> {ROLE_LABEL[role]}
          </li>
        ))}
      </ul>

      {plan.missingDependencies.length > 0 && (
        <div className="rounded-lg border border-warn/25 bg-warn/10 p-2.5">
          <p className="flex items-center gap-1.5 font-medium text-warn">
            <AlertTriangle className="size-3.5" />
            Missing dependencies
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">
            {plan.missingDependencies.map((d) => DEP_LABEL[d] ?? d).join(', ')} — install from the
            Dependencies tab. You can still install this mod; it just won&apos;t load in-game yet.
          </p>
        </div>
      )}

      {plan.warnings.map((w, i) => (
        <p key={i} className="flex gap-1.5 text-[12px] text-ink-faint">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-ink-faint" />
          {w}
        </p>
      ))}
    </div>
  )
}
