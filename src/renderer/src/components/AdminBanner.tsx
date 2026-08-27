import { useEffect, useState, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui'

/**
 * Shown when Ragekit runs unprivileged but the GTA V folder only grants write
 * access to administrators — every install/park/edit would fail with EPERM.
 * Offers a one-click elevated relaunch (UAC), OpenIV-style.
 */
export function AdminBanner(): ReactNode {
  const { t } = useI18n()
  const [needsAdmin, setNeedsAdmin] = useState(false)
  const [relaunching, setRelaunching] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.system.writable().then((s) => {
      if (alive) setNeedsAdmin(!s.elevated && !!s.gamePath && !s.gameWritable)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!needsAdmin) return null

  return (
    <div className="flex items-center gap-2.5 border-b border-warn/25 bg-warn/10 px-4 py-2 text-[12.5px] text-warn">
      <ShieldAlert className="size-4 shrink-0" />
      <span className="font-medium">{t('admin.bannerTitle')}</span>
      <span className="hidden min-w-0 truncate text-warn/80 md:inline">
        — {t('admin.bannerBody')}
      </span>
      <Button
        size="sm"
        variant="outline"
        loading={relaunching}
        className="no-drag ml-auto shrink-0"
        onClick={async () => {
          setRelaunching(true)
          const ok = await window.api.system.relaunchAdmin()
          if (!ok) {
            setRelaunching(false)
            alert(t('admin.devHint'))
          }
        }}
      >
        {relaunching ? t('admin.relaunching') : t('admin.relaunch')}
      </Button>
    </div>
  )
}
