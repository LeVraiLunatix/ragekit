import type { ReactNode } from 'react'
import { AlertTriangle, FileCode2, FileCog, FileBox, PackageOpen } from 'lucide-react'
import type { FileRole, InstallPlan } from '@shared/types'
import { useI18n } from '@/i18n'
import { Badge } from './ui'

const ROLE_KEY: Record<FileRole, string> = {
  asi: 'plan.roles.asi',
  'script-dll': 'plan.roles.scriptDll',
  script: 'plan.roles.script',
  'root-dll': 'plan.roles.rootDll',
  'mods-tree': 'plan.roles.modsTree',
  asset: 'plan.roles.asset',
  ignored: 'plan.roles.ignored',
}

export function PlanPreview({ plan }: { plan: InstallPlan }): ReactNode {
  const { t, tc } = useI18n()
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
          {tc('plan.files', plan.files.length)}
        </span>
        {overwrites > 0 && <Badge tone="warn">{tc('plan.overwrites', overwrites)}</Badge>}
        <Badge tone="brand">{plan.kind === 'oiv' ? t('plan.oivPackage') : t('plan.dropin')}</Badge>
      </div>

      <ul className="space-y-1">
        {[...byRole.entries()].map(([role, count]) => (
          <li key={role} className="flex items-center gap-2 text-ink-faint">
            {role === 'script' || role === 'script-dll' ? (
              <FileCode2 className="size-3.5" />
            ) : (
              <FileCog className="size-3.5" />
            )}
            <span className="text-ink-soft">{count}×</span> {t(ROLE_KEY[role])}
          </li>
        ))}
      </ul>

      {plan.missingDependencies.length > 0 && (
        <div className="rounded-lg border border-warn/25 bg-warn/10 p-2.5">
          <p className="flex items-center gap-1.5 font-medium text-warn">
            <AlertTriangle className="size-3.5" />
            {t('plan.missingDeps')}
          </p>
          <p className="mt-1 text-[12px] text-ink-soft">
            {t('plan.missingDepsHint', {
              list: plan.missingDependencies.map((d) => t(`deps.names.${d}`)).join(', '),
            })}
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
