import { useState, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui'

export function OnlineWarning(): ReactNode {
  const bootstrap = useAppStore((s) => s.bootstrap)
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md rounded-2xl border border-line bg-bg-card p-7 shadow-card">
        <ShieldAlert className="size-8 text-warn" />
        <h1 className="mt-4 text-lg font-semibold">Single-player modding only</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Mods installed by this tool are for <strong>Story Mode</strong>. Launching GTA Online with
          Script Hook V or modified game files present can get your Rockstar account banned.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Always disable your mods (or restore a clean game folder) before playing online. The
          standard <span className="font-mono text-ink">dinput8.dll</span> loader blocks itself
          online, but do not rely on that alone.
        </p>
        <Button
          variant="primary"
          className="mt-5 w-full"
          loading={busy}
          onClick={async () => {
            setBusy(true)
            await window.api.config.acceptOnlineWarning()
            await bootstrap()
          }}
        >
          I understand — continue
        </Button>
      </div>
    </div>
  )
}
