import { useState, useEffect } from 'react'
import { db } from './firebase'
import { doc, setDoc, onSnapshot, collection, deleteDoc } from 'firebase/firestore'

const TEAM_NAME = 'Our Lady of Good Counsel 2026 JV Softball'
const FIELD_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
const INNINGS = [1, 2, 3, 4, 5, 6, 7]
const AUTH_KEY = 'jv-lineup-auth'
const EDIT_PASSWORD = 'bob2026'

const createDefaultRoster = () => ({
  players: [
    { id: 1, name: 'Player 1' },
    { id: 2, name: 'Player 2' },
    { id: 3, name: 'Player 3' },
    { id: 4, name: 'Player 4' },
    { id: 5, name: 'Player 5' },
    { id: 6, name: 'Player 6' },
    { id: 7, name: 'Player 7' },
    { id: 8, name: 'Player 8' },
    { id: 9, name: 'Player 9' },
  ],
  subs: [
    { id: 10, name: 'Sub 1' },
    { id: 11, name: 'Sub 2' },
    { id: 12, name: 'Sub 3' },
    { id: 13, name: 'Sub 4' },
    { id: 14, name: 'Sub 5' },
  ]
})

const loadAuthState = () => {
  try {
    return localStorage.getItem(AUTH_KEY) === 'true'
  } catch {
    return false
  }
}

const saveAuthState = (isAuthenticated) => {
  localStorage.setItem(AUTH_KEY, isAuthenticated ? 'true' : 'false')
}

// Re-entry tracking:
// - starters: Set of player IDs who started the game (can re-enter once to their original slot)
// - originalSlots: Maps player ID to their original batting slot (1-9)
// - reentryCount: Maps player ID to number of times they've re-entered (starters max 1)
// - subsRemovedFromBatting: Set of sub IDs who were in batting order and got subbed out (cannot re-enter)
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

// Password Modal Component
function PasswordModal({ isOpen, onClose, onSuccess }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (password === EDIT_PASSWORD) {
      saveAuthState(true)
      onSuccess()
      setPassword('')
      setError('')
    } else {
      setError('Incorrect password')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Enter Password to Edit</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }}
              placeholder="Enter password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800"
              autoFocus
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
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
            >
              Login
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

  const handlePlayerChange = (id, name) => {
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, name } : p))
  }

  const handleSubChange = (id, name) => {
    setSubs(prev => prev.map(p => p.id === id ? { ...p, name } : p))
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
            {players.map((player, index) => (
              <div key={player.id} className="flex items-center gap-2">
                <span className="w-6 text-sm text-gray-500">#{index + 1}</span>
                <input
                  type="text"
                  value={player.name}
                  onChange={(e) => handlePlayerChange(player.id, e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-gray-800"
                />
              </div>
            ))}
          </div>

          <h4 className="font-medium text-gray-800 mb-2">Substitutes (5)</h4>
          <div className="space-y-2">
            {subs.map((sub) => (
              <div key={sub.id} className="flex items-center gap-2">
                <span className="w-6 text-sm text-gray-500">S</span>
                <input
                  type="text"
                  value={sub.name}
                  onChange={(e) => handleSubChange(sub.id, e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-gray-800"
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

function SwapModal({ isOpen, onClose, currentPlayer, battingOrder, subs, originalSlots, starters, reentryCount, subsRemovedFromBatting, onSwap }) {
  if (!isOpen || !currentPlayer) return null

  const currentIndex = battingOrder.findIndex(p => p.id === currentPlayer.id)
  const isInBattingOrder = currentIndex !== -1
  const startersList = starters || []
  const reentryCountMap = reentryCount || {}
  const subsRemoved = subsRemovedFromBatting || []

  // Check if a player can enter a specific batting slot
  const canPlayerEnterSlot = (playerId, slot) => {
    const isStarter = startersList.includes(playerId)
    const playerOriginalSlot = originalSlots[playerId]
    const timesReentered = reentryCountMap[playerId] || 0
    const wasSubRemovedFromBatting = subsRemoved.includes(playerId)

    if (isStarter) {
      // Starters can re-enter once, only to their original slot
      if (timesReentered >= 1) return { canSwap: false, reason: 'Already re-entered once' }
      if (playerOriginalSlot && playerOriginalSlot !== slot) return { canSwap: false, reason: `Must enter slot #${playerOriginalSlot}` }
      return { canSwap: true, reason: null }
    } else {
      // Non-starters (subs)
      if (wasSubRemovedFromBatting) {
        return { canSwap: false, reason: 'Cannot re-enter (sub rule)' }
      }
      // Sub entering for first time - can enter any slot
      if (!playerOriginalSlot) return { canSwap: true, reason: null }
      // Sub was in batting order before - cannot re-enter
      return { canSwap: false, reason: 'Cannot re-enter (sub rule)' }
    }
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
    if (isStarter) {
      if (timesReentered >= 1) return 'Starter - already used re-entry'
      return `Starter - can re-enter slot #${originalSlots[currentPlayer.id]}`
    }
    if (wasSubRemovedFromBatting) {
      return 'Sub - cannot re-enter batting order'
    }
    return 'Sub - available to enter'
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

function GameSummaryModal({ isOpen, onClose, gameData, gameInfo }) {
  if (!isOpen) return null

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
                          <div className="font-medium">{player.name}</div>
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

function SaveGameModal({ isOpen, onClose, onSave, initialOpponent, initialDate }) {
  const [opponent, setOpponent] = useState(initialOpponent)
  const [date, setDate] = useState(initialDate)

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
        </div>
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(opponent, date)}
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

  // Initialize all roster players with zero stats
  if (roster) {
    [...roster.players, ...roster.subs].forEach(player => {
      playerStats[player.name] = { batting: 0, field: 0, total: 0 }
    })
  }

  INNINGS.forEach(inning => {
    const inningData = game.gameData[inning]
    if (!inningData) return

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
  })

  return Object.entries(playerStats)
    .map(([name, stats]) => ({
      name,
      ...stats,
      percentage: ((stats.total / 7) * 100).toFixed(1)
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

    savedGames.forEach(game => {
      INNINGS.forEach(inning => {
        const inningData = game.gameData[inning]
        if (!inningData) return

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
      })
    })

    const totalGames = savedGames.length
    const maxPossibleInnings = totalGames * 7

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
    (currentGameInfo.opponent ? calculateGameMetrics({ gameData: currentGameData }, roster) : [])

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

function InningSubsModal({ isOpen, onClose, gameData }) {
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900">Inning Substitutions</h3>
          <button
            onClick={onClose}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>

        <div className="p-4 space-y-4">
          {INNINGS.map(inning => {
            const { battingChanges, fieldChanges } = getInningChanges(gameData, inning, allPlayersMap)
            const hasChanges = battingChanges.length > 0 || fieldChanges.length > 0

            return (
              <div key={inning} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 font-bold text-white" style={{ backgroundColor: '#1e3a5f' }}>
                  Inning {inning}
                </div>
                <div className="p-3">
                  {inning === 1 ? (
                    <p className="text-gray-500 text-sm italic">Starting lineup</p>
                  ) : !gameData[inning] ? (
                    <p className="text-gray-400 text-sm italic">Not yet played</p>
                  ) : !hasChanges ? (
                    <p className="text-gray-500 text-sm italic">No changes from previous inning</p>
                  ) : (
                    <div className="space-y-2">
                      {battingChanges.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Batting Order</p>
                          {battingChanges.map((change, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm py-1 px-2 bg-amber-50 rounded mb-1">
                              <span className="font-bold text-amber-700">#{change.slot}</span>
                              <span className="text-green-700 font-medium">{change.playerIn.name}</span>
                              <span className="text-gray-400">←</span>
                              <span className="text-red-600 line-through">{change.playerOut.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {fieldChanges.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Field Positions</p>
                          {fieldChanges.map((change, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-sm py-1 px-2 bg-blue-50 rounded mb-1">
                              <span className="font-bold text-blue-700 w-8">{change.position}</span>
                              <span className="text-green-700 font-medium">{change.playerIn?.name || 'Empty'}</span>
                              <span className="text-gray-400">←</span>
                              <span className="text-red-600 line-through">{change.playerOut?.name || 'Empty'}</span>
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

function BattingOrderRow({ player, slot, position, onSwapClick, canEdit, isChanged, previousPlayer }) {
  const isEH = !position

  return (
    <div className={`flex items-center gap-2 p-3 rounded-lg border-2 shadow-sm ${isChanged ? 'border-green-400 bg-green-50' : 'border-amber-200 bg-white'}`}>
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
          onClick={onSwapClick}
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
      {canEdit ? (
        <select
          value={playerId || ''}
          onChange={(e) => onPositionChange(position, e.target.value ? parseInt(e.target.value) : null)}
          className={`text-xs mt-1 w-24 px-1 py-1.5 border-2 rounded bg-white text-gray-800 font-medium ${isChanged ? 'border-green-500' : 'border-amber-500'}`}
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
    </div>
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
  const [savedGames, setSavedGames] = useState([])
  const [gameInfo, setGameInfo] = useState({
    opponent: '',
    date: new Date().toISOString().split('T')[0]
  })
  const [currentGameId, setCurrentGameId] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(loadAuthState)
  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState('loading')

  const canEdit = isAuthenticated

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
        setGameInfo({ opponent: data.opponent || '', date: data.date || new Date().toISOString().split('T')[0] })
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

            // The person entering (fromSubs) - check if they're a starter re-entering
            const enteringIsStarter = newStarters.includes(fromSubs.id)
            if (enteringIsStarter) {
              // Starter re-entering - increment their re-entry count
              newReentryCount[fromSubs.id] = (newReentryCount[fromSubs.id] || 0) + 1
            } else {
              // Non-starter entering for first time - track their entry slot
              if (!newOriginalSlots[fromSubs.id]) {
                newOriginalSlots[fromSubs.id] = slot
              }
            }

            // The person leaving (fromBatting) - if NOT a starter, mark them as removed
            const leavingIsStarter = newStarters.includes(fromBatting.id)
            if (!leavingIsStarter && !newSubsRemovedFromBatting.includes(fromBatting.id)) {
              newSubsRemovedFromBatting.push(fromBatting.id)
            }

            newBattingOrder[battingIndex1] = { ...fromSubs }
            newSubs[subIndex2] = { ...fromBatting }

            Object.entries(newFieldAssignments).forEach(([pos, pid]) => {
              if (pid === fromBatting.id) {
                newFieldAssignments[pos] = fromSubs.id
              }
            })
          }
          else if (subIndex1 !== -1 && battingIndex2 !== -1) {
            // Someone on bench (player1/fromSubs) is replacing player in batting order (player2/fromBatting)
            const fromSubs = newSubs[subIndex1]
            const fromBatting = newBattingOrder[battingIndex2]
            const slot = battingIndex2 + 1

            // The person entering (fromSubs) - check if they're a starter re-entering
            const enteringIsStarter = newStarters.includes(fromSubs.id)
            if (enteringIsStarter) {
              // Starter re-entering - increment their re-entry count
              newReentryCount[fromSubs.id] = (newReentryCount[fromSubs.id] || 0) + 1
            } else {
              // Non-starter entering for first time - track their entry slot
              if (!newOriginalSlots[fromSubs.id]) {
                newOriginalSlots[fromSubs.id] = slot
              }
            }

            // The person leaving (fromBatting) - if NOT a starter, mark them as removed
            const leavingIsStarter = newStarters.includes(fromBatting.id)
            if (!leavingIsStarter && !newSubsRemovedFromBatting.includes(fromBatting.id)) {
              newSubsRemovedFromBatting.push(fromBatting.id)
            }

            newBattingOrder[battingIndex2] = { ...fromSubs }
            newSubs[subIndex1] = { ...fromBatting }

            Object.entries(newFieldAssignments).forEach(([pos, pid]) => {
              if (pid === fromBatting.id) {
                newFieldAssignments[pos] = fromSubs.id
              }
            })
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

  const handleSaveGame = async (opponent, date) => {
    if (!canEdit) return

    setSyncStatus('saving')
    const gameId = currentGameId || Date.now().toString()
    const game = {
      opponent,
      date,
      gameData: JSON.parse(JSON.stringify(gameData)),
      updatedAt: new Date().toISOString()
    }

    try {
      await setDoc(doc(db, 'games', gameId), game)
      setGameInfo({ opponent, date })
      setCurrentGameId(gameId)
      // Also update current game with new info
      syncCurrentGame(gameData, { opponent, date }, gameId)
      setSaveModal(false)
      setSyncStatus('synced')
    } catch (error) {
      console.error('Error saving game:', error)
      setSyncStatus('error')
    }
  }

  const handleLoadGame = (game) => {
    setGameData(game.gameData)
    setGameInfo({ opponent: game.opponent, date: game.date })
    setCurrentGameId(game.id)
    setCurrentInning(1)
    setSavedGamesModal(false)
    // Sync to all devices
    syncCurrentGame(game.gameData, { opponent: game.opponent, date: game.date }, game.id)
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
    const newGameInfo = { opponent: '', date: new Date().toISOString().split('T')[0] }
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
    setIsAuthenticated(false)
    saveAuthState(false)
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
    <div className="min-h-screen print:bg-white" style={{ backgroundColor: '#f8f6f0' }}>
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

        <div className="mb-4">
          <h2 className="text-lg font-bold mb-2" style={{ color: '#1e3a5f' }}>
            Inning {currentInning} - Field Positions
          </h2>
          {canEdit && <p className="text-sm text-gray-600 mb-2">Select a player for each position</p>}
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
          </h2>
          <div className="space-y-2">
            {currentData.battingOrder.map((player, index) => {
              const previousPlayer = previousInningData?.battingOrder[index]
              const isChanged = previousPlayer && previousPlayer.id !== player.id
              return (
                <BattingOrderRow
                  key={player.id}
                  player={player}
                  slot={index + 1}
                  position={getPlayerPosition(player.id)}
                  onSwapClick={() => setSwapModal({ isOpen: true, player })}
                  canEdit={canEdit}
                  isChanged={isChanged}
                  previousPlayer={isChanged ? previousPlayer : null}
                />
              )
            })}
          </div>
        </div>

        <div className="mt-6 mb-8">
          <h2 className="text-lg font-bold mb-3" style={{ color: '#1e3a5f' }}>
            Substitutes
          </h2>
          <div className="space-y-2">
            {currentData.subs.map(sub => {
              const fieldPosition = Object.entries(currentData.fieldAssignments)
                .find(([, pid]) => pid === sub.id)?.[0]

              return (
                <div
                  key={sub.id}
                  className="flex items-center gap-2 px-3 py-3 bg-white border-2 border-amber-200 rounded-lg shadow-sm"
                >
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
                      onClick={() => setSwapModal({ isOpen: true, player: sub })}
                      className="px-3 py-1.5 text-white rounded text-sm hover:opacity-90 transition-colors font-medium shadow"
                      style={{ backgroundColor: '#1e3a5f' }}
                    >
                      Swap
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
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
      />

      <GameSummaryModal
        isOpen={summaryModal}
        onClose={() => setSummaryModal(false)}
        gameData={gameData}
        gameInfo={gameInfo}
      />

      <SaveGameModal
        isOpen={saveModal}
        onClose={() => setSaveModal(false)}
        onSave={handleSaveGame}
        initialOpponent={gameInfo.opponent}
        initialDate={gameInfo.date}
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

      <InningSubsModal
        isOpen={inningSubsModal}
        onClose={() => setInningSubsModal(false)}
        gameData={gameData}
      />
    </div>
  )
}

export default App
