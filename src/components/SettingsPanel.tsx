import { ArrowLeft } from 'lucide-react'
import type { Quality, Settings } from '@/game/Game'

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-white/90">{label}</span>
        {value && <span className="tabular-nums text-white/55">{value}</span>}
      </div>
      {children}
    </div>
  )
}

const QUALITIES: { id: Quality; label: string }[] = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
]

export function SettingsPanel({ settings, onChange, onBack }: { settings: Settings; onChange: (s: Settings) => void; onBack: () => void }) {
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v })
  return (
    <div className="w-full max-w-md rounded-3xl bg-[#0b1020]/85 p-6 ring-1 ring-white/15 backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="font-display text-2xl font-bold tracking-tight text-white">Settings</h2>
      </div>
      <div className="divide-y divide-white/10">
        <Row label="Graphics quality">
          <div className="grid grid-cols-3 gap-2">
            {QUALITIES.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => set('quality', q.id)}
                className={`min-h-11 rounded-xl text-sm font-medium transition ${
                  settings.quality === q.id ? 'bg-white text-[#0b1020]' : 'bg-white/10 text-white/80 hover:bg-white/15'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Mouse sensitivity" value={settings.sensitivity.toFixed(1)}>
          <input type="range" min={0.3} max={2.5} step={0.1} value={settings.sensitivity} onChange={(e) => set('sensitivity', Number(e.target.value))} className="w-full" />
        </Row>
        <Row label="Field of view" value={`${settings.fov}°`}>
          <input type="range" min={55} max={95} step={1} value={settings.fov} onChange={(e) => set('fov', Number(e.target.value))} className="w-full" />
        </Row>
        <Row label="Day length" value={`${settings.dayMinutes} min`}>
          <input type="range" min={4} max={30} step={1} value={settings.dayMinutes} onChange={(e) => set('dayMinutes', Number(e.target.value))} className="w-full" />
        </Row>
        <Row label="Master volume" value={`${Math.round(settings.volume * 100)}%`}>
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => set('volume', Number(e.target.value))} className="w-full" />
        </Row>
        <Row label="Show FPS">
          <button
            type="button"
            role="switch"
            aria-checked={settings.showFps}
            onClick={() => set('showFps', !settings.showFps)}
            className={`relative h-8 w-14 rounded-full transition ${settings.showFps ? 'bg-[#5b8cff]' : 'bg-white/20'}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${settings.showFps ? 'left-7' : 'left-1'}`} />
          </button>
        </Row>
        <Row label="Invert vertical look">
          <button
            type="button"
            role="switch"
            aria-checked={settings.invertY}
            onClick={() => set('invertY', !settings.invertY)}
            className={`relative h-8 w-14 rounded-full transition ${settings.invertY ? 'bg-[#5b8cff]' : 'bg-white/20'}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${settings.invertY ? 'left-7' : 'left-1'}`} />
          </button>
        </Row>
      </div>
    </div>
  )
}
