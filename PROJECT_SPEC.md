# LocalWispr - Project Specification

> A lightweight, always-on voice-to-text desktop app with excellent Arabic support

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Tech Stack](#tech-stack)
3. [Architecture](#architecture)
4. [Project Structure](#project-structure)
5. [Features](#features)
6. [How It Works](#how-it-works)
7. [Comparison with Similar Apps](#comparison-with-similar-apps)
8. [Implementation Plan](#implementation-plan)
9. [API Reference](#api-reference)
10. [Future Roadmap](#future-roadmap)

---

## Project Overview

### What is LocalWispr?

LocalWispr is a desktop application that lets you dictate text anywhere on your computer. Press a keyboard shortcut, speak, and watch your words appear in real-time wherever your cursor is.

### Core Requirements

| Requirement | Description |
|-------------|-------------|
| **Always Running** | Starts automatically with Windows, runs silently in background |
| **Global Shortcut** | Activates from anywhere with `Ctrl+Shift+Space` |
| **Real-time Transcription** | Words appear as you speak (streaming) |
| **Arabic Support** | Excellent Arabic transcription via SONIOX |
| **Lightweight** | Minimal memory footprint (~30-50MB) |
| **Small Popup UI** | Clean, minimal popup like Wispr Flow |
| **Cross-platform Ready** | Windows now, Mac in future |

### Why Build This?

- **Windows+H** is local but doesn't support Arabic well
- **Wispr Flow** is great but proprietary and subscription-based
- **SONIOX** offers best-in-class Arabic transcription
- **You own your tool** - customize it however you want

---

## Tech Stack

### Core Technologies

```
┌─────────────────────────────────────────────────────────────┐
│                      LOCALWISPR                             │
├─────────────────────────────────────────────────────────────┤
│  FRONTEND (What you see)                                    │
│  ├── React 18 - UI components                               │
│  ├── TypeScript - Type safety                               │
│  ├── Vite - Fast build tool                                 │
│  └── CSS - Styling                                          │
├─────────────────────────────────────────────────────────────┤
│  BACKEND (The engine)                                       │
│  ├── Tauri 2.x - Desktop framework                          │
│  ├── Rust - System-level code                               │
│  ├── cpal - Audio capture                                   │
│  └── enigo - Keyboard simulation                            │
├─────────────────────────────────────────────────────────────┤
│  EXTERNAL SERVICE                                           │
│  └── SONIOX API - Speech-to-text (WebSocket streaming)      │
└─────────────────────────────────────────────────────────────┘
```

### Why These Choices?

| Technology | Why? | Alternatives Considered |
|------------|------|------------------------|
| **Tauri** | 10x lighter than Electron (30MB vs 300MB), fast startup, secure | Electron (too heavy for background app) |
| **React** | Popular, lots of resources, component-based | Vue, Svelte (all would work) |
| **TypeScript** | Catches errors early, better IDE support | JavaScript (less safe) |
| **Rust** | Fast, safe, required by Tauri | N/A |
| **SONIOX** | Best Arabic support, real-time streaming, affordable | Whisper (worse Arabic), Google (expensive) |
| **cpal** | Cross-platform audio, Rust native | portaudio (harder to build) |
| **enigo** | Cross-platform keyboard simulation | platform-specific APIs |

### Dependencies Overview

#### Frontend (package.json)
```json
{
  "dependencies": {
    "react": "^18.x",
    "react-dom": "^18.x",
    "@tauri-apps/api": "^2.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "vite": "^5.x",
    "@vitejs/plugin-react": "^4.x"
  }
}
```

#### Backend (Cargo.toml)
```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
tokio-tungstenite = "0.21"      # WebSocket for SONIOX
cpal = "0.15"                    # Audio capture
enigo = "0.2"                    # Keyboard simulation
```

---

## Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         USER'S COMPUTER                            │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    LOCALWISPR APP                             │ │
│  │                                                               │ │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │ │
│  │  │   System    │    │   Tauri     │    │   React UI      │  │ │
│  │  │   Tray      │◄──►│   Core      │◄──►│   (Popup)       │  │ │
│  │  │   Icon      │    │   (Rust)    │    │                 │  │ │
│  │  └─────────────┘    └──────┬──────┘    └─────────────────┘  │ │
│  │                            │                                  │ │
│  │         ┌──────────────────┼──────────────────┐              │ │
│  │         │                  │                  │              │ │
│  │         ▼                  ▼                  ▼              │ │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │ │
│  │  │  Keyboard   │    │   Audio     │    │  Keyboard   │      │ │
│  │  │  Shortcut   │    │   Capture   │    │  Simulation │      │ │
│  │  │  Listener   │    │   (cpal)    │    │  (enigo)    │      │ │
│  │  └─────────────┘    └──────┬──────┘    └──────▲──────┘      │ │
│  │                            │                  │              │ │
│  └────────────────────────────│──────────────────│──────────────┘ │
│                               │                  │                 │
└───────────────────────────────│──────────────────│─────────────────┘
                                │                  │
                    Audio Stream│                  │Transcribed Text
                    (WebSocket) │                  │
                                ▼                  │
                    ┌───────────────────┐          │
                    │   SONIOX CLOUD    │          │
                    │                   │──────────┘
                    │  Speech-to-Text   │
                    │  (Real-time)      │
                    └───────────────────┘
```

### Data Flow

```
1. User presses Ctrl+Shift+Space
           │
           ▼
2. Shortcut listener triggers popup to show
           │
           ▼
3. Audio capture starts (microphone)
           │
           ▼
4. Audio streamed to SONIOX via WebSocket
           │
           ▼
5. SONIOX returns transcribed text (real-time)
           │
           ▼
6. Text displayed in popup (live preview)
           │
           ▼
7. User releases shortcut or clicks done
           │
           ▼
8. Final text typed at cursor position (enigo)
           │
           ▼
9. Popup hides, app returns to background
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **System Tray** | App icon, right-click menu (settings, quit) |
| **Shortcut Listener** | Detect `Ctrl+Shift+Space` globally |
| **Audio Capture** | Get microphone input, convert to streamable format |
| **SONIOX Client** | WebSocket connection, send audio, receive text |
| **Keyboard Simulation** | Type text at current cursor position |
| **React UI** | Show popup, display live transcription, settings |

---

## Project Structure

```
localwispr/
│
├── src-tauri/                      # Rust backend
│   ├── src/
│   │   ├── main.rs                 # App entry point
│   │   ├── lib.rs                  # Library exports
│   │   ├── audio.rs                # Microphone capture
│   │   ├── soniox.rs               # SONIOX WebSocket client
│   │   ├── keyboard.rs             # Keyboard simulation
│   │   ├── shortcut.rs             # Global shortcut handling
│   │   └── tray.rs                 # System tray setup
│   │
│   ├── Cargo.toml                  # Rust dependencies
│   ├── tauri.conf.json             # Tauri configuration
│   ├── build.rs                    # Build script
│   └── icons/                      # App icons
│       ├── icon.ico
│       ├── icon.png
│       └── 32x32.png
│
├── src/                            # React frontend
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Main app component
│   ├── components/
│   │   ├── RecordingPopup.tsx      # The main popup UI
│   │   ├── WaveformVisualizer.tsx  # Audio waveform display
│   │   └── StatusIndicator.tsx     # Recording status
│   │
│   ├── hooks/
│   │   ├── useAudioRecording.ts    # Audio recording hook
│   │   └── useTranscription.ts     # Transcription state
│   │
│   ├── styles/
│   │   ├── globals.css             # Global styles
│   │   └── popup.css               # Popup-specific styles
│   │
│   └── lib/
│       └── tauri.ts                # Tauri API helpers
│
├── index.html                      # HTML entry point
├── package.json                    # Node dependencies
├── tsconfig.json                   # TypeScript config
├── vite.config.ts                  # Vite config
│
├── .env.example                    # Environment variables template
├── .gitignore
├── README.md
└── PROJECT_SPEC.md                 # This file
```

### File Count & Lines of Code (Estimated)

| Category | Files | Lines of Code |
|----------|-------|---------------|
| Rust Backend | 7 files | ~500-700 lines |
| React Frontend | 8 files | ~300-400 lines |
| Config Files | 6 files | ~150 lines |
| **Total** | **~21 files** | **~950-1250 lines** |

---

## Features

### MVP (Phase 1) - What We Build First

| Feature | Description | Priority |
|---------|-------------|----------|
| Global Shortcut | `Ctrl+Shift+Space` to activate | Must Have |
| Audio Capture | Record from default microphone | Must Have |
| SONIOX Integration | Stream audio, get real-time text | Must Have |
| Popup UI | Show recording status & live text | Must Have |
| Type at Cursor | Insert text where cursor is | Must Have |
| System Tray | Icon with quit option | Must Have |
| Auto-start | Start with Windows | Should Have |

### Future Enhancements (Phase 2+)

| Feature | Description | Priority |
|---------|-------------|----------|
| History | Store past transcriptions locally | Medium |
| Smart Cleanup | Remove "um", "uh", auto-punctuate | Medium |
| Custom Shortcuts | Let user choose their shortcut | Low |
| Multiple Languages | Quick switch between languages | Medium |
| Cloud Sync | Sync history across devices | Low |
| Authentication | User accounts for cloud features | Low |

---

## How It Works

### Step-by-Step User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. APP STARTS WITH WINDOWS                                      │
│    - Runs silently in background                                │
│    - Shows icon in system tray                                  │
│    - Listens for keyboard shortcut                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. USER PRESSES Ctrl+Shift+Space                                │
│    - Small popup appears near cursor                            │
│    - Microphone starts capturing                                │
│    - "Listening..." indicator shown                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. USER SPEAKS                                                  │
│    - Audio streams to SONIOX in real-time                       │
│    - Words appear in popup as they're recognized                │
│    - Waveform visualizer shows audio activity                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. USER RELEASES SHORTCUT OR CLICKS DONE                        │
│    - Recording stops                                            │
│    - Final text is typed at cursor position                     │
│    - Popup fades away                                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. APP RETURNS TO BACKGROUND                                    │
│    - Ready for next activation                                  │
│    - Minimal resource usage                                     │
└─────────────────────────────────────────────────────────────────┘
```

### SONIOX Integration Details

```
WEBSOCKET CONNECTION
────────────────────

Connect to: wss://api.soniox.com/transcribe-websocket

1. Open WebSocket connection with API key
2. Send audio configuration:
   {
     "api_key": "YOUR_API_KEY",
     "sample_rate_hertz": 16000,
     "audio_encoding": "LINEAR16",
     "language_code": "ar"  // or "en", "multi" for auto-detect
   }

3. Stream audio chunks (every 100ms)
   - Send raw PCM audio bytes

4. Receive transcription:
   {
     "text": "transcribed text here",
     "is_final": false,      // interim result
     "confidence": 0.95
   }

5. When is_final: true, that segment is complete
```

---

## Comparison with Similar Apps

| Feature | LocalWispr | Wispr Flow | Superwhisper | VoiceTypr |
|---------|------------|------------|--------------|-----------|
| **Framework** | Tauri | Electron? | Native Mac | Tauri |
| **Size** | ~10MB | ~150MB | ~50MB | ~10MB |
| **Memory** | ~30-50MB | ~200MB | ~100MB | ~30-50MB |
| **Offline** | No | No | Yes | Yes |
| **Arabic** | Excellent | Good | Limited | Limited |
| **Price** | Your API costs | $10/month | $8/month | Free |
| **Open Source** | Yes (yours!) | No | No | Yes |
| **Windows** | Yes | Yes | No | Yes |
| **Mac** | Future | Yes | Yes | Yes |

### Your Competitive Advantages

1. **Best Arabic Support** - SONIOX is superior for Arabic
2. **Lightweight** - Tauri keeps it small and fast
3. **You Own It** - Customize however you want
4. **Cost Effective** - Only pay for what you use (~$0.12/hour)

---

## Implementation Plan

### Phase 1: MVP (Core Functionality)

```
STEP 1: Project Setup
├── Initialize Tauri project
├── Setup React + TypeScript
├── Configure Vite
└── Create folder structure

STEP 2: System Tray & Shortcuts
├── Create system tray icon
├── Add quit menu item
├── Register global shortcut (Ctrl+Shift+Space)
└── Test shortcut detection

STEP 3: Popup Window
├── Create popup React component
├── Style it like Wispr Flow (minimal, clean)
├── Position near cursor when activated
└── Handle show/hide animations

STEP 4: Audio Capture
├── Setup cpal for microphone access
├── Configure audio format (16kHz, mono, PCM)
├── Create audio buffer/stream
└── Test audio capture works

STEP 5: SONIOX Integration
├── Create WebSocket connection
├── Send audio configuration
├── Stream audio chunks
├── Receive and parse transcriptions
└── Handle connection errors

STEP 6: Keyboard Simulation
├── Setup enigo library
├── Implement text typing function
├── Handle special characters
└── Test typing in various apps

STEP 7: Integration & Polish
├── Connect all components
├── Add loading/recording states
├── Handle errors gracefully
├── Test full flow end-to-end

STEP 8: Auto-start & Distribution
├── Configure auto-start with Windows
├── Build release version
├── Create installer
└── Test installation flow
```

### Phase 2: Enhancements (Future)

```
- Add transcription history (SQLite)
- Add settings panel
- Add language switching
- Add custom shortcuts
- Mac support
```

---

## API Reference

### SONIOX API

| Item | Value |
|------|-------|
| **WebSocket URL** | `wss://api.soniox.com/transcribe-websocket` |
| **Pricing** | ~$0.12/hour (real-time streaming) |
| **Sample Rate** | 16000 Hz |
| **Encoding** | LINEAR16 (16-bit PCM) |
| **Languages** | 60+ including Arabic |
| **Docs** | https://soniox.com/docs |

### Environment Variables

```env
# .env
SONIOX_API_KEY=your_api_key_here
```

---

## Future Roadmap

```
NOW ─────────────────────────────────────────────────────► FUTURE

Phase 1 (MVP)          Phase 2              Phase 3
│                      │                    │
├─ Basic recording     ├─ History           ├─ Cloud sync
├─ SONIOX streaming    ├─ Smart cleanup     ├─ User accounts
├─ Popup UI            ├─ Settings panel    ├─ Team features
├─ Type at cursor      ├─ Mac support       ├─ API integrations
├─ System tray         ├─ Multi-language    ├─ Mobile companion
└─ Auto-start          └─ Custom shortcuts  └─ Voice commands
```

---

## Quick Start Commands

Once we start building, these will be your main commands:

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build

# The built app will be in:
# src-tauri/target/release/localwispr.exe
```

---

## Ready to Build!

This document contains everything needed to build LocalWispr. The tech stack is proven (used by VoiceTypr, Handy, Tambourine Voice), and SONIOX provides excellent Arabic support.

**Next step:** Set up the project and start coding!

---

*Document created: December 2024*
*Version: 1.0*
