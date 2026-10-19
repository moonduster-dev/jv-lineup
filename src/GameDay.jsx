import { useState, useEffect } from 'react'

// Diamond coordinates (% of a square field) for each position bubble
const DIAMOND_SPOTS = {
  LF: [16, 20], CF: [50, 9], RF: [84, 20],
  SS: [33, 41], '2B': [67, 41],
  '3B': [16, 61], P: [50, 59], '1B': [84, 61],
  C: [50, 89],
}

// Two high-contrast themes: "sun" (light, best outdoors) and "night" (dark, under lights)
const THEMES = {
  sun: {
    page: 'bg-white text-black',
    panel: 'bg-gray-100 border-2 border-black',
    muted: 'text-gray-700',
    field: '#15803d',
    infield: '#d6a76b',
    bubble: 'bg-white text-black border-[3px] border-black',
    bubbleChanged: 'bg-yellow-300 text-black border-[3px] border-black',
    button: 'bg-black text-white active:bg-gray-700',
    buttonAlt: 'bg-white text-black border-2 border-black active:bg-gray-200',
    highlight: 'bg-yellow-300 border-black',
    row: 'bg-white border-black',
  },
  night: {
    page: 'bg-gray-950 text-white',
    panel: 'bg-gray-900 border-2 border-gray-600',
    muted: 'text-gray-300',
    field: '#14532d',
    infield: '#7c5a33',
    bubble: 'bg-gray-950 text-amber-300 border-[3px] border-amber-300',
    bubbleChanged: 'bg-amber-300 text-black border-[3px] border-white',
    button: 'bg-amber-400 text-black active:bg-amber-300',
    buttonAlt: 'bg-gray-800 text-white border-2 border-gray-500 active:bg-gray-700',
    highlight: 'bg-amber-400 text-black border-white',
    row: 'bg-gray-900 border-gray-600',
  },
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

// Keep the screen awake while the Game Day view is open (tablet on the fence)
function useWakeLock() {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let lock = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) lock.release()
      } catch (err) {
        console.warn('Wake lock unavailable:', err.message)
      }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') request() }
    request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release()
    }
  }, [])
}

function PlayerPicker({ position, players, fieldAssignments, onPick, onClose, theme }) {
  const positionOf = (playerId) => Object.entries(fieldAssignments).find(([, pid]) => pid === playerId)?.[0]
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={onClose}>
      <div className={`${theme.page} rounded-xl p-4 w-full max-w-xl max-h-[90vh] overflow-auto shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-black">Who plays {position}?</h2>
          <button onClick={onClose} className={`px-4 py-2 rounded-lg text-lg font-bold ${theme.buttonAlt}`}>Cancel</button>
        </div>
        <p className={`text-sm mb-3 ${theme.muted}`}>Picking someone already on the field swaps the two players.</p>
        <div className="grid grid-cols-2 gap-2">
          {players.map((p) => {
            const pos = positionOf(p.id)
            const isHere = pos === position
            return (
              <button
                key={p.id}
                onClick={() => onPick(p.id)}
                className={`flex items-center justify-between gap-2 px-3 py-4 rounded-lg border-2 text-left text-lg font-bold ${isHere ? theme.highlight : theme.row}`}
              >
                <span className="truncate">
                  {p.jersey && <span className={`mr-1 ${isHere ? '' : theme.muted}`}>#{p.jersey}</span>}
                  {p.name}
                </span>
                <span className="text-sm font-black shrink-0">{pos || 'BENCH'}</span>
              </button>
            )
          })}
        </div>
        <button onClick={() => onPick(null)} className={`mt-3 w-full py-3 rounded-lg text-lg font-bold ${theme.buttonAlt}`}>
          Leave {position} empty
        </button>
      </div>
    </div>
  )
}

// Fills the largest square that fits its parent, which must be a size container
// (containerType: 'size'); text scales with the square via cqmin units
function Diamond({ fieldAssignments, previousFieldAssignments, playersById, canEdit, onTapPosition, theme }) {
  return (
    <div className="relative shrink-0 rounded-xl overflow-hidden"
      style={{ width: '100cqmin', height: '100cqmin', backgroundColor: theme.field }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" aria-hidden="true">
        <polygon points="50,89 79,62 50,35 21,62" fill={theme.infield} stroke="white" strokeWidth="0.8" />
        <line x1="50" y1="89" x2="0" y2="39" stroke="white" strokeWidth="0.6" />
        <line x1="50" y1="89" x2="100" y2="39" stroke="white" strokeWidth="0.6" />
      </svg>
      {Object.entries(DIAMOND_SPOTS).map(([pos, [x, y]]) => {
        const pid = fieldAssignments[pos]
        const player = pid != null ? playersById[pid] : null
        const changed = previousFieldAssignments && previousFieldAssignments[pos] !== pid
        return (
          <button
            key={pos}
            disabled={!canEdit}
            onClick={() => onTapPosition(pos)}
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center rounded-xl px-2 py-1 shadow-lg min-w-[22%] max-w-[32%]
              ${changed ? theme.bubbleChanged : theme.bubble} ${canEdit ? 'active:scale-95 transition-transform' : ''}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="font-black leading-tight" style={{ fontSize: 'clamp(11px, 2.6cqmin, 17px)' }}>{pos}{changed ? ' • NEW' : ''}</span>
            <span className="font-bold leading-tight truncate w-full text-center" style={{ fontSize: 'clamp(13px, 3.4cqmin, 23px)' }}>
              {player?.name || '—'}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default function GameDay({
  teamName, gameInfo, gameData, inning, live, canEdit, syncStatus, reentryViolations,
  onClose, onUpdateLive, onChangeInning, onForceInning, onAssignPosition, onSwapClick,
}) {
  const [themeName, setThemeName] = useState(() => {
    try { return localStorage.getItem('gameDayTheme') || 'sun' } catch { return 'sun' }
  })
  const [pickerPosition, setPickerPosition] = useState(null)
  const online = useOnline()
  useWakeLock()

  // While Game Day is open, freeze the page underneath so its scroll bounce
  // can't trigger browser gestures either
  useEffect(() => {
    const html = document.documentElement
    const prev = [html.style.overscrollBehavior, document.body.style.overflow]
    html.style.overscrollBehavior = 'none'
    document.body.style.overflow = 'hidden'
    return () => {
      html.style.overscrollBehavior = prev[0]
      document.body.style.overflow = prev[1]
    }
  }, [])

  // Launched from the home screen there are no browser bars, so no Full button needed
  const isInstalled = window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone

  const theme = THEMES[themeName]
  const toggleTheme = () => {
    const next = themeName === 'sun' ? 'night' : 'sun'
    setThemeName(next)
    try { localStorage.setItem('gameDayTheme', next) } catch { /* storage blocked */ }
  }

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const data = gameData[inning] || gameData[1]
  const prevData = inning > 1 ? gameData[inning - 1] : null
  const battingOrder = data.battingOrder
  const namedPlayers = [...data.battingOrder, ...data.subs].filter((p) => p.name && p.name.trim())
  const playersById = Object.fromEntries([...data.battingOrder, ...data.subs].map((p) => [p.id, p]))
  const positionOf = (playerId) => Object.entries(data.fieldAssignments).find(([, pid]) => pid === playerId)?.[0]

  const n = battingOrder.length || 1
  const batterIndex = ((live.batterIndex % n) + n) % n
  const upcoming = [0, 1, 2].map((k) => battingOrder[(batterIndex + k) % n])

  const pitcherId = data.fieldAssignments.P
  const pitcher = pitcherId != null ? playersById[pitcherId] : null
  const pitches = live.pitches || {}
  const pitchCount = pitcherId != null ? pitches[pitcherId] || 0 : 0
  const otherPitchers = Object.entries(pitches).filter(([id, c]) => c > 0 && Number(id) !== pitcherId)

  const setPitches = (delta) => {
    if (pitcherId == null) return
    onUpdateLive({ pitches: { ...pitches, [pitcherId]: Math.max(0, pitchCount + delta) } })
  }
  const setOuts = (k) => onUpdateLive({ outs: live.outs === k ? k - 1 : k })
  const maxInning = Math.min(gameInfo.innings || 7, 7)

  return (
    // overscroll-none keeps scroll bounce from reaching the browser's own gestures
    // (pull-to-refresh, Safari's swipe-down-to-exit-fullscreen).
    // fit: = landscape tablet — everything sized to one screen, no scrolling.
    <div className={`fixed inset-0 z-40 overflow-auto fit:overflow-hidden overscroll-none print:hidden ${theme.page}`}
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="p-2 sm:p-3 max-w-[1400px] mx-auto flex flex-col gap-2 fit:h-full">
        {/* Header: game, inning, outs, controls */}
        <div className={`shrink-0 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-3 py-2 ${theme.panel}`}>
          <div className="min-w-0 mr-auto">
            <div className="text-xl font-black leading-tight truncate">
              {gameInfo.opponent ? `vs ${gameInfo.opponent}` : teamName}
            </div>
            <div className={`text-xs font-semibold ${theme.muted}`}>
              {!online ? '⚠ OFFLINE — changes saved on this device' :
                syncStatus === 'saving' ? 'Saving…' : syncStatus === 'error' ? '⚠ Sync error' : '✓ Synced'}
              {!canEdit && ' · View only'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button disabled={inning <= 1} onClick={() => onChangeInning(inning - 1)}
                className={`w-12 h-12 rounded-lg text-3xl font-black disabled:opacity-30 ${theme.buttonAlt}`}
                aria-label="Previous inning">‹</button>
            )}
            <div className="text-center px-1">
              <div className={`text-[10px] font-bold uppercase leading-none ${theme.muted}`}>Inning</div>
              <div className="text-4xl font-black leading-none">{inning}</div>
            </div>
            {canEdit && (
              <button disabled={inning >= maxInning} onClick={() => onChangeInning(inning + 1)}
                className={`h-12 px-4 rounded-lg text-lg font-black disabled:opacity-30 ${theme.button}`}>Next Inning ›</button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold uppercase ${theme.muted}`}>Outs</span>
            {[1, 2].map((k) => (
              <button key={k} disabled={!canEdit} onClick={() => setOuts(k)}
                className={`w-10 h-10 rounded-full border-4 ${live.outs >= k ? 'bg-red-600 border-red-600' : 'border-current bg-transparent'}`}
                aria-label={`${k} out${k > 1 ? 's' : ''}`} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className={`h-12 px-3 rounded-lg font-bold ${theme.buttonAlt}`}>
              {themeName === 'sun' ? '☾ Night' : '☀ Sun'}
            </button>
            {!isInstalled && document.documentElement.requestFullscreen && (
              <button onClick={toggleFullscreen} className={`h-12 px-3 rounded-lg font-bold ${theme.buttonAlt}`}>⛶ Full</button>
            )}
            <button onClick={onClose} className={`h-12 px-4 rounded-lg font-bold ${theme.button}`}>Exit</button>
          </div>
        </div>

        {reentryViolations.messages.length > 0 && (
          <div className="shrink-0 p-3 rounded-xl bg-red-600 text-white">
            <p className="font-black text-lg">Re-entry problem — fix before advancing:</p>
            <ul className="list-disc list-inside font-semibold">
              {reentryViolations.messages.map((v, i) => <li key={i}>{v}</li>)}
            </ul>
            <button onClick={onForceInning} className="mt-2 px-3 py-2 rounded-lg bg-white text-red-700 font-bold">Proceed Anyway</button>
          </div>
        )}

        <div className="grid gap-2 fit:flex-1 fit:min-h-0 fit:grid-cols-2 fit:grid-rows-[minmax(0,1fr)]">
          {/* Left: diamond + pitcher */}
          <div className="flex flex-col gap-2 min-h-0">
            {/* Size container: the diamond takes the largest square that fits */}
            <div className="aspect-square fit:aspect-auto fit:flex-1 fit:min-h-0 flex items-center justify-center"
              style={{ containerType: 'size' }}>
              <Diamond
                fieldAssignments={data.fieldAssignments}
                previousFieldAssignments={prevData?.fieldAssignments}
                playersById={playersById}
                canEdit={canEdit}
                onTapPosition={setPickerPosition}
                theme={theme}
              />
            </div>
            <div className={`shrink-0 rounded-xl px-3 py-2 ${theme.panel}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-bold uppercase ${theme.muted}`}>Pitcher · pitch count</div>
                  <div className="text-xl font-black truncate">{pitcher?.name || 'No pitcher set'}</div>
                  {otherPitchers.length > 0 && (
                    <div className={`text-xs font-semibold truncate ${theme.muted}`}>
                      Earlier: {otherPitchers.map(([id, c]) => `${playersById[id]?.name || 'Player'} ${c}`).join(' · ')}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <button onClick={() => setPitches(-1)} disabled={!pitcher}
                    className={`w-12 h-12 rounded-lg text-3xl font-black disabled:opacity-30 ${theme.buttonAlt}`}>−</button>
                )}
                <div className="text-4xl font-black w-16 text-center tabular-nums">{pitchCount}</div>
                {canEdit && (
                  <button onClick={() => setPitches(1)} disabled={!pitcher}
                    className={`w-16 h-12 rounded-lg text-2xl font-black disabled:opacity-30 ${theme.button}`}>+1</button>
                )}
              </div>
            </div>
          </div>

          {/* Right: batter tracker + lineup */}
          <div className="flex flex-col gap-2 min-h-0">
            <div className={`shrink-0 rounded-xl p-2 ${theme.panel}`}>
              <div className="grid grid-cols-3 gap-2">
                {['At Bat', 'On Deck', 'In the Hole'].map((label, k) => {
                  const p = upcoming[k]
                  return (
                    <div key={label} className={`min-w-0 rounded-lg px-2 py-1 border-2 ${k === 0 ? theme.highlight : theme.row}`}>
                      <div className="text-xs font-bold uppercase">{label}</div>
                      <div className={`${k === 0 ? 'text-2xl line-clamp-2 break-words' : 'text-lg truncate'} font-black leading-tight`}>
                        {p?.name || '—'}
                      </div>
                      {p && <div className="text-sm font-bold">#{p.jersey} · {positionOf(p.id) || 'EH'}</div>}
                    </div>
                  )
                })}
              </div>
              {canEdit && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onUpdateLive({ batterIndex: batterIndex - 1 })}
                    className={`h-12 px-5 rounded-lg text-lg font-black ${theme.buttonAlt}`}>‹ Back</button>
                  <button onClick={() => onUpdateLive({ batterIndex: batterIndex + 1 })}
                    className={`h-12 flex-1 rounded-lg text-xl font-black ${theme.button}`}>Next Batter ›</button>
                </div>
              )}
            </div>

            <div className={`rounded-xl p-2 flex flex-col fit:flex-1 fit:min-h-0 ${theme.panel}`}>
              <div className="shrink-0 flex items-baseline justify-between px-1 pb-1">
                <span className="font-black text-lg">Batting Order</span>
                {canEdit && <span className={`text-xs font-semibold ${theme.muted}`}>Tap a name to sub · tap a number to set who's up</span>}
              </div>
              {/* Rows stretch to fill the panel on a landscape tablet */}
              <div className="flex flex-col gap-1 fit:flex-1 fit:min-h-0 fit:overflow-auto">
                {battingOrder.map((p, idx) => {
                  const isUp = idx === batterIndex
                  const changed = prevData && prevData.battingOrder[idx]?.id !== p.id
                  return (
                    <div key={p.id} className={`flex items-center gap-2 rounded-lg border-2 px-2 py-1 min-h-11 fit:flex-1 fit:min-h-9 ${isUp ? theme.highlight : theme.row}`}>
                      <button disabled={!canEdit} onClick={() => onUpdateLive({ batterIndex: idx })}
                        className="w-8 h-8 shrink-0 rounded-full border-2 border-current text-base font-black"
                        aria-label={`Set ${p.name} as current batter`}>
                        {idx + 1}
                      </button>
                      <button disabled={!canEdit} onClick={() => onSwapClick(p)} className="flex-1 min-w-0 text-left self-stretch">
                        <span className="text-lg font-bold truncate block">
                          {p.name}
                          {changed && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-600 text-white align-middle">IN</span>}
                        </span>
                      </button>
                      <span className={`text-sm font-bold ${isUp ? '' : theme.muted}`}>#{p.jersey}</span>
                      <span className="w-10 text-center text-lg font-black">{positionOf(p.id) || 'EH'}</span>
                    </div>
                  )
                })}
              </div>
              {data.subs.some((s) => s.name && s.name.trim()) && (
                <div className={`shrink-0 mt-1 px-1 text-xs font-semibold truncate ${theme.muted}`}>
                  Bench: {data.subs.filter((s) => s.name && s.name.trim()).map((s) => s.name + (positionOf(s.id) ? ` (${positionOf(s.id)})` : '')).join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {pickerPosition && (
        <PlayerPicker
          position={pickerPosition}
          players={namedPlayers}
          fieldAssignments={data.fieldAssignments}
          theme={theme}
          onClose={() => setPickerPosition(null)}
          onPick={(playerId) => { onAssignPosition(pickerPosition, playerId); setPickerPosition(null) }}
        />
      )}
    </div>
  )
}
