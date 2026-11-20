import { useCallback, useEffect, useRef, useState } from 'react'
import { Hud } from '@/components/Hud'
import { MainMenu, PauseMenu } from '@/components/Menus'
import { SettingsPanel } from '@/components/SettingsPanel'
import { DEFAULT_SETTINGS, Game, type GameState, type HudState, type Settings } from '@/game/Game'

const STORAGE_KEY = 'arc-city-settings-v1'

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_SETTINGS
}

const EMPTY_HUD: HudState = {
  health: 100,
  money: 0,
  speedKmh: 0,
  inVehicle: false,
  vehicleName: '',
  vehicleHealth: 100,
  gear: 0,
  hour: 9,
  prompt: null,
  mission: { title: '', objective: '', target: null, timeLeft: null, reward: 0, index: 0 },
  distance: null,
  toast: null,
  wasted: false,
  busted: false,
  locked: false,
  wantedLevel: 0,
  searching: false,
  bust: 0,
  district: '',
  fps: 60,
  showFps: false,
  weapon: 'Pistol',
  ammo: 12,
  reserve: 72,
  melee: false,
  reloading: false,
  reloadFrac: 0,
  aiming: false,
  hitmark: 0,
  killmark: 0,
  hurtFlash: 0,
  scope: false,
  slots: [],
}

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [state, setState] = useState<GameState>('menu')
  const [hud, setHud] = useState<HudState>(EMPTY_HUD)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const settingsRef = useRef(settings)

  useEffect(() => {
    if (!mountRef.current || !mapRef.current) return
    let game: Game | null = null
    try {
      game = new Game(mountRef.current, mapRef.current, settingsRef.current, setHud, setState)
      gameRef.current = game
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not start the 3D engine (WebGL required).'
      queueMicrotask(() => setError(msg))
    }
    return () => {
      game?.dispose()
      gameRef.current = null
    }
  }, [])

  const changeSettings = useCallback((s: Settings) => {
    setSettings(s)
    settingsRef.current = s
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      /* storage unavailable */
    }
    gameRef.current?.applySettings(s)
  }, [])

  const play = () => gameRef.current?.start()
  const resume = () => gameRef.current?.resume()
  const quit = () => {
    setShowSettings(false)
    gameRef.current?.quitToMenu()
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b1020]">
      <div ref={mountRef} className="absolute inset-0" />

      {/* mini-map canvas is always mounted so the engine can draw into it */}
      <div className={state === 'playing' ? 'contents' : 'hidden'}>
        <Hud hud={hud} minimapRef={mapRef} onWeapon={(k) => gameRef.current?.selectWeapon(k)} />
      </div>

      {state === 'menu' && !showSettings && <MainMenu onPlay={play} onSettings={() => setShowSettings(true)} />}
      {state === 'paused' && !showSettings && <PauseMenu onResume={resume} onSettings={() => setShowSettings(true)} onQuit={quit} />}
      {showSettings && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b1020]/70 p-4 backdrop-blur-sm">
          <SettingsPanel settings={settings} onChange={changeSettings} onBack={() => setShowSettings(false)} />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0b1020] p-8 text-center text-white">
          <div>
            <h2 className="font-display text-2xl font-bold">Could not start ARC CITY</h2>
            <p className="mt-2 text-white/70">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
