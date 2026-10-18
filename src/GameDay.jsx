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

function Diamond({ fieldAssignments, previousFieldAssignments, playersById, canEdit, onTapPosition, theme }) {
  return (
    <div className="relative w-full aspect-square max-h-[70vh] mx-auto rounded-xl overflow-hidden" style={{ backgroundColor: theme.field }}>
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
            className={`absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center rounded-xl px-2 py-1 shadow-lg min-w-[22%] max-w-[30%]
              ${changed ? theme.bubbleChanged : theme.bubble} ${canEdit ? 'active:scale-95 transition-transform' : ''}`}
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="text-xs sm:text-sm font-black leading-tight">{pos}{changed ? ' • NEW' : ''}</span>
            <span className="text-sm sm:text-lg lg:text-xl font-bold leading-tight truncate w-full text-center">
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
    <div className={`fixed inset-0 z-40 overflow-auto print:hidden ${theme.page}`}>
      <div className="p-3 sm:p-4 max-w-[1400px] mx-auto">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex-1 min-w-[180px]">
            <div className="text-xl sm:text-2xl font-black leading-tight">
              {gameInfo.opponent ? `vs ${gameInfo.opponent}` : teamName}
            </div>
            <div className={`text-sm font-semibold ${theme.muted}`}>
              {!online ? '⚠ OFFLINE — changes saved on this device' :
                syncStatus === 'saving' ? 'Saving…' : syncStatus === 'error' ? '⚠ Sync error' : '✓ Synced'}
              {!canEdit && ' · View only'}
            </div>
          </div>
          <button onClick={toggleTheme} className={`px-3 py-2 rounded-lg font-bold ${theme.buttonAlt}`}>
            {themeName === 'sun' ? '☾ Night' : '☀ Sun'}
          </button>
          {document.documentElement.requestFullscreen && (
            <button onClick={toggleFullscreen} className={`px-3 py-2 rounded-lg font-bold ${theme.buttonAlt}`}>⛶ Full</button>
          )}
          <button onClick={onClose} className={`px-4 py-2 rounded-lg font-bold ${theme.button}`}>Exit</button>
        </div>

        {/* Inning + outs */}
        <div className={`flex flex-wrap items-center gap-3 rounded-xl p-3 mb-3 ${theme.panel}`}>
          {canEdit && (
            <button disabled={inning <= 1} onClick={() => onChangeInning(inning - 1)}
              className={`w-14 h-14 rounded-lg text-3xl font-black disabled:opacity-30 ${theme.buttonAlt}`}>‹</button>
          )}
          <div className="text-center">
            <div className={`text-xs font-bold uppercase ${theme.muted}`}>Inning</div>
            <div className="text-5xl font-black leading-none">{inning}</div>
          </div>
          {canEdit && (
            <button disabled={inning >= maxInning} onClick={() => onChangeInning(inning + 1)}
              className={`h-14 px-4 rounded-lg text-xl font-black disabled:opacity-30 ${theme.button}`}>Next Inning ›</button>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <span className={`text-sm font-bold uppercase ${theme.muted}`}>Outs</span>
            {[1, 2].map((k) => (
              <button key={k} disabled={!canEdit} onClick={() => setOuts(k)}
                className={`w-12 h-12 rounded-full border-4 ${live.outs >= k ? 'bg-red-600 border-red-600' : 'border-current bg-transparent'}`}
                aria-label={`${k} out${k > 1 ? 's' : ''}`} />
            ))}
          </div>
        </div>

        {reentryViolations.messages.length > 0 && (
          <div className="mb-3 p-3 rounded-xl bg-red-600 text-white">
            <p className="font-black text-lg">Re-entry problem — fix before advancing:</p>
            <ul className="list-disc list-inside font-semibold">
              {reentryViolations.messages.map((v, i) => <li key={i}>{v}</li>)}
            </ul>
            <button onClick={onForceInning} className="mt-2 px-3 py-2 rounded-lg bg-white text-red-700 font-bold">Proceed Anyway</button>
          </div>
        )}

        <div className="grid gap-3 landscape:lg:grid-cols-2 landscape:md:grid-cols-2">
          {/* Left: diamond + pitcher */}
          <div className="space-y-3">
            <Diamond
              fieldAssignments={data.fieldAssignments}
              previousFieldAssignments={prevData?.fieldAssignments}
              playersById={playersById}
              canEdit={canEdit}
              onTapPosition={setPickerPosition}
              theme={theme}
            />
            <div className={`rounded-xl p-3 ${theme.panel}`}>
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-bold uppercase ${theme.muted}`}>Pitcher · pitch count</div>
                  <div className="text-2xl font-black truncate">{pitcher?.name || 'No pitcher set'}</div>
                </div>
                {canEdit && (
                  <button onClick={() => setPitches(-1)} disabled={!pitcher}
                    className={`w-14 h-14 rounded-lg text-3xl font-black disabled:opacity-30 ${theme.buttonAlt}`}>−</button>
                )}
                <div className="text-5xl font-black w-20 text-center tabular-nums">{pitchCount}</div>
                {canEdit && (
                  <button onClick={() => setPitches(1)} disabled={!pitcher}
                    className={`w-20 h-14 rounded-lg text-3xl font-black disabled:opacity-30 ${theme.button}`}>+1</button>
                )}
              </div>
              {otherPitchers.length > 0 && (
                <div className={`mt-2 text-sm font-semibold ${theme.muted}`}>
                  Earlier: {otherPitchers.map(([id, c]) => `${playersById[id]?.name || 'Player'} ${c}`).join(' · ')}
                </div>
              )}
            </div>
          </div>

          {/* Right: batter tracker + lineup */}
          <div className="space-y-3">
            <div className={`rounded-xl p-3 ${theme.panel}`}>
              <div className="grid grid-cols-3 gap-2">
                {['At Bat', 'On Deck', 'In the Hole'].map((label, k) => {
                  const p = upcoming[k]
                  return (
                    <div key={label} className={`rounded-lg p-2 border-2 ${k === 0 ? theme.highlight : theme.row}`}>
                      <div className="text-xs font-bold uppercase">{label}</div>
                      <div className={`${k === 0 ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'} font-black leading-tight break-words`}>
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
                    className={`h-14 px-5 rounded-lg text-xl font-black ${theme.buttonAlt}`}>‹ Back</button>
                  <button onClick={() => onUpdateLive({ batterIndex: batterIndex + 1 })}
                    className={`h-14 flex-1 rounded-lg text-xl font-black ${theme.button}`}>Next Batter ›</button>
                </div>
              )}
            </div>

            <div className={`rounded-xl p-2 ${theme.panel}`}>
              <div className="flex items-baseline justify-between px-1 pb-1">
                <span className="font-black text-lg">Batting Order</span>
                {canEdit && <span className={`text-xs font-semibold ${theme.muted}`}>Tap a hitter to substitute or set who's up</span>}
              </div>
              <div className="space-y-1">
                {battingOrder.map((p, idx) => {
                  const isUp = idx === batterIndex
                  const changed = prevData && prevData.battingOrder[idx]?.id !== p.id
                  return (
                    <div key={p.id} className={`flex items-center gap-2 rounded-lg border-2 px-2 py-2 ${isUp ? theme.highlight : theme.row}`}>
                      <button disabled={!canEdit} onClick={() => onUpdateLive({ batterIndex: idx })}
                        className="w-9 h-9 shrink-0 rounded-full border-2 border-current text-lg font-black"
                        aria-label={`Set ${p.name} as current batter`}>
                        {idx + 1}
                      </button>
                      <button disabled={!canEdit} onClick={() => onSwapClick(p)} className="flex-1 min-w-0 text-left">
                        <span className="text-lg sm:text-xl font-bold truncate block">
                          {p.name}
                          {changed && <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-green-600 text-white align-middle">IN</span>}
                        </span>
                      </button>
                      <span className={`text-sm font-bold ${isUp ? '' : theme.muted}`}>#{p.jersey}</span>
                      <span className="w-11 text-center text-lg font-black">{positionOf(p.id) || 'EH'}</span>
                    </div>
                  )
                })}
              </div>
              {data.subs.some((s) => s.name && s.name.trim()) && (
                <div className={`mt-2 px-1 text-sm font-semibold ${theme.muted}`}>
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
