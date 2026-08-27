import { useState, type ReactNode } from 'react'
import { FolderSearch, FolderOpen, CheckCircle2, XCircle } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Page } from '@/components/Page'
import { Button, Card, Badge } from '@/components/ui'

export function SettingsPage(): ReactNode {
  const { config, setGame } = useAppStore()
  const game = config?.game ?? null
  const [detecting, setDetecting] = useState(false)
  const [browsing, setBrowsing] = useState(false)

  return (
    <Page title="Settings" subtitle="Point the manager at your Grand Theft Auto V install.">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Game folder</h2>
          {game &&
            (game.valid ? (
              <Badge tone="good">
                <CheckCircle2 className="size-3" /> valid
              </Badge>
            ) : (
              <Badge tone="bad">
                <XCircle className="size-3" /> GTA5.exe not found
              </Badge>
            ))}
        </div>

        <p className="mt-3 break-all rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[12px] text-ink-soft">
          {game?.path ?? 'Not set'}
        </p>
        {game?.version && (
          <p className="mt-1.5 text-[12px] text-ink-faint">
            Executable version <span className="font-mono">{game.version}</span> · detected via{' '}
            {game.platform}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <Button
            loading={detecting}
            onClick={async () => {
              setDetecting(true)
              try {
                const found = await window.api.game.detect()
                if (found) await setGame(found)
                else alert('Could not auto-detect GTA V. Use "Browse" to select the folder.')
              } finally {
                setDetecting(false)
              }
            }}
          >
            <FolderSearch className="size-4" />
            Auto-detect
          </Button>
          <Button
            loading={browsing}
            onClick={async () => {
              setBrowsing(true)
              try {
                const picked = await window.api.game.browse()
                if (picked) await setGame(picked)
              } finally {
                setBrowsing(false)
              }
            }}
          >
            <FolderOpen className="size-4" />
            Browse…
          </Button>
          {game && (
            <Button variant="ghost" onClick={() => setGame(null)}>
              Clear
            </Button>
          )}
        </div>
      </Card>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">
        Mods are copied into an internal library, so the original download can be deleted after
        importing. Overwritten game files are backed up and restored automatically when you disable
        or remove a mod.
      </p>
    </Page>
  )
}
