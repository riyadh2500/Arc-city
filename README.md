# ARC CITY

A playable 3D open-world city game for the browser: explore a procedural city on foot, steal and drive cars, dodge traffic, and run courier missions through a day and night cycle. Connect a wallet on the main menu to see your USDC balance on Arc Testnet.

Built with [Arc Studio](https://studio.arc.io)

## Tech stack

- Three.js (3D graphics, procedural city, shadows, sky and reflections)
- React + TypeScript + Vite
- Tailwind CSS
- wagmi + viem + ConnectKit (wallet and USDC balance)

## Controls

- W A S D: move. Mouse: look. Shift: sprint. Space: jump.
- Left click: shoot or punch. Right click (or G): aim. R: reload. 1-0, mouse wheel or Q: switch weapon. X: holster or draw.
- E: enter or exit a car (or buy at shops). In a car: W accelerate, S brake and reverse, A and D steer, Space handbrake, H horn.
- Esc or P: pause.

## Development

Prerequisites: [Bun](https://bun.sh).

```bash
bun install
bun run dev
```

Other scripts: `bun run check` (lint and typecheck).

### Environment variables

None.
