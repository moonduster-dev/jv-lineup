import { useState, useEffect } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { db, auth } from './firebase'
import { doc, setDoc, onSnapshot, collection, deleteDoc } from 'firebase/firestore'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'

const TEAM_NAME = 'Our Lady of Good Counsel 2026 JV Softball'
const FIELD_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
const INNINGS = [1, 2, 3, 4, 5, 6, 7]

const createDefaultRoster = () => ({
  players: [
    { id: 1, name: 'Player 1', jersey: '1' },
    { id: 2, name: 'Player 2', jersey: '2' },
    { id: 3, name: 'Player 3', jersey: '3' },
    { id: 4, name: 'Player 4', jersey: '4' },
    { id: 5, name: 'Player 5', jersey: '5' },
    { id: 6, name: 'Player 6', jersey: '6' },
    { id: 7, name: 'Player 7', jersey: '7' },
    { id: 8, name: 'Player 8', jersey: '8' },
    { id: 9, name: 'Player 9', jersey: '9' },
  ],
  subs: [
    { id: 10, name: 'Sub 1', jersey: '10' },
    { id: 11, name: 'Sub 2', jersey: '11' },
    { id: 12, name: 'Sub 3', jersey: '12' },
    { id: 13, name: 'Sub 4', jersey: '13' },
    { id: 14, name: 'Sub 5', jersey: '14' },
  ]
})


// Re-entry tracking (NFHS rule: any player may re-enter once, must return to same batting slot):
// - starters: Set of player IDs who started the game
// - originalSlots: Maps player ID to their first batting slot (starters set at game start, subs set when first entering)
// - reentryCount: Maps player ID to number of times they've re-entered (max 1 for anyone)
// - subsRemovedFromBatting: Set of sub IDs who were in batting order and got subbed out (eligible for one re-entry)
const createInningData = (battingOrder, subs, fieldAssignments, originalSlots = null, starters = null, reentryCount = null, subsRemovedFromBatting = null) => ({
  battingOrder: battingOrder.map(p => ({ ...p })),
  subs: subs.map(p => ({ ...p })),
  fieldAssignments: { ...fieldAssignments },
  originalSlots: originalSlots ? { ...originalSlots } : null,
  starters: starters ? [...starters] : null,
  reentryCount: reentryCount ? { ...reentryCount } : {},
  subsRemovedFromBatting: subsRemovedFromBatting ? [...subsRemovedFromBatting] : [],
})

const createInitialFieldAssignments = () => {
  const assignments = {}
  FIELD_POSITIONS.forEach((pos, i) => {
    assignments[pos] = i + 1
  })
  return assignments
}

const createInitialGameData = (roster) => {
  const initialBattingOrder = roster.players.map(p => ({ ...p }))
  const initialSubs = roster.subs.map(p => ({ ...p }))
  const initialFieldAssignments = createInitialFieldAssignments()

  const initialOriginalSlots = {}
  const initialStarters = []
  initialBattingOrder.forEach((p, index) => {
    initialOriginalSlots[p.id] = index + 1
    initialStarters.push(p.id)
  })

  return {
    1: createInningData(initialBattingOrder, initialSubs, initialFieldAssignments, initialOriginalSlots, initialStarters, {}, [])
  }
}

// Login Modal Component
function PasswordModal({ isOpen, onClose, onSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
      onSuccess()
      setEmail('')
      setPassword('')
    } catch {
      setError('Incorrect email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Login to Edit</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }}
              placeholder="Enter email"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
            />
            {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Roster Management Modal
function RosterModal({ isOpen, onClose, roster, onSave }) {
  const [players, setPlayers] = useState(roster.players)
  const [subs, setSubs] = useState(roster.subs)

  useEffect(() => {
    setPlayers(roster.players)
    setSubs(roster.subs)
  }, [roster])

  if (!isOpen) return null

  const handlePlayerChange = (id, field, value) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleSubChange = (id, field, value) => {
    setSubs(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const handleSave = () => {
    onSave({ players, subs })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Manage Roster</h3>
          <p className="text-sm text-gray-500">Configure player names for new games</p>
        </div>

        <div className="p-4">
          <h4 className="font-medium text-gray-800 mb-2">Starting Players (9)</h4>
          <div className="space-y-2 mb-4">
            {players.map((player) => (
              <div key={player.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={player.jersey || ''}
                  onChange={(e) => handlePlayerChange(player.id, 'jersey', e.target.value)}
                  className="w-12 px-2 py-1 border border-gray-300 rounded text-gray-800 text-center"
                  placeholder="#"
                />
                <input
                  type="text"
                  value={player.name}
                  onChange={(e) => handlePlayerChange(player.id, 'name', e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-gray-800"
                  placeholder="Player name"
                />
              </div>
            ))}
          </div>

          <h4 className="font-medium text-gray-800 mb-2">Substitutes (5)</h4>
          <div className="space-y-2">
            {subs.map((sub) => (
              <div key={sub.id} className="flex items-center gap-2">
                <input
                  type="text"
                  value={sub.jersey || ''}
                  onChange={(e) => handleSubChange(sub.id, 'jersey', e.target.value)}
                  className="w-12 px-2 py-1 border border-gray-300 rounded text-gray-800 text-center"
                  placeholder="#"
                />
                <input
                  type="text"
                  value={sub.name}
                  onChange={(e) => handleSubChange(sub.id, 'name', e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-gray-800"
                  placeholder="Sub name"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            Save Roster
          </button>
        </div>
      </div>
    </div>
  )
}

function InningTabs({ currentInning, setCurrentInning }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-4 p-2 rounded-lg" style={{ backgroundColor: '#1e3a5f' }}>
      {INNINGS.map(inning => (
        <button
          key={inning}
          onClick={() => setCurrentInning(inning)}
          className={`px-4 py-2 rounded-md font-bold transition-colors min-w-[48px] shadow
            ${currentInning === inning
              ? 'bg-amber-400 text-gray-900'
              : 'bg-white/90 hover:bg-white'
            }`}
          style={{ color: currentInning === inning ? undefined : '#1e3a5f' }}
        >
          {inning}
        </button>
      ))}
    </div>
  )
}

function SwapModal({ isOpen, onClose, currentPlayer, battingOrder, subs, originalSlots, starters, reentryCount, subsRemovedFromBatting, onSwap, currentInning }) {
  if (!isOpen || !currentPlayer) return null

  const currentIndex = battingOrder.findIndex(p => p.id === currentPlayer.id)
  const isInBattingOrder = currentIndex !== -1
  const startersList = starters || []
  const reentryCountMap = reentryCount || {}
  const subsRemoved = subsRemovedFromBatting || []

  // Check if a player can enter a specific batting slot
  // NFHS Rule 3-3-5: any player may re-enter once, must return to same batting order position.
  // Re-entry rules do not apply in the 1st inning — all swaps are free.
  const canPlayerEnterSlot = (playerId, slot) => {
    // No restrictions in inning 1
    if (currentInning === 1) {
      return { canSwap: true, reason: null }
    }

    const isStarter = startersList.includes(playerId)
    const wasInBattingOrder = subsRemoved.includes(playerId) // sub who entered and was later removed
    const playerOriginalSlot = originalSlots[playerId]
    const timesReentered = reentryCountMap[playerId] || 0

    // Fresh sub: not a starter, never entered the batting order — no restrictions
    if (!isStarter && !wasInBattingOrder) {
      return { canSwap: true, reason: null }
    }

    // Has been in batting order (as starter or sub who entered) — re-entry rules apply
    if (timesReentered >= 1) {
      return { canSwap: false, reason: 'Already re-entered once' }
    }
    if (playerOriginalSlot && playerOriginalSlot !== slot) {
      return { canSwap: false, reason: `Must enter slot #${playerOriginalSlot}` }
    }
    return { canSwap: true, reason: null }
  }

  const getValidSwapOptions = () => {
    if (isInBattingOrder) {
      // Player in batting order wants to swap out - show available subs
      const slot = currentIndex + 1
      return subs.map(sub => {
        const { canSwap, reason } = canPlayerEnterSlot(sub.id, slot)
        return { player: sub, slot, canSwap, reason }
      })
    } else {
      // Player on bench wants to swap in - show batting order slots they can enter
      return battingOrder.map((player, index) => {
        const slot = index + 1
        const { canSwap, reason } = canPlayerEnterSlot(currentPlayer.id, slot)
        return { player, slot, canSwap, reason }
      })
    }
  }

  const swapOptions = getValidSwapOptions()
  const validOptions = swapOptions.filter(opt => opt.canSwap)
  const invalidOptions = swapOptions.filter(opt => !opt.canSwap)

  // Determine player status for display
  const getPlayerStatus = () => {
    const isStarter = startersList.includes(currentPlayer.id)
    const timesReentered = reentryCountMap[currentPlayer.id] || 0
    const wasSubRemovedFromBatting = subsRemoved.includes(currentPlayer.id)

    if (isInBattingOrder) {
      return `Currently batting #${currentIndex + 1}`
    }
    const wasInBattingOrder = subsRemoved.includes(currentPlayer.id)
    const playerOriginalSlot = originalSlots[currentPlayer.id]
    // Fresh sub — never been in the batting order
    if (!isStarter && !wasInBattingOrder) {
      return 'Sub - available to enter any slot'
    }
    const label = isStarter ? 'Starter' : 'Sub'
    if (timesReentered >= 1) return `${label} - already used re-entry`
    return `${label} - can re-enter slot #${playerOriginalSlot}`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Swap {currentPlayer.name}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {getPlayerStatus()}
          </p>
        </div>
        <div className="p-2 overflow-y-auto flex-1">
          {validOptions.length > 0 && (
            <>
              <p className="px-2 py-1 text-xs font-semibold text-gray-500 uppercase">
                {isInBattingOrder ? 'Replace with' : 'Can swap into'}
              </p>
              {validOptions.map(({ player, slot }) => (
                <button
                  key={player.id}
                  onClick={() => onSwap(currentPlayer, player, 'substitute')}
                  className="w-full text-left px-4 py-3 hover:bg-blue-50 rounded-md transition-colors text-gray-700 font-medium flex justify-between items-center"
                >
                  <span>{player.name}</span>
                  {!isInBattingOrder && <span className="text-xs text-gray-400">#{slot}</span>}
                </button>
              ))}
            </>
          )}
          {invalidOptions.length > 0 && (
            <>
              <p className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase mt-2">
                Cannot swap (re-entry rule)
              </p>
              {invalidOptions.map(({ player, slot, reason }) => (
                <div
                  key={player.id}
                  className="w-full text-left px-4 py-3 text-gray-400 font-medium flex justify-between items-center"
                >
                  <div>
                    <span>{player.name}</span>
                    {reason && <span className="text-xs block text-gray-400">{reason}</span>}
                  </div>
                  {!isInBattingOrder && <span className="text-xs">#{slot}</span>}
                </div>
              ))}
            </>
          )}
          {validOptions.length === 0 && (
            <p className="px-4 py-3 text-gray-500 text-sm">
              No valid swap options available due to re-entry rule.
            </p>
          )}
        </div>
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function GameSummaryModal({ isOpen, onClose, gameData, gameInfo, roster }) {
  if (!isOpen) return null

  const allRosterPlayers = roster ? [...roster.players, ...roster.subs] : []
  const getJersey = (player) => {
    if (player.jersey) return player.jersey
    const found = allRosterPlayers.find(p => p.id === player.id)
    return found ? found.jersey : null
  }

  const getPlayerPosition = (inningData, playerId) => {
    if (!inningData) return null
    const entry = Object.entries(inningData.fieldAssignments)
      .find(([, pid]) => pid === playerId)
    return entry ? entry[0] : null
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExport = () => {
    let csv = `${TEAM_NAME}\nGame: vs ${gameInfo.opponent} - ${gameInfo.date}\n\n`
    csv += 'Slot,' + INNINGS.map(i => `Inning ${i}`).join(',') + '\n'

    for (let slot = 1; slot <= 9; slot++) {
      const row = [slot]
      INNINGS.forEach(inning => {
        const inningData = gameData[inning]
        if (inningData && inningData.battingOrder[slot - 1]) {
          const player = inningData.battingOrder[slot - 1]
          const pos = getPlayerPosition(inningData, player.id) || 'EH'
          row.push(`${player.name} (${pos})`)
        } else {
          row.push('-')
        }
      })
      csv += row.join(',') + '\n'
    }

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lineup-${gameInfo.opponent}-${gameInfo.date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-auto print:max-w-none print:max-h-none print:shadow-none">
        <div className="flex items-center gap-3 p-4 border-b border-gray-200 print:border-b-2">
          <img src="/GClogo.jpg" alt="GC Logo" className="w-12 h-12 object-contain print:w-16 print:h-16" />
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">{TEAM_NAME}</h3>
            <p className="text-sm text-gray-600">vs {gameInfo.opponent} - {gameInfo.date}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handleExport}
              className="px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
            >
              Export CSV
            </button>
            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-2 text-left font-semibold">Slot</th>
                {INNINGS.map(inning => (
                  <th key={inning} className="border border-gray-300 px-2 py-2 text-center font-semibold">
                    Inn {inning}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(slot => (
                <tr key={slot} className={slot % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="border border-gray-300 px-2 py-2 font-bold text-center">{slot}</td>
                  {INNINGS.map(inning => {
                    const inningData = gameData[inning]
                    if (!inningData || !inningData.battingOrder[slot - 1]) {
                      return <td key={inning} className="border border-gray-300 px-2 py-2 text-center text-gray-400">-</td>
                    }
                    const player = inningData.battingOrder[slot - 1]
                    const pos = getPlayerPosition(inningData, player.id)
                    return (
                      <td key={inning} className="border border-gray-300 px-2 py-2">
                        <div className="text-center">
                          <div className="font-medium">
                            {getJersey(player) && <span className="text-gray-500 text-xs mr-1">#{getJersey(player)}</span>}
                            {player.name}
                          </div>
                          <span className={`inline-block px-1 py-0.5 rounded text-xs font-bold mt-1
                            ${pos ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
                          `}>
                            {pos || 'EH'}
                          </span>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SaveGameModal({ isOpen, onClose, onSave, initialOpponent, initialDate, initialInnings }) {
  const [opponent, setOpponent] = useState(initialOpponent)
  const [date, setDate] = useState(initialDate)
  const [innings, setInnings] = useState(initialInnings || 7)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Save Game</h3>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Opponent</label>
            <input
              type="text"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="Team name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Innings Played</label>
            <select
              value={innings}
              onChange={(e) => setInnings(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
            >
              {[1,2,3,4,5,6,7].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(opponent, date, innings)}
            disabled={!opponent || !date}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// Calculate metrics for a single game, including all roster players
function calculateGameMetrics(game, roster) {
  const playerStats = {}
  const gameInnings = game.innings || 7

  // Initialize all roster players with zero stats
  if (roster) {
    [...roster.players, ...roster.subs].forEach(player => {
      playerStats[player.name] = { batting: 0, field: 0, total: 0 }
    })
  }

  for (let inning = 1; inning <= gameInnings; inning++) {
    const inningData = game.gameData[inning]
    if (!inningData) continue

    inningData.battingOrder.forEach(player => {
      if (!playerStats[player.name]) {
        playerStats[player.name] = { batting: 0, field: 0, total: 0 }
      }
      playerStats[player.name].batting++
      playerStats[player.name].total++
    })

    Object.values(inningData.fieldAssignments).forEach(playerId => {
      if (playerId == null) return
      const allPlayers = [...inningData.battingOrder, ...inningData.subs]
      const player = allPlayers.find(p => p.id === playerId)
      if (player) {
        if (!playerStats[player.name]) {
          playerStats[player.name] = { batting: 0, field: 0, total: 0 }
        }
        playerStats[player.name].field++
        const inBattingOrder = inningData.battingOrder.some(p => p.id === playerId)
        if (!inBattingOrder) {
          playerStats[player.name].total++
        }
      }
    })
  }

  return Object.entries(playerStats)
    .map(([name, stats]) => ({
      name,
      ...stats,
      percentage: ((stats.total / gameInnings) * 100).toFixed(1)
    }))
    .sort((a, b) => b.total - a.total)
}

function MetricsModal({ isOpen, onClose, savedGames, currentGameData, currentGameInfo, roster }) {
  const [viewMode, setViewMode] = useState('season')
  const [selectedGameId, setSelectedGameId] = useState(null)

  if (!isOpen) return null

  const calculateSeasonMetrics = () => {
    const playerStats = {}

    // Initialize all roster players with zero stats
    if (roster) {
      [...roster.players, ...roster.subs].forEach(player => {
        playerStats[player.name] = { batting: 0, field: 0, total: 0 }
      })
    }

    let maxPossibleInnings = 0
    savedGames.forEach(game => {
      const gameInnings = game.innings || 7
      maxPossibleInnings += gameInnings
      for (let inning = 1; inning <= gameInnings; inning++) {
        const inningData = game.gameData[inning]
        if (!inningData) continue

        inningData.battingOrder.forEach(player => {
          if (!playerStats[player.name]) {
            playerStats[player.name] = { batting: 0, field: 0, total: 0 }
          }
          playerStats[player.name].batting++
          playerStats[player.name].total++
        })

        Object.values(inningData.fieldAssignments).forEach(playerId => {
          if (playerId == null) return
          const allPlayers = [...inningData.battingOrder, ...inningData.subs]
          const player = allPlayers.find(p => p.id === playerId)
          if (player) {
            if (!playerStats[player.name]) {
              playerStats[player.name] = { batting: 0, field: 0, total: 0 }
            }
            playerStats[player.name].field++
            const inBattingOrder = inningData.battingOrder.some(p => p.id === playerId)
            if (!inBattingOrder) {
              playerStats[player.name].total++
            }
          }
        })
      }
    })

    return Object.entries(playerStats)
      .map(([name, stats]) => ({
        name,
        ...stats,
        percentage: maxPossibleInnings > 0 ? ((stats.total / maxPossibleInnings) * 100).toFixed(1) : 0
      }))
      .sort((a, b) => b.total - a.total)
  }

  const seasonStats = calculateSeasonMetrics()
  const selectedGame = savedGames.find(g => g.id === selectedGameId)
  const gameStats = selectedGame ? calculateGameMetrics(selectedGame, roster) :
    (currentGameInfo.opponent ? calculateGameMetrics({ gameData: currentGameData, innings: currentGameInfo.innings || 7 }, roster) : [])

  const displayStats = viewMode === 'season' ? seasonStats : gameStats
  const totalGames = savedGames.length

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Player Metrics</h3>
              <p className="text-sm text-gray-500">{totalGames} games saved</p>
            </div>
            <button
              onClick={onClose}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>

          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setViewMode('season')}
              className={`px-3 py-1 rounded text-sm font-medium ${
                viewMode === 'season'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Season Totals
            </button>
            <button
              onClick={() => { setViewMode('game'); setSelectedGameId(null) }}
              className={`px-3 py-1 rounded text-sm font-medium ${
                viewMode === 'game'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Single Game
            </button>
          </div>

          {viewMode === 'game' && (
            <select
              value={selectedGameId || ''}
              onChange={(e) => setSelectedGameId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800 text-sm"
            >
              <option value="">Current Game {currentGameInfo.opponent ? `(vs ${currentGameInfo.opponent})` : ''}</option>
              {savedGames.map(game => (
                <option key={game.id} value={game.id}>
                  vs {game.opponent} - {game.date}
                </option>
              ))}
            </select>
          )}
        </div>

        {displayStats.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {viewMode === 'season'
              ? 'No saved games yet. Save a game to see season metrics.'
              : 'No data available for this game.'}
          </div>
        ) : (
          <div className="p-4">
            {viewMode === 'game' && selectedGame && (
              <p className="text-sm text-gray-600 mb-2">
                Showing: vs {selectedGame.opponent} - {selectedGame.date}
              </p>
            )}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-2 text-left font-semibold">Player</th>
                  <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Batting Inn</th>
                  <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Field Inn</th>
                  <th className="border border-gray-300 px-3 py-2 text-center font-semibold">Total Inn</th>
                  <th className="border border-gray-300 px-3 py-2 text-center font-semibold">% Played</th>
                </tr>
              </thead>
              <tbody>
                {displayStats.map((player, index) => (
                  <tr key={player.name} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                    <td className="border border-gray-300 px-3 py-2 font-medium">{player.name}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">{player.batting}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">{player.field}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center font-bold">{player.total}</td>
                    <td className="border border-gray-300 px-3 py-2 text-center">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${player.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs w-12">{player.percentage}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SavedGamesModal({ isOpen, onClose, savedGames, onLoadGame, onDeleteGame, canEdit }) {
  const [confirmDelete, setConfirmDelete] = useState(null)

  if (!isOpen) return null

  const handleDeleteClick = (game) => {
    setConfirmDelete(game)
  }

  const handleConfirmDelete = () => {
    if (confirmDelete) {
      onDeleteGame(confirmDelete.id)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Saved Games</h3>
          <button
            onClick={onClose}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>

        {/* Delete Confirmation */}
        {confirmDelete && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <p className="text-red-800 font-medium mb-3">
              Delete game vs {confirmDelete.opponent} ({confirmDelete.date})?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-medium"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {savedGames.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No saved games yet.
          </div>
        ) : (
          <div className="p-2">
            {savedGames.map((game) => (
              <div
                key={game.id}
                className="flex items-center gap-2 p-3 hover:bg-gray-50 rounded-md border-b border-gray-100 last:border-b-0"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-800">vs {game.opponent}</div>
                  <div className="text-sm text-gray-500">{game.date}</div>
                </div>
                <button
                  onClick={() => onLoadGame(game)}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                >
                  {canEdit ? 'Load' : 'View'}
                </button>
                {canEdit && (
                  <button
                    onClick={() => handleDeleteClick(game)}
                    className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Helper function to detect changes between innings
function getInningChanges(gameData, inning, allPlayersMap) {
  if (inning === 1 || !gameData[inning] || !gameData[inning - 1]) {
    return { battingChanges: [], fieldChanges: [] }
  }

  const prevInning = gameData[inning - 1]
  const currInning = gameData[inning]
  const battingChanges = []
  const fieldChanges = []

  // Check batting order changes
  currInning.battingOrder.forEach((player, index) => {
    const prevPlayer = prevInning.battingOrder[index]
    if (prevPlayer && prevPlayer.id !== player.id) {
      battingChanges.push({
        slot: index + 1,
        playerIn: player,
        playerOut: prevPlayer
      })
    }
  })

  // Check field position changes
  FIELD_POSITIONS.forEach(pos => {
    const prevPlayerId = prevInning.fieldAssignments[pos]
    const currPlayerId = currInning.fieldAssignments[pos]
    if (prevPlayerId !== currPlayerId) {
      const prevPlayer = allPlayersMap[prevPlayerId]
      const currPlayer = allPlayersMap[currPlayerId]
      fieldChanges.push({
        position: pos,
        playerIn: currPlayer,
        playerOut: prevPlayer
      })
    }
  })

  return { battingChanges, fieldChanges }
}

function InningSubsModal({ isOpen, onClose, gameData, gameInfo }) {
  if (!isOpen) return null

  // Build a map of all players across all innings
  const allPlayersMap = {}
  Object.values(gameData).forEach(inningData => {
    if (inningData) {
      [...inningData.battingOrder, ...inningData.subs].forEach(p => {
        allPlayersMap[p.id] = p
      })
    }
  })

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto print:static print:bg-white print:p-0 print:block">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto print:max-w-none print:max-h-none print:shadow-none print:rounded-none print:overflow-visible">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white print:static print:border-b-2 print:p-2">
          <div className="flex items-center gap-3">
            <img src="/GClogo.jpg" alt="GC Logo" className="w-10 h-10 object-contain hidden print:block" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 print:text-base">Inning Substitutions</h3>
              {gameInfo?.opponent && (
                <p className="text-sm text-gray-600 print:text-xs">vs {gameInfo.opponent} - {gameInfo.date}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              onClick={handlePrint}
              className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-4 space-y-3 print:p-2 print:grid print:grid-cols-2 print:gap-2 print:space-y-0">
          {INNINGS.map(inning => {
            const { battingChanges, fieldChanges } = getInningChanges(gameData, inning, allPlayersMap)
            const hasChanges = battingChanges.length > 0 || fieldChanges.length > 0
            const inningData = gameData[inning]

            return (
              <div key={inning} className="border border-gray-200 rounded-lg overflow-hidden print:rounded print:border-gray-400 print:break-inside-avoid">
                <div className="px-3 py-1.5 font-bold text-white text-sm print:px-2 print:py-1 print:text-xs" style={{ backgroundColor: '#1e3a5f' }}>
                  Inning {inning}
                </div>
                <div className="p-2 print:p-1.5 text-sm print:text-xs">
                  {!inningData ? (
                    <p className="text-gray-400 italic">Not yet played</p>
                  ) : (
                    <div className="space-y-1.5">
                      {/* Batting order */}
                      <div className="space-y-0.5">
                        {inningData.battingOrder.map((player, idx) => {
                          const pos = Object.entries(inningData.fieldAssignments).find(([, pid]) => pid === player.id)?.[0]
                          return (
                            <div key={player.id} className="flex items-center gap-1 text-xs">
                              <span className="text-gray-400 w-4 text-right">{idx + 1}.</span>
                              {player.jersey && <span className="text-gray-400 w-5 text-right font-medium">#{player.jersey}</span>}
                              <span className="font-medium text-gray-800">{player.name}</span>
                              {pos && <span className="text-gray-500">({pos})</span>}
                            </div>
                          )
                        })}
                      </div>
                      {/* Fielding positions */}
                      <div className="pt-1 border-t border-gray-200">
                        <div className="grid grid-cols-3 gap-x-2 gap-y-0.5">
                          {FIELD_POSITIONS.map(pos => {
                            const playerId = inningData.fieldAssignments[pos]
                            const player = playerId != null ? allPlayersMap[playerId] : null
                            return (
                              <div key={pos} className="flex items-center gap-1 text-xs">
                                <span className="font-bold text-blue-700 w-6 shrink-0">{pos}</span>
                                <span className="text-gray-800 truncate">{player?.name || <span className="text-gray-300">—</span>}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* Sub changes */}
                      {(hasChanges && inning > 1) && (
                        <div className="space-y-0.5 pt-1 border-t border-gray-100">
                          {battingChanges.map((change, idx) => (
                            <div key={`b${idx}`} className="flex items-center gap-1 py-0.5 px-1.5 bg-amber-50 rounded text-xs">
                              <span className="font-bold text-amber-700">#{change.slot}</span>
                              <span className="text-green-700 font-medium">{change.playerIn.name}{change.playerIn.jersey ? ` #${change.playerIn.jersey}` : ''}</span>
                              <span className="text-gray-400">←</span>
                              <span className="text-red-600 line-through">{change.playerOut.name}{change.playerOut.jersey ? ` #${change.playerOut.jersey}` : ''}</span>
                            </div>
                          ))}
                          {fieldChanges.map((change, idx) => (
                            <div key={`f${idx}`} className="flex items-center gap-1 py-0.5 px-1.5 bg-blue-50 rounded text-xs">
                              <span className="font-bold text-blue-700 w-6">{change.position}</span>
                              <span className="text-green-700 font-medium">{change.playerIn ? `${change.playerIn.name}${change.playerIn.jersey ? ` #${change.playerIn.jersey}` : ''}` : '-'}</span>
                              <span className="text-gray-400">←</span>
                              <span className="text-red-600 line-through">{change.playerOut ? `${change.playerOut.name}${change.playerOut.jersey ? ` #${change.playerOut.jersey}` : ''}` : '-'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function UmpireLineupCard({ isOpen, onClose, gameData, gameInfo, roster }) {
  if (!isOpen) return null

  const battingOrder = gameData[1]?.battingOrder || []
  const gameSubs = gameData[1]?.subs || []
  const fieldAssignments = gameData[1]?.fieldAssignments || {}

  // Build lookup map from current roster (to get updated names/jerseys)
  const allRosterPlayers = [...roster.players, ...roster.subs]
  const rosterMap = {}
  allRosterPlayers.forEach(p => { rosterMap[p.id] = p })

  // Get current player data from roster
  const getPlayerFromRoster = (playerId) => rosterMap[playerId] || null

  const getPlayerPosition = (playerId) => {
    const entry = Object.entries(fieldAssignments).find(([, id]) => id === playerId)
    return entry ? entry[0] : ''
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <>
      <style>{`
        @page {
          margin: 0.75in;
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          body { margin: 0; padding: 0; }
          .umpire-card { width: 4.5in !important; margin: 0 auto !important; }
        }
      `}</style>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto print:static print:bg-white print:p-0 print:block">
        <div className="umpire-card bg-white rounded-lg shadow-xl w-full max-w-2xl print:max-w-none print:shadow-none print:rounded-none print:w-full">
          {/* Print Header */}
          <div className="print:hidden p-3 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-900">Umpire Lineup Card</h3>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
            >
              Print
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>

        {/* Lineup Card */}
        <div className="p-4 print:p-0">
          <div className="border-2 border-gray-800 print:border-black print:border">
            {/* Header */}
            <div className="text-center py-3 print:py-2 border-b-2 border-gray-800 print:border-b" style={{ backgroundColor: '#1e3a5f' }}>
              <div className="flex items-center justify-center gap-3 print:gap-2">
                <img src="/GClogo.jpg" alt="Logo" className="w-12 h-12 print:w-10 print:h-10 object-contain rounded bg-white p-1 print:p-0.5" />
                <div>
                  <h1 className="text-lg print:text-base font-bold text-white tracking-wide print:tracking-normal">OUR LADY OF GOOD COUNSEL</h1>
                  <h2 className="text-base print:text-sm font-bold text-amber-400">FALCONS SOFTBALL</h2>
                </div>
              </div>
              <p className="text-sm print:text-xs text-gray-200 mt-1 print:mt-0.5">Bob Simmerly, Head Coach</p>
            </div>

            {/* Game Info Row */}
            <div className="flex border-b border-gray-800 text-sm print:text-sm">
              <div className="flex-1 p-2 print:p-1.5 border-r border-gray-800">
                <span className="font-semibold">Date:</span> {gameInfo?.date || '______'}
              </div>
              <div className="flex-1 p-2 print:p-1.5 border-r border-gray-800">
                <span className="font-semibold">vs.</span> {gameInfo?.opponent || '______'}
              </div>
              <div className="flex-1 p-2 print:p-1.5">
                <span className="font-semibold">Game:</span> ______
              </div>
            </div>

            {/* Column Headers */}
            <div className="flex bg-gray-800 text-white text-xs print:text-xs font-bold">
              <div className="w-12 print:w-10 p-1.5 print:p-1 text-center border-r border-gray-600">ORDER</div>
              <div className="w-10 print:w-8 p-1.5 print:p-1 text-center border-r border-gray-600">#</div>
              <div className="flex-1 p-1.5 print:p-1 border-r border-gray-600">STARTER</div>
              <div className="w-12 print:w-10 p-1.5 print:p-1 text-center border-r border-gray-600">POS</div>
              <div className="flex-1 p-1.5 print:p-1 border-r border-gray-600">SUBSTITUTE</div>
              <div className="w-12 print:w-10 p-1.5 print:p-1 text-center">POS</div>
            </div>

            {/* Batting Order Rows */}
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((order, idx) => {
              const gamePlayer = battingOrder[idx]
              const player = gamePlayer ? getPlayerFromRoster(gamePlayer.id) : null
              const position = gamePlayer ? getPlayerPosition(gamePlayer.id) : ''
              return (
                <div key={order} className="flex border-b border-gray-400 min-h-[36px] print:min-h-[28px]">
                  <div className="w-12 print:w-10 p-1 print:p-0.5 flex items-center justify-center border-r border-gray-400 text-sm print:text-sm text-gray-500">
                    {order}
                  </div>
                  <div className="w-10 print:w-8 p-1 print:p-0.5 flex items-center justify-center border-r border-gray-400 font-bold text-xl print:text-base" style={{ color: '#1e3a5f' }}>
                    {player?.jersey || ''}
                  </div>
                  <div className="flex-1 p-1 print:p-0.5 print:pl-1 flex items-center border-r border-gray-400 text-sm print:text-sm font-medium">
                    {player?.name || ''}
                  </div>
                  <div className="w-12 print:w-10 p-1 print:p-0.5 flex items-center justify-start border-r border-gray-400 text-sm print:text-sm font-medium relative" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #9ca3af, transparent calc(50% + 1px))' }}>
                    <span className="pl-0.5">{position}</span>
                  </div>
                  <div className="flex-1 p-1 print:p-0.5 border-r border-gray-400"></div>
                  <div className="w-12 print:w-10 p-1 print:p-0.5 border-r border-gray-400" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #9ca3af, transparent calc(50% + 1px))' }}></div>
                </div>
              )
            })}

            {/* FLEX Row */}
            <div className="flex border-b border-gray-400 min-h-[36px] print:min-h-[28px] bg-gray-50">
              <div className="w-12 print:w-10 p-1 print:p-0.5 flex items-center justify-center border-r border-gray-400 font-bold text-xs print:text-xs" style={{ color: '#1e3a5f' }}>
                FLEX
              </div>
              <div className="w-10 print:w-8 p-1 print:p-0.5 border-r border-gray-400"></div>
              <div className="flex-1 p-1 print:p-0.5 border-r border-gray-400"></div>
              <div className="w-12 print:w-10 p-1 print:p-0.5 border-r border-gray-400" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #9ca3af, transparent calc(50% + 1px))' }}></div>
              <div className="flex-1 p-1 print:p-0.5 border-r border-gray-400"></div>
              <div className="w-12 print:w-10 p-1 print:p-0.5" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #9ca3af, transparent calc(50% + 1px))' }}></div>
            </div>

            {/* 3 Blank Rows */}
            {[1, 2, 3].map((row) => (
              <div key={`blank-${row}`} className="flex border-b border-gray-400 min-h-[36px] print:min-h-[28px]">
                <div className="w-12 print:w-10 p-1 print:p-0.5 border-r border-gray-400"></div>
                <div className="w-10 print:w-8 p-1 print:p-0.5 border-r border-gray-400"></div>
                <div className="flex-1 p-1 print:p-0.5 border-r border-gray-400"></div>
                <div className="w-12 print:w-10 p-1 print:p-0.5 border-r border-gray-400" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #9ca3af, transparent calc(50% + 1px))' }}></div>
                <div className="flex-1 p-1 print:p-0.5 border-r border-gray-400"></div>
                <div className="w-12 print:w-10 p-1 print:p-0.5" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #9ca3af, transparent calc(50% + 1px))' }}></div>
              </div>
            ))}

            {/* Subs Section */}
            <div className="flex bg-gray-800 text-white text-xs print:text-xs font-bold">
              <div className="w-12 print:w-10 p-1.5 print:p-1 text-center border-r border-gray-600">SUBS</div>
              <div className="w-10 print:w-8 p-1.5 print:p-1 text-center border-r border-gray-600">#</div>
              <div className="flex-1 p-1.5 print:p-1 border-r border-gray-600">NAME</div>
              <div className="w-12 print:w-10 p-1.5 print:p-1 text-center border-r border-gray-600">POS</div>
              <div className="flex-1 p-1.5 print:p-1 border-r border-gray-600"></div>
              <div className="w-12 print:w-10 p-1.5 print:p-1 text-center">POS</div>
            </div>

            {/* Sub Rows */}
            {gameSubs.map((gameSub, idx) => {
              const sub = getPlayerFromRoster(gameSub.id)
              return (
              <div key={gameSub.id} className="flex border-b border-gray-400 min-h-[32px] print:min-h-[24px]">
                <div className="w-12 print:w-10 p-1 print:p-0.5 flex items-center justify-center border-r border-gray-400 text-sm print:text-sm text-gray-500">
                  {idx + 1}
                </div>
                <div className="w-10 print:w-8 p-1 print:p-0.5 flex items-center justify-center border-r border-gray-400 font-bold text-xl print:text-base" style={{ color: '#1e3a5f' }}>
                  {sub?.jersey || ''}
                </div>
                <div className="flex-1 p-1 print:p-0.5 print:pl-1 flex items-center border-r border-gray-400 text-sm print:text-sm">
                  {sub?.name || ''}
                </div>
                <div className="w-12 print:w-10 p-1 print:p-0.5 border-r border-gray-400" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #9ca3af, transparent calc(50% + 1px))' }}></div>
                <div className="flex-1 p-1 print:p-0.5 border-r border-gray-400"></div>
                <div className="w-12 print:w-10 p-1 print:p-0.5" style={{ background: 'linear-gradient(to bottom right, transparent calc(50% - 1px), #9ca3af, transparent calc(50% + 1px))' }}></div>
              </div>
              )
            })}

            {/* Roster Section - hidden on print */}
            <div className="p-2 bg-gray-100 border-t border-gray-800 print:hidden">
              <div className="grid grid-cols-5 gap-x-4 gap-y-0.5 text-xs">
                {[...roster.players, ...roster.subs].map((player) => (
                  <div key={player.id} className="flex gap-1">
                    <span className="font-bold w-5">{player.jersey || ''}</span>
                    <span>{player.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}

function DragHandle({ canEdit }) {
  if (!canEdit) return null
  return (
    <div className="flex flex-col gap-0.5 mr-1 cursor-grab active:cursor-grabbing text-gray-400">
      <div className="flex gap-0.5">
        <div className="w-1 h-1 rounded-full bg-current"></div>
        <div className="w-1 h-1 rounded-full bg-current"></div>
      </div>
      <div className="flex gap-0.5">
        <div className="w-1 h-1 rounded-full bg-current"></div>
        <div className="w-1 h-1 rounded-full bg-current"></div>
      </div>
      <div className="flex gap-0.5">
        <div className="w-1 h-1 rounded-full bg-current"></div>
        <div className="w-1 h-1 rounded-full bg-current"></div>
      </div>
    </div>
  )
}

function BattingOrderRow({ player, slot, position, onSwapClick, canEdit, isChanged, previousPlayer, provided, isDragging, snapshot }) {
  const isEH = !position
  const isDraggingOver = snapshot?.isDraggingOver

  return (
    <div
      ref={provided?.innerRef}
      {...(provided?.draggableProps || {})}
      {...(provided?.dragHandleProps || {})}
      className={`flex items-center gap-2 p-3 rounded-lg border-2 shadow-sm transition-all
        ${isDragging ? 'shadow-lg ring-2 ring-blue-400 opacity-90' : ''}
        ${isDraggingOver ? 'border-blue-400 bg-blue-50' : ''}
        ${isChanged ? 'border-green-400 bg-green-50' : 'border-amber-200 bg-white'}
      `}
    >
      <DragHandle canEdit={canEdit} />
      <div className="w-9 h-9 flex items-center justify-center rounded-full text-sm font-bold text-amber-400 shadow" style={{ backgroundColor: '#1e3a5f' }}>
        {slot}
      </div>

      <div className="flex-1 min-w-0 px-3 py-2">
        <div className="text-gray-800 font-medium flex items-center gap-2">
          {player.name}
          {isChanged && (
            <span className="text-xs bg-green-500 text-white px-1.5 py-0.5 rounded font-bold">IN</span>
          )}
        </div>
        {isChanged && previousPlayer && (
          <div className="text-xs text-red-500 line-through">{previousPlayer.name}</div>
        )}
      </div>

      <span className={`w-12 text-center px-2 py-1.5 rounded text-xs font-bold shadow-sm
        ${isEH
          ? 'bg-amber-400 text-gray-900'
          : 'text-white'}
      `} style={{ backgroundColor: isEH ? undefined : '#1e3a5f' }}>
        {position || 'EH'}
      </span>

      {canEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onSwapClick(); }}
          className="px-3 py-2 text-white rounded-md hover:opacity-90 transition-colors text-sm font-medium whitespace-nowrap shadow"
          style={{ backgroundColor: '#1e3a5f' }}
        >
          Swap
        </button>
      )}
    </div>
  )
}

function PositionBubble({ position, playerId, hasConflict, player, canEdit, allPlayers, onPositionChange, isChanged, previousPlayer }) {
  const droppableContent = (provided, snapshot) => (
    <div
      ref={provided.innerRef}
      {...provided.droppableProps}
      className="flex flex-col items-center"
    >
      <div className={`w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold shadow-md relative transition-all
        ${snapshot.isDraggingOver ? 'ring-4 ring-blue-400 scale-110' : ''}
        ${hasConflict ? 'bg-red-500 text-white' : isChanged ? 'bg-green-500 text-white border-2 border-green-300' : 'bg-navy-700 text-amber-400 border-2 border-amber-400'}
      `} style={{ backgroundColor: hasConflict ? undefined : isChanged ? undefined : snapshot.isDraggingOver ? '#2563eb' : '#1e3a5f' }}>
        {position}
        {isChanged && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold">!</span>
        )}
      </div>
      {canEdit ? (
        <select
          value={playerId || ''}
          onChange={(e) => onPositionChange(position, e.target.value ? parseInt(e.target.value) : null)}
          className={`text-xs mt-1 w-24 px-1 py-1.5 border-2 rounded bg-white text-gray-800 font-medium ${snapshot.isDraggingOver ? 'border-blue-500' : isChanged ? 'border-green-500' : 'border-amber-500'}`}
        >
          <option value="">None</option>
          {allPlayers.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      ) : (
        <div className={`text-xs mt-1 w-24 px-1 py-1.5 text-center font-medium rounded ${isChanged ? 'bg-green-100 text-green-800' : 'bg-white/80 text-gray-800'}`}>
          {player?.name || '-'}
          {isChanged && previousPlayer && (
            <div className="text-[10px] text-red-500 line-through truncate">{previousPlayer.name}</div>
          )}
        </div>
      )}
      {provided.placeholder}
    </div>
  )

  if (!canEdit) {
    return (
      <div className="flex flex-col items-center">
        <div className={`w-14 h-14 rounded-full flex items-center justify-center text-sm font-bold shadow-md relative
          ${hasConflict ? 'bg-red-500 text-white' : isChanged ? 'bg-green-500 text-white border-2 border-green-300' : 'bg-navy-700 text-amber-400 border-2 border-amber-400'}
        `} style={{ backgroundColor: hasConflict ? undefined : isChanged ? undefined : '#1e3a5f' }}>
          {position}
          {isChanged && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-600 rounded-full flex items-center justify-center text-[10px] text-white font-bold">!</span>
          )}
        </div>
        <div className={`text-xs mt-1 w-24 px-1 py-1.5 text-center font-medium rounded ${isChanged ? 'bg-green-100 text-green-800' : 'bg-white/80 text-gray-800'}`}>
          {player?.name || '-'}
          {isChanged && previousPlayer && (
            <div className="text-[10px] text-red-500 line-through truncate">{previousPlayer.name}</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <Droppable droppableId={`field-${position}`} type="PLAYER">
      {droppableContent}
    </Droppable>
  )
}

function FieldDiamond({ fieldAssignments, allPlayers, onPositionChange, positionConflicts, canEdit, previousFieldAssignments, previousAllPlayers }) {
  const getPositionProps = (position) => {
    const currentPlayerId = fieldAssignments[position]
    const previousPlayerId = previousFieldAssignments ? previousFieldAssignments[position] : currentPlayerId
    const isChanged = previousFieldAssignments && currentPlayerId !== previousPlayerId
    const previousPlayer = isChanged && previousAllPlayers ? previousAllPlayers.find(p => p.id === previousPlayerId) : null

    return {
      position,
      playerId: currentPlayerId,
      hasConflict: positionConflicts[position],
      player: allPlayers.find(p => p.id === currentPlayerId),
      canEdit,
      allPlayers,
      onPositionChange,
      isChanged,
      previousPlayer
    }
  }

  return (
    <div className="bg-emerald-600 rounded-lg p-6 relative shadow-lg">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-28 h-28 border-3 border-white/40 rotate-45 bg-emerald-500/50 mt-10"></div>
      </div>

      <div className="relative">
        <div className="flex justify-between px-2 mb-6">
          <PositionBubble {...getPositionProps("LF")} />
          <PositionBubble {...getPositionProps("CF")} />
          <PositionBubble {...getPositionProps("RF")} />
        </div>

        <div className="flex justify-center gap-16 my-5">
          <PositionBubble {...getPositionProps("SS")} />
          <PositionBubble {...getPositionProps("2B")} />
        </div>

        <div className="flex justify-between items-center px-6">
          <PositionBubble {...getPositionProps("3B")} />
          <PositionBubble {...getPositionProps("P")} />
          <PositionBubble {...getPositionProps("1B")} />
        </div>

        <div className="flex justify-center mt-5">
          <PositionBubble {...getPositionProps("C")} />
        </div>
      </div>
    </div>
  )
}

function ValidationPanel({ fieldAssignments, battingOrder }) {
  const assignedPlayerIds = Object.values(fieldAssignments).filter(id => id != null)
  const battingOrderIds = battingOrder.map(p => p.id)

  const duplicatePlayers = assignedPlayerIds.filter((id, index) =>
    assignedPlayerIds.indexOf(id) !== index
  )

  const missingPositions = FIELD_POSITIONS.filter(pos => !fieldAssignments[pos])
  const ehPlayers = battingOrderIds.filter(id => !assignedPlayerIds.includes(id))

  const hasErrors = duplicatePlayers.length > 0
  const hasWarnings = missingPositions.length > 0

  if (!hasErrors && !hasWarnings) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
        <p className="text-green-700 font-medium text-sm flex items-center gap-2">
          <span className="text-green-500">✓</span> All 9 positions filled correctly
          {ehPlayers.length > 0 && ` (${ehPlayers.length} EH)`}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {duplicatePlayers.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-700 font-medium text-sm">
            ⚠ Same player assigned to multiple positions
          </p>
        </div>
      )}
      {missingPositions.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-yellow-700 font-medium text-sm">
            ○ Missing positions: {missingPositions.join(', ')}
          </p>
        </div>
      )}
    </div>
  )
}

function App() {
  const [roster, setRoster] = useState(createDefaultRoster)
  const [gameData, setGameData] = useState(() => createInitialGameData(createDefaultRoster()))
  const [currentInning, setCurrentInning] = useState(1)
  const [swapModal, setSwapModal] = useState({ isOpen: false, player: null })
  const [summaryModal, setSummaryModal] = useState(false)
  const [saveModal, setSaveModal] = useState(false)
  const [metricsModal, setMetricsModal] = useState(false)
  const [savedGamesModal, setSavedGamesModal] = useState(false)
  const [rosterModal, setRosterModal] = useState(false)
  const [passwordModal, setPasswordModal] = useState(false)
  const [inningSubsModal, setInningSubsModal] = useState(false)
  const [umpireCardModal, setUmpireCardModal] = useState(false)
  const [savedGames, setSavedGames] = useState([])
  const [gameInfo, setGameInfo] = useState({
    opponent: '',
    date: new Date().toISOString().split('T')[0],
    innings: 7
  })
  const [currentGameId, setCurrentGameId] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('loading')

  const canEdit = isAuthenticated

  // Listen for Firebase Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user)
    })
    return () => unsubscribe()
  }, [])

  // Load data from Firestore on mount with real-time listeners
  useEffect(() => {
    console.log('Setting up Firestore listeners...')

    // Real-time listener for roster
    const unsubscribeRoster = onSnapshot(doc(db, 'settings', 'roster'), (docSnap) => {
      console.log('Roster snapshot received, exists:', docSnap.exists())
      if (docSnap.exists()) {
        const loadedRoster = docSnap.data()
        setRoster(loadedRoster)
      }
      setSyncStatus('synced')
    }, (error) => {
      console.error('Roster sync error:', error.code, error.message)
      setSyncStatus('error')
    })

    // Real-time listener for current game (shared across all devices)
    const unsubscribeCurrentGame = onSnapshot(doc(db, 'settings', 'currentGame'), (docSnap) => {
      console.log('Current game snapshot received, exists:', docSnap.exists())
      if (docSnap.exists()) {
        const data = docSnap.data()
        console.log('Loading current game from Firestore')
        setGameData(data.gameData)
        setGameInfo({ opponent: data.opponent || '', date: data.date || new Date().toISOString().split('T')[0], innings: data.innings || 7 })
        setCurrentGameId(data.id || null)
      }
      setLoading(false)
      setSyncStatus('synced')
    }, (error) => {
      console.error('Current game sync error:', error.code, error.message)
      setSyncStatus('error')
      setLoading(false)
    })

    // Real-time listener for saved games list
    const unsubscribeGames = onSnapshot(collection(db, 'games'), (snapshot) => {
      console.log('Games snapshot received, count:', snapshot.docs.length)
      const games = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setSavedGames(games)
      setSyncStatus('synced')
    }, (error) => {
      console.error('Games sync error:', error.code, error.message)
      setSyncStatus('error')
    })

    return () => {
      unsubscribeRoster()
      unsubscribeCurrentGame()
      unsubscribeGames()
    }
  }, [])

  const currentData = gameData[currentInning] || gameData[1]
  const allPlayers = [...currentData.battingOrder, ...currentData.subs]

  // Sort subs: empty/blank names go to bottom
  const sortedSubs = [...currentData.subs].sort((a, b) => {
    const aEmpty = !a.name || a.name.trim() === ''
    const bEmpty = !b.name || b.name.trim() === ''
    if (aEmpty && !bEmpty) return 1
    if (!aEmpty && bEmpty) return -1
    return 0
  })

  // Get previous inning data for change detection
  const previousInningData = currentInning > 1 ? gameData[currentInning - 1] : null
  const previousAllPlayers = previousInningData ? [...previousInningData.battingOrder, ...previousInningData.subs] : null

  // Save current game to Firestore (called after any change)
  const syncCurrentGame = async (newGameData, newGameInfo, newGameId) => {
    setSyncStatus('saving')
    try {
      await setDoc(doc(db, 'settings', 'currentGame'), {
        gameData: JSON.parse(JSON.stringify(newGameData)),
        opponent: newGameInfo.opponent,
        date: newGameInfo.date,
        innings: newGameInfo.innings || 7,
        id: newGameId,
        updatedAt: new Date().toISOString()
      })
      setSyncStatus('synced')
    } catch (error) {
      console.error('Error syncing current game:', error)
      setSyncStatus('error')
    }
  }

  const getPositionConflicts = () => {
    const conflicts = {}
    const playerPositions = {}

    Object.entries(currentData.fieldAssignments).forEach(([position, playerId]) => {
      if (playerId != null) {
        if (playerPositions[playerId]) {
          conflicts[position] = true
          conflicts[playerPositions[playerId]] = true
        } else {
          playerPositions[playerId] = position
        }
      }
    })

    return conflicts
  }

  const positionConflicts = getPositionConflicts()

  const getPlayerPosition = (playerId) => {
    const entry = Object.entries(currentData.fieldAssignments)
      .find(([, pid]) => pid === playerId)
    return entry ? entry[0] : null
  }

  // Unified drag-drop handler
  const onDragEnd = (result) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (!canEdit) return

    const sourceId = source.droppableId
    const destId = destination.droppableId
    const playerId = parseInt(draggableId.replace('player-', ''))
    const player = allPlayers.find(p => p.id === playerId)

    if (!player) return

    // Dropped in same place
    if (sourceId === destId && source.index === destination.index) return

    // Handle field position drops
    if (destId.startsWith('field-')) {
      const position = destId.replace('field-', '')
      handleFieldPositionChange(position, playerId)
      return
    }

    // Handle batting order reordering (within batting order) - only allowed in inning 1
    if (sourceId === 'batting-order' && destId === 'batting-order') {
      if (currentInning > 1) return // Batting order is fixed after inning 1 (NFHS rule)
      const player1 = currentData.battingOrder[source.index]
      const player2 = currentData.battingOrder[destination.index]
      handleSwap(player1, player2, 'reorder')
      return
    }

    // Handle sub-to-batting swap (bench player entering batting order)
    if (sourceId === 'bench' && destId === 'batting-order') {
      // Clamp index to valid range (0-8 for 9 batters)
      const targetIndex = Math.min(destination.index, currentData.battingOrder.length - 1)
      const targetPlayer = currentData.battingOrder[targetIndex]
      if (!targetPlayer) return
      // Let handleSwap manage the re-entry rules - it already has the logic
      handleSwap(player, targetPlayer, 'substitute')
      return
    }

    // Handle batting-to-bench swap (batting player going to bench)
    if (sourceId === 'batting-order' && destId === 'bench') {
      // Use sortedSubs since that's what's displayed
      const dropIndex = Math.min(destination.index, sortedSubs.length - 1)
      if (dropIndex >= 0) {
        const targetSub = sortedSubs[dropIndex]
        // Let handleSwap manage the re-entry rules
        handleSwap(player, targetSub, 'substitute')
      }
      return
    }
  }

  const handleFieldPositionChange = (position, playerId) => {
    if (!canEdit) return
    setGameData(prev => {
      const newGameData = {
        ...prev,
        [currentInning]: {
          ...prev[currentInning],
          fieldAssignments: {
            ...prev[currentInning].fieldAssignments,
            [position]: playerId
          }
        }
      }
      syncCurrentGame(newGameData, gameInfo, currentGameId)
      return newGameData
    })
  }

  const handleSwap = (player1, player2, swapType) => {
    if (!canEdit) return
    setGameData(prev => {
      const newGameData = { ...prev }

      // Enforce re-entry rules before applying any substitute swap
      if (swapType === 'substitute') {
        const currentData = prev[currentInning]
        if (currentData) {
          const starters = currentData.starters || []
          const originalSlots = currentData.originalSlots || {}
          const reentryCount = currentData.reentryCount || {}
          const subsRemovedFromBatting = currentData.subsRemovedFromBatting || []
          const battingOrder = currentData.battingOrder
          const subs = currentData.subs
          const battingIndex1 = battingOrder.findIndex(p => p.id === player1.id)
          const subIndex1 = subs.findIndex(p => p.id === player1.id)
          const battingIndex2 = battingOrder.findIndex(p => p.id === player2.id)
          const subIndex2 = subs.findIndex(p => p.id === player2.id)

          let incomingId = null
          let targetSlot = null
          if (battingIndex1 !== -1 && subIndex2 !== -1) {
            incomingId = player2.id
            targetSlot = battingIndex1 + 1
          } else if (subIndex1 !== -1 && battingIndex2 !== -1) {
            incomingId = player1.id
            targetSlot = battingIndex2 + 1
          }

          if (incomingId !== null) {
            const isStarter = starters.includes(incomingId)
            const wasInBattingOrder = subsRemovedFromBatting.includes(incomingId)
            const playerOriginalSlot = originalSlots[incomingId]
            const timesReentered = reentryCount[incomingId] || 0
            if (isStarter || wasInBattingOrder) {
              if (timesReentered >= 1) return prev
              if (playerOriginalSlot && playerOriginalSlot !== targetSlot) return prev
            }
          }
        }
      }

      for (let inning = currentInning; inning <= 7; inning++) {
        if (!newGameData[inning]) continue

        const inningData = newGameData[inning]
        const newBattingOrder = [...inningData.battingOrder]
        const newSubs = [...inningData.subs]
        const newFieldAssignments = { ...inningData.fieldAssignments }
        const newOriginalSlots = { ...(inningData.originalSlots || {}) }
        const newStarters = [...(inningData.starters || [])]
        const newReentryCount = { ...(inningData.reentryCount || {}) }
        const newSubsRemovedFromBatting = [...(inningData.subsRemovedFromBatting || [])]

        if (swapType === 'reorder') {
          const index1 = newBattingOrder.findIndex(p => p.id === player1.id)
          const index2 = newBattingOrder.findIndex(p => p.id === player2.id)

          if (index1 !== -1 && index2 !== -1) {
            // Update originalSlots to reflect the reordered positions — these become the
            // "official" batting order slots for re-entry tracking for the whole game
            newOriginalSlots[player1.id] = index2 + 1
            newOriginalSlots[player2.id] = index1 + 1
            const temp = newBattingOrder[index1]
            newBattingOrder[index1] = newBattingOrder[index2]
            newBattingOrder[index2] = temp
          }
        } else {
          const battingIndex1 = newBattingOrder.findIndex(p => p.id === player1.id)
          const subIndex1 = newSubs.findIndex(p => p.id === player1.id)
          const battingIndex2 = newBattingOrder.findIndex(p => p.id === player2.id)
          const subIndex2 = newSubs.findIndex(p => p.id === player2.id)

          if (battingIndex1 !== -1 && subIndex2 !== -1) {
            // Player in batting order (player1/fromBatting) is being replaced by someone on bench (player2/fromSubs)
            const fromBatting = newBattingOrder[battingIndex1]
            const fromSubs = newSubs[subIndex2]
            const slot = battingIndex1 + 1

            // Track entry slot on first entry; increment re-entry count on subsequent entries
            if (!newOriginalSlots[fromSubs.id]) {
              newOriginalSlots[fromSubs.id] = slot
            } else {
              newReentryCount[fromSubs.id] = (newReentryCount[fromSubs.id] || 0) + 1
            }

            // The person leaving (fromBatting) - if NOT a starter, mark them as removed
            const leavingIsStarter = newStarters.includes(fromBatting.id)
            if (!leavingIsStarter && !newSubsRemovedFromBatting.includes(fromBatting.id)) {
              newSubsRemovedFromBatting.push(fromBatting.id)
            }

            newBattingOrder[battingIndex1] = { ...fromSubs }
            newSubs[subIndex2] = { ...fromBatting }
            // Field positions are managed independently - no automatic transfer
          }
          else if (subIndex1 !== -1 && battingIndex2 !== -1) {
            // Someone on bench (player1/fromSubs) is replacing player in batting order (player2/fromBatting)
            const fromSubs = newSubs[subIndex1]
            const fromBatting = newBattingOrder[battingIndex2]
            const slot = battingIndex2 + 1

            // Track entry slot on first entry; increment re-entry count on subsequent entries
            if (!newOriginalSlots[fromSubs.id]) {
              newOriginalSlots[fromSubs.id] = slot
            } else {
              newReentryCount[fromSubs.id] = (newReentryCount[fromSubs.id] || 0) + 1
            }

            // The person leaving (fromBatting) - if NOT a starter, mark them as removed
            const leavingIsStarter = newStarters.includes(fromBatting.id)
            if (!leavingIsStarter && !newSubsRemovedFromBatting.includes(fromBatting.id)) {
              newSubsRemovedFromBatting.push(fromBatting.id)
            }

            newBattingOrder[battingIndex2] = { ...fromSubs }
            newSubs[subIndex1] = { ...fromBatting }
            // Field positions are managed independently - no automatic transfer
          }
        }

        newGameData[inning] = {
          battingOrder: newBattingOrder,
          subs: newSubs,
          fieldAssignments: newFieldAssignments,
          originalSlots: newOriginalSlots,
          starters: newStarters,
          reentryCount: newReentryCount,
          subsRemovedFromBatting: newSubsRemovedFromBatting
        }
      }

      syncCurrentGame(newGameData, gameInfo, currentGameId)
      return newGameData
    })

    setSwapModal({ isOpen: false, player: null })
  }

  const handleInningChange = (newInning) => {
    if (!gameData[newInning]) {
      setGameData(prev => {
        let sourceInning = newInning - 1
        while (sourceInning > 0 && !prev[sourceInning]) {
          sourceInning--
        }

        if (sourceInning > 0 && prev[sourceInning]) {
          const source = prev[sourceInning]
          const newGameData = {
            ...prev,
            [newInning]: createInningData(
              source.battingOrder,
              source.subs,
              source.fieldAssignments,
              source.originalSlots,
              source.starters,
              source.reentryCount,
              source.subsRemovedFromBatting
            )
          }
          syncCurrentGame(newGameData, gameInfo, currentGameId)
          return newGameData
        }
        return prev
      })
    }
    setCurrentInning(newInning)
  }

  const handleSaveGame = async (opponent, date, innings) => {
    if (!canEdit) return

    setSyncStatus('saving')
    const gameId = currentGameId || Date.now().toString()
    const game = {
      opponent,
      date,
      innings: innings || 7,
      gameData: JSON.parse(JSON.stringify(gameData)),
      updatedAt: new Date().toISOString()
    }

    try {
      await setDoc(doc(db, 'games', gameId), game)
      setGameInfo({ opponent, date, innings: innings || 7 })
      setCurrentGameId(gameId)
      // Also update current game with new info
      syncCurrentGame(gameData, { opponent, date, innings: innings || 7 }, gameId)
      setSaveModal(false)
      setSyncStatus('synced')
    } catch (error) {
      console.error('Error saving game:', error)
      setSyncStatus('error')
    }
  }

  const handleLoadGame = (game) => {
    setGameData(game.gameData)
    setGameInfo({ opponent: game.opponent, date: game.date, innings: game.innings || 7 })
    setCurrentGameId(game.id)
    setCurrentInning(1)
    setSavedGamesModal(false)
    // Sync to all devices
    syncCurrentGame(game.gameData, { opponent: game.opponent, date: game.date, innings: game.innings || 7 }, game.id)
  }

  const handleDeleteGame = async (gameId) => {
    if (!canEdit) return

    setSyncStatus('saving')
    try {
      await deleteDoc(doc(db, 'games', gameId))
      setSyncStatus('synced')
    } catch (error) {
      console.error('Error deleting game:', error)
      setSyncStatus('error')
    }
  }

  const handleNewGame = () => {
    if (!canEdit) return
    const newGameData = createInitialGameData(roster)
    const newGameInfo = { opponent: '', date: new Date().toISOString().split('T')[0], innings: 7 }
    setGameData(newGameData)
    setGameInfo(newGameInfo)
    setCurrentGameId(null)
    setCurrentInning(1)
    // Sync to all devices
    syncCurrentGame(newGameData, newGameInfo, null)
  }

  const handleSaveRoster = async (newRoster) => {
    console.log('Saving roster to Firestore:', newRoster)
    setRoster(newRoster)

    setSyncStatus('saving')
    try {
      await setDoc(doc(db, 'settings', 'roster'), newRoster)
      console.log('Roster saved successfully!')
      setSyncStatus('synced')
    } catch (error) {
      console.error('Error saving roster:', error.code, error.message)
      setSyncStatus('error')
    }
  }

  const handleLogout = () => {
    signOut(auth)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <>
    <div className="min-h-screen print:hidden" style={{ backgroundColor: '#f8f6f0' }}>
      <div className="max-w-2xl mx-auto p-4">
        {/* Team Header */}
        <div className="flex items-center gap-3 mb-4 p-4 rounded-lg shadow-md" style={{ backgroundColor: '#1e3a5f' }}>
          <img src="/GClogo.jpg" alt="GC Logo" className="w-16 h-16 object-contain rounded-lg bg-white p-1" />
          <div className="flex-1">
            <h1 className="text-lg font-bold text-amber-400">{TEAM_NAME}</h1>
            <div className="flex items-center gap-2">
              <p className="text-sm text-gray-300">Lineup Manager</p>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                syncStatus === 'synced' ? 'bg-green-500 text-white' :
                syncStatus === 'saving' ? 'bg-amber-400 text-gray-900' :
                syncStatus === 'error' ? 'bg-red-500 text-white' :
                'bg-gray-400 text-white'
              }`}>
                {syncStatus === 'synced' ? 'Synced' :
                 syncStatus === 'saving' ? 'Saving...' :
                 syncStatus === 'error' ? 'Sync Error' :
                 'Loading...'}
              </span>
            </div>
          </div>
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-sm bg-amber-400 text-gray-900 rounded font-medium hover:bg-amber-300"
            >
              Logout
            </button>
          ) : (
            <button
              onClick={() => setPasswordModal(true)}
              className="px-3 py-1.5 text-sm bg-amber-400 text-gray-900 rounded font-medium hover:bg-amber-300"
            >
              Login to Edit
            </button>
          )}
        </div>

        {!canEdit && (
          <div className="mb-4 p-3 bg-amber-100 border-2 border-amber-400 rounded-lg">
            <p className="text-gray-800 text-sm font-medium">
              View-only mode. Login to make changes.
            </p>
          </div>
        )}

        <header className="mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1e3a5f' }}>
                {gameInfo.opponent
                  ? `vs ${gameInfo.opponent}`
                  : 'New Game'}
              </h2>
              {gameInfo.opponent && (
                <p className="text-gray-600 text-sm">{gameInfo.date}</p>
              )}
            </div>
            {canEdit && (
              <button
                onClick={handleNewGame}
                className="px-3 py-1.5 text-sm text-white rounded font-medium hover:opacity-90"
                style={{ backgroundColor: '#1e3a5f' }}
              >
                New Game
              </button>
            )}
          </div>
        </header>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setSummaryModal(true)}
            className="px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors text-sm font-medium shadow"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            View Summary
          </button>
          {canEdit && (
            <button
              onClick={() => setSaveModal(true)}
              className="px-4 py-2 bg-amber-500 text-gray-900 rounded-md hover:bg-amber-400 transition-colors text-sm font-medium shadow"
            >
              Save Game
            </button>
          )}
          <button
            onClick={() => setSavedGamesModal(true)}
            className="px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors text-sm font-medium shadow"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {canEdit ? 'Load Game' : 'View Games'}
          </button>
          <button
            onClick={() => setMetricsModal(true)}
            className="px-4 py-2 bg-amber-500 text-gray-900 rounded-md hover:bg-amber-400 transition-colors text-sm font-medium shadow"
          >
            Player Metrics
          </button>
          <button
            onClick={() => setInningSubsModal(true)}
            className="px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors text-sm font-medium shadow"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            Inning Subs
          </button>
          <button
            onClick={() => setUmpireCardModal(true)}
            className="px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors text-sm font-medium shadow"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            Umpire Card
          </button>
          {canEdit && (
            <button
              onClick={() => setRosterModal(true)}
              className="px-4 py-2 text-white rounded-md hover:opacity-90 transition-colors text-sm font-medium shadow"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              Manage Roster
            </button>
          )}
        </div>

        <InningTabs
          currentInning={currentInning}
          setCurrentInning={handleInningChange}
        />

        <DragDropContext onDragEnd={onDragEnd}>
        <div className="mb-4">
          <h2 className="text-lg font-bold mb-2" style={{ color: '#1e3a5f' }}>
            Inning {currentInning} - Field Positions
          </h2>
          {canEdit && <p className="text-sm text-gray-600 mb-2">Drag players to positions or use dropdowns</p>}
          <FieldDiamond
            fieldAssignments={currentData.fieldAssignments}
            allPlayers={allPlayers}
            onPositionChange={handleFieldPositionChange}
            positionConflicts={positionConflicts}
            canEdit={canEdit}
            previousFieldAssignments={previousInningData?.fieldAssignments}
            previousAllPlayers={previousAllPlayers}
          />
        </div>

        <ValidationPanel
          fieldAssignments={currentData.fieldAssignments}
          battingOrder={currentData.battingOrder}
        />
          <div className="mt-6">
            <h2 className="text-lg font-bold mb-3" style={{ color: '#1e3a5f' }}>
              Batting Order
              {canEdit && <span className="text-sm font-normal text-gray-500 ml-2">{currentInning === 1 ? 'Drag to reorder or swap' : 'Drag to swap (order locked)'}</span>}
            </h2>
            <Droppable droppableId="batting-order" type="PLAYER">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`space-y-2 p-2 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
                >
                  {currentData.battingOrder.map((player, index) => {
                    const previousPlayer = previousInningData?.battingOrder[index]
                    const isChanged = previousPlayer && previousPlayer.id !== player.id
                    return (
                      <Draggable
                        key={player.id}
                        draggableId={`player-${player.id}`}
                        index={index}
                        isDragDisabled={!canEdit}
                      >
                        {(provided, snapshot) => (
                          <BattingOrderRow
                            player={player}
                            slot={index + 1}
                            position={getPlayerPosition(player.id)}
                            onSwapClick={() => setSwapModal({ isOpen: true, player })}
                            canEdit={canEdit}
                            isChanged={isChanged}
                            previousPlayer={isChanged ? previousPlayer : null}
                            provided={provided}
                            isDragging={snapshot.isDragging}
                            snapshot={snapshot}
                          />
                        )}
                      </Draggable>
                    )
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>

          <div className="mt-6 mb-8">
            <h2 className="text-lg font-bold mb-3" style={{ color: '#1e3a5f' }}>
              Substitutes
              {canEdit && <span className="text-sm font-normal text-gray-500 ml-2">Drag to swap into batting order</span>}
            </h2>
            <Droppable droppableId="bench" type="PLAYER">
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`space-y-2 p-2 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-amber-50' : ''}`}
                >
                  {sortedSubs.map((sub, index) => {
                    const fieldPosition = Object.entries(currentData.fieldAssignments)
                      .find(([, pid]) => pid === sub.id)?.[0]

                    return (
                      <Draggable
                        key={sub.id}
                        draggableId={`player-${sub.id}`}
                        index={index}
                        isDragDisabled={!canEdit || !sub.name || sub.name.trim() === ''}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`flex items-center gap-2 px-3 py-3 bg-white border-2 border-amber-200 rounded-lg shadow-sm transition-all
                              ${snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-400 opacity-90' : ''}
                            `}
                          >
                            <DragHandle canEdit={canEdit} />
                            <div className="flex-1 min-w-0 px-2 py-1 text-gray-800 font-medium">
                              {sub.name}
                            </div>
                            {fieldPosition && (
                              <span className="px-2 py-1.5 text-white rounded text-xs font-bold shadow" style={{ backgroundColor: '#1e3a5f' }}>
                                {fieldPosition}
                              </span>
                            )}
                            {canEdit && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setSwapModal({ isOpen: true, player: sub }); }}
                                className="px-3 py-1.5 text-white rounded text-sm hover:opacity-90 transition-colors font-medium shadow"
                                style={{ backgroundColor: '#1e3a5f' }}
                              >
                                Swap
                              </button>
                            )}
                          </div>
                        )}
                      </Draggable>
                    )
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </DragDropContext>
      </div>

      <PasswordModal
        isOpen={passwordModal}
        onClose={() => setPasswordModal(false)}
        onSuccess={() => { setIsAuthenticated(true); setPasswordModal(false) }}
      />

      <RosterModal
        isOpen={rosterModal}
        onClose={() => setRosterModal(false)}
        roster={roster}
        onSave={handleSaveRoster}
      />

      <SwapModal
        isOpen={swapModal.isOpen}
        onClose={() => setSwapModal({ isOpen: false, player: null })}
        currentPlayer={swapModal.player}
        battingOrder={currentData.battingOrder}
        subs={currentData.subs}
        originalSlots={currentData.originalSlots || {}}
        starters={currentData.starters || []}
        reentryCount={currentData.reentryCount || {}}
        subsRemovedFromBatting={currentData.subsRemovedFromBatting || []}
        onSwap={handleSwap}
        currentInning={currentInning}
      />

      <SaveGameModal
        isOpen={saveModal}
        onClose={() => setSaveModal(false)}
        onSave={handleSaveGame}
        initialOpponent={gameInfo.opponent}
        initialDate={gameInfo.date}
        initialInnings={gameInfo.innings || 7}
      />

      <MetricsModal
        isOpen={metricsModal}
        onClose={() => setMetricsModal(false)}
        savedGames={savedGames}
        currentGameData={gameData}
        currentGameInfo={gameInfo}
        roster={roster}
      />

      <SavedGamesModal
        isOpen={savedGamesModal}
        onClose={() => setSavedGamesModal(false)}
        savedGames={savedGames}
        onLoadGame={handleLoadGame}
        onDeleteGame={handleDeleteGame}
        canEdit={canEdit}
      />

    </div>

      <InningSubsModal
        isOpen={inningSubsModal}
        onClose={() => setInningSubsModal(false)}
        gameData={gameData}
        gameInfo={gameInfo}
      />

      <UmpireLineupCard
        isOpen={umpireCardModal}
        onClose={() => setUmpireCardModal(false)}
        gameData={gameData}
        gameInfo={gameInfo}
        roster={roster}
      />

      <GameSummaryModal
        isOpen={summaryModal}
        onClose={() => setSummaryModal(false)}
        gameData={gameData}
        gameInfo={gameInfo}
        roster={roster}
      />
    </>
  )
}

export default App
