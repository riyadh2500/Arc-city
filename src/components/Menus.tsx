import { Play, RotateCcw, Settings as Cog, LogOut } from 'lucide-react'
import { WalletChip } from './WalletChip'

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Shift', 'Sprint'],
  ['Space', 'Jump / Handbrake'],
  ['E', 'Enter / exit / buy'],
  ['Left click', 'Shoot / punch'],
  ['Right click', 'Aim'],
  ['R', 'Reload / respray'],
  ['1-0 / wheel / Q', 'Switch weapon'],
  ['X', 'Holster / draw'],
  ['H', 'Horn'],
  ['Esc', 'Pause'],
]

function MenuButton({ icon, label, onClick, primary }: { icon: React.ReactNode; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-5 py-3 text-left font-display text-lg font-bold tracking-tight transition ${
        primary ? 'bg-white text-[#0b1020] hover:bg-[#e8eefc]' : 'bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  return (
    <div className="absolute inset-0 flex bg-gradient-to-r from-[#0b1020]/90 via-[#0b1020]/45 to-transparent">
      <div className="absolute right-6 top-6 z-10">
        <WalletChip />
      </div>
      <div className="flex w-full max-w-xl flex-col justify-center px-10 sm:px-16">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-[#8fb0ff]">Open world on Arc</p>
        <h1 className="mt-2 font-display text-7xl font-bold leading-[0.9] tracking-[-0.04em] text-white sm:text-8xl">
          ARC
          <br />
          CITY
        </h1>
        <p className="mt-5 max-w-sm text-pretty text-base text-white/70">
          Steal a ride, run couriers across a living city, and watch the sun set over the skyline.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          <MenuButton primary icon={<Play className="h-5 w-5" />} label="Play Game" onClick={onPlay} />
          <MenuButton icon={<Cog className="h-5 w-5" />} label="Settings" onClick={onSettings} />
        </div>
        <div className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          {CONTROLS.map(([k, v]) => (
            <div key={k} className="text-xs text-white/60">
              <span className="mr-2 inline-block rounded-md bg-white/12 px-1.5 py-0.5 font-medium text-white/90 ring-1 ring-white/15">{k}</span>
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PauseMenu({ onResume, onSettings, onQuit }: { onResume: () => void; onSettings: () => void; onQuit: () => void }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0b1020]/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-[#0b1020]/85 p-6 ring-1 ring-white/15 backdrop-blur-xl">
        <h2 className="font-display text-3xl font-bold tracking-tight text-white">Paused</h2>
        <div className="mt-5 flex flex-col gap-3">
          <MenuButton primary icon={<RotateCcw className="h-5 w-5" />} label="Resume" onClick={onResume} />
          <MenuButton icon={<Cog className="h-5 w-5" />} label="Settings" onClick={onSettings} />
          <MenuButton icon={<LogOut className="h-5 w-5" />} label="Quit to menu" onClick={onQuit} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/10 pt-4">
          {CONTROLS.map(([k, v]) => (
            <div key={k} className="text-xs text-white/60">
              <span className="mr-2 inline-block rounded-md bg-white/12 px-1.5 py-0.5 font-medium text-white/90">{k}</span>
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
