import { Heart, MapPin, Navigation, Star, Wallet } from 'lucide-react'
import type { HudState } from '@/game/Game'

function clock(hour: number): string {
  const h = Math.floor(hour) % 24
  const m = Math.floor((hour - Math.floor(hour)) * 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function Speedometer({ kmh, name, gear, health }: { kmh: number; name: string; gear: number; health: number }) {
  const max = 220
  const frac = Math.min(1, kmh / max)
  const r = 54
  const arc = 2 * Math.PI * r * 0.75
  return (
    <div className="pointer-events-none absolute bottom-[72px] right-6 flex flex-col items-center">
      <div className="relative h-[150px] w-[150px] rounded-full bg-[#0b1020]/70 backdrop-blur-md ring-1 ring-white/15">
        <svg viewBox="0 0 140 140" className="absolute inset-0 -rotate-[225deg]">
          <circle cx="70" cy="70" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${arc} 999`} />
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            stroke={frac > 0.8 ? '#ff6b5e' : '#5b8cff'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${arc * frac} 999`}
            style={{ transition: 'stroke-dasharray 120ms linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl font-bold leading-none tabular-nums text-white">{kmh}</span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.1em] text-white/60">km/h</span>
          <span className="mt-1 font-display text-sm font-bold tabular-nums text-white/80">{gear === -1 ? 'R' : gear === 0 ? 'N' : gear}</span>
        </div>
      </div>
      <span className="mt-2 rounded-full bg-[#0b1020]/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-white/80 backdrop-blur-md">
        {name}
      </span>
      <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/15">
        <div className={`h-full rounded-full ${health < 30 ? 'bg-[#ff6b5e]' : 'bg-[#8fb0ff]'}`} style={{ width: `${health}%` }} />
      </div>
    </div>
  )
}

function Stars({ level, searching }: { level: number; searching: boolean }) {
  if (level === 0) return null
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`h-6 w-6 ${n <= level ? (searching ? 'animate-pulse fill-[#ffd23f] text-[#ffd23f]' : 'fill-[#ffd23f] text-[#ffd23f]') : 'fill-transparent text-white/30'}`}
          />
        ))}
      </div>
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-white/70">{searching ? 'Searching. Stay hidden' : 'Police in pursuit'}</span>
    </div>
  )
}

export function Hud({ hud, minimapRef, onWeapon }: { hud: HudState; minimapRef: React.RefObject<HTMLCanvasElement>; onWeapon?: (key: number) => void }) {
  const { mission } = hud
  const low = hud.health < 30
  return (
    <div className="pointer-events-none absolute inset-0 select-none font-body text-white">
      {/* mission panel */}
      <div className="absolute left-6 top-6 w-[280px] rounded-2xl bg-[#0b1020]/65 p-4 ring-1 ring-white/10 backdrop-blur-md">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-[#ffd23f]">
          <Navigation className="h-3.5 w-3.5" />
          {mission.title}
        </div>
        <p className="mt-1.5 font-display text-xl font-bold leading-tight text-white">{mission.objective}</p>
        <div className="mt-2 flex items-center justify-between text-sm text-white/70">
          <span className="tabular-nums">{hud.distance !== null ? `${hud.distance} m away` : ''}</span>
          {mission.timeLeft !== null && (
            <span className={`font-display text-base font-bold tabular-nums ${mission.timeLeft < 20 ? 'text-[#ff6b5e]' : 'text-white'}`}>
              {Math.max(0, Math.ceil(mission.timeLeft))}s
            </span>
          )}
        </div>
        {mission.reward > 0 && <p className="mt-1 text-xs text-white/50">Reward ${mission.reward}</p>}
      </div>

      {/* top-right: cash + clock */}
      <div className="absolute right-6 top-6 flex flex-col items-end gap-1">
        <div className="flex items-center gap-2 font-display text-3xl font-bold tabular-nums text-white drop-shadow">
          <Wallet className="h-5 w-5 text-[#7cf0a8]" />${hud.money.toLocaleString()}
        </div>
        <div className="rounded-full bg-[#0b1020]/60 px-3 py-1 text-xs font-medium tabular-nums tracking-[0.06em] text-white/80 backdrop-blur-md">
          {clock(hud.hour)}
        </div>
        <Stars level={hud.wantedLevel} searching={hud.searching} />
        {hud.bust > 0.05 && (
          <div className="mt-1 w-40">
            <div className="mb-1 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[#8fb0ff]">Being arrested</div>
            <div className="h-2 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/15">
              <div className="h-full rounded-full bg-[#5b8cff]" style={{ width: `${hud.bust * 100}%` }} />
            </div>
          </div>
        )}
        {hud.showFps && <div className="text-[11px] tabular-nums text-white/50">{hud.fps} fps</div>}
      </div>

      {/* minimap + health */}
      <div className="absolute bottom-6 left-6 flex items-end gap-4">
        <div className="relative h-[190px] w-[190px] rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <canvas ref={minimapRef} width={190} height={190} className="h-full w-full" />
        </div>
        <div className="mb-3 w-44">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/80">
            <MapPin className="h-3.5 w-3.5 text-[#8fb0ff]" />
            {hud.district}
          </div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-white/70">
            <Heart className={`h-3.5 w-3.5 ${low ? 'text-[#ff6b5e]' : 'text-[#7cf0a8]'}`} />
            Health
            <span className="ml-auto tabular-nums text-white">{hud.health}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-black/50 ring-1 ring-white/15">
            <div
              className={`h-full rounded-full transition-[width] duration-200 ${low ? 'bg-[#ff6b5e]' : 'bg-[#7cf0a8]'}`}
              style={{ width: `${hud.health}%` }}
            />
          </div>
        </div>
      </div>

      {hud.inVehicle && <Speedometer kmh={hud.speedKmh} name={hud.vehicleName} gear={hud.gear} health={hud.vehicleHealth} />}

      {/* crosshair, hit markers, damage flash */}
      {!hud.inVehicle && !hud.wasted && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {hud.aiming ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/80 shadow-[0_0_6px_rgba(0,0,0,0.6)]">
              <div className="h-1 w-1 rounded-full bg-white" />
            </div>
          ) : (
            <div className={`rounded-full bg-white/70 shadow-[0_0_4px_rgba(0,0,0,0.7)] ${hud.melee ? 'h-1 w-1' : 'h-1.5 w-1.5'}`} />
          )}
        </div>
      )}
      {hud.hitmark > 0 && (
        <svg key={`h${hud.hitmark}`} className="hit-pop absolute left-1/2 top-1/2 h-8 w-8 text-white" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 6l6 6M26 6l-6 6M6 26l6-6M26 26l-6-6" />
        </svg>
      )}
      {hud.killmark > 0 && (
        <svg key={`k${hud.killmark}`} className="hit-pop absolute left-1/2 top-1/2 h-12 w-12 text-[#ff4d3f]" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M5 5l22 22M27 5L5 27" />
        </svg>
      )}
      {hud.scope && (
        <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at center, rgba(0,0,0,0) 0, rgba(0,0,0,0) 26vh, rgba(0,0,0,0.92) 27vh)' }}>
          <div className="absolute left-0 right-0 top-1/2 h-px bg-black/70" />
          <div className="absolute bottom-0 left-1/2 top-0 w-px bg-black/70" />
        </div>
      )}
      {hud.hurtFlash > 0 && <div key={`f${hud.hurtFlash}`} className="hurt-flash absolute inset-0" />}

      {/* weapon list: all weapons visible, click or press 1-5 */}
      {!hud.inVehicle && (hud.slots ?? []).length > 0 && (
        <div className="absolute bottom-[72px] right-6 w-60">
          <div className="rounded-2xl bg-[#0b1020]/70 p-2 ring-1 ring-white/10 backdrop-blur-md">
            {(hud.slots ?? []).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onWeapon?.(s.key)}
                className={`pointer-events-auto mb-0.5 flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left text-[13px] last:mb-0 ${
                  s.active ? 'bg-white text-[#0b1020]' : 'text-white/75 hover:bg-white/10'
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold tabular-nums ${s.active ? 'bg-[#0b1020] text-white' : 'bg-white/10'}`}>{s.key}</span>
                <span className="flex-1 font-medium">{s.name}</span>
                <span className="text-xs font-medium tabular-nums opacity-80">{s.melee ? '' : `${s.mag}/${s.reserve}`}</span>
              </button>
            ))}
            {hud.reloading && (
              <div className="mx-1 mt-1 h-1.5 overflow-hidden rounded-full bg-black/50">
                <div className="h-full rounded-full bg-[#ffd23f]" style={{ width: `${hud.reloadFrac * 100}%` }} />
              </div>
            )}
          </div>
          <p className="mt-1.5 text-right text-[10px] text-white/45">Click: attack. Right click: aim. R: reload. X: holster.</p>
        </div>
      )}

      {/* prompt */}
      {hud.prompt && !hud.wasted && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-[#0b1020]/75 px-5 py-2.5 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur-md">
          {hud.prompt}
        </div>
      )}

      {/* toast */}
      {hud.toast && (
        <div
          key={hud.toast.id}
          className={`toast-in absolute left-1/2 top-24 -translate-x-1/2 rounded-2xl px-6 py-3 font-display text-lg font-bold ring-1 backdrop-blur-md ${
            hud.toast.kind === 'reward'
              ? 'bg-[#0f3a24]/80 text-[#7cf0a8] ring-[#7cf0a8]/40'
              : hud.toast.kind === 'warn'
                ? 'bg-[#3a1512]/80 text-[#ff8a7e] ring-[#ff6b5e]/40'
                : 'bg-[#0b1020]/80 text-white ring-white/20'
          }`}
        >
          {hud.toast.text}
        </div>
      )}

      {hud.busted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span className="font-display text-7xl font-bold tracking-[-0.03em] text-[#5b8cff]">BUSTED</span>
        </div>
      )}

      {hud.wasted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span className="font-display text-7xl font-bold tracking-[-0.03em] text-[#ff4d3f]">WASTED</span>
        </div>
      )}

      {!hud.locked && !hud.wasted && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/50">Move the mouse to look (touch the screen edge to keep turning). Left click attacks, right click aims. Press 1-0 or scroll to switch weapons, X to holster.</div>
      )}
    </div>
  )
}
