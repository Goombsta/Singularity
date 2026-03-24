import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { FixedSizeList as List } from 'react-window'
import { usePlaylistStore } from '../stores/playlistStore'
import type { Channel } from '../types'

interface EditState {
  channelId: string
  field: 'name' | 'logo' | 'group'
  value: string
}

interface RowData {
  channels: Channel[]
  selected: Set<string>
  editing: EditState | null
  onToggleSelect: (id: string) => void
  onSetEditing: (e: EditState | null) => void
  onCommitEdit: () => void
  onReorder: (id: string, dir: 'up' | 'down' | 'top') => void
  onDelete: (id: string) => void
  isDragMode: boolean
}

function ChannelEditorRow({
  index,
  style,
  data,
  channel,
}: {
  index?: number
  style?: React.CSSProperties
  data: RowData
  channel?: Channel
}): JSX.Element {
  const ch = channel ?? data.channels[index!]
  const isSelected = data.selected.has(ch.id)
  const isEditing = data.editing?.channelId === ch.id && data.editing.field === 'name'

  return (
    <div style={style}>
      <div
        className="flex items-center gap-2 px-2 py-1 rounded-xl mx-2 group"
        style={{
          height: 48,
          background: isSelected ? 'rgba(91,127,166,0.08)' : 'transparent',
          border: isSelected ? '1px solid rgba(91,127,166,0.2)' : '1px solid transparent',
          cursor: data.isDragMode ? 'grab' : 'default',
        }}
      >
        {/* Checkbox */}
        <div
          className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 cursor-pointer"
          style={{
            border: '1.5px solid var(--border-hard)',
            background: isSelected ? 'var(--accent)' : 'transparent',
          }}
          onClick={() => data.onToggleSelect(ch.id)}
        >
          {isSelected && (
            <svg width="8" height="8" viewBox="0 0 8 8" stroke="white" strokeWidth="1.5" fill="none">
              <polyline points="1,4 3,6 7,2"/>
            </svg>
          )}
        </div>

        {/* Number */}
        <span className="text-xs w-7 text-right flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
          {ch.number || (index !== undefined ? index + 1 : '')}
        </span>

        {/* Logo */}
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: 'var(--bg-surface)', boxShadow: 'var(--shadow-raised-sm)' }}
        >
          {ch.logo ? (
            <img src={ch.logo} alt="" className="w-full h-full object-contain" loading="lazy" />
          ) : (
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)', fontSize: 9 }}>
              {ch.name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        {/* Name / group */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <input
              className="input text-sm py-0.5"
              value={data.editing!.value}
              autoFocus
              onChange={(e) => data.onSetEditing({ ...data.editing!, value: e.target.value })}
              onBlur={data.onCommitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') data.onCommitEdit()
                if (e.key === 'Escape') data.onSetEditing(null)
              }}
            />
          ) : (
            <p
              className="text-sm font-medium truncate cursor-text"
              style={{ color: 'var(--text-primary)' }}
              onDoubleClick={() => data.onSetEditing({ channelId: ch.id, field: 'name', value: ch.name })}
            >
              {ch.name}
            </p>
          )}
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{ch.group}</p>
        </div>

        {/* Actions — visible on hover (always visible on Android via CSS) */}
        <div className="channel-actions flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {/* Move to top */}
          <button
            className="btn-neu btn control-btn w-6 h-6"
            style={{ padding: 0 }}
            onClick={() => data.onReorder(ch.id, 'top')}
            title="Move to top"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="1" x2="9" y2="1"/>
              <polyline points="3,9 5,3 7,9"/>
            </svg>
          </button>

          {/* Move up */}
          <button
            className="btn-neu btn control-btn w-6 h-6"
            style={{ padding: 0 }}
            onClick={() => data.onReorder(ch.id, 'up')}
            title="Move up"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="2,6 5,3 8,6"/>
            </svg>
          </button>

          {/* Move down */}
          <button
            className="btn-neu btn control-btn w-6 h-6"
            style={{ padding: 0 }}
            onClick={() => data.onReorder(ch.id, 'down')}
            title="Move down"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="2,4 5,7 8,4"/>
            </svg>
          </button>

          {/* Rename */}
          <button
            className="btn-neu btn control-btn w-6 h-6"
            style={{ padding: 0 }}
            onClick={() => data.onSetEditing({ channelId: ch.id, field: 'name', value: ch.name })}
            title="Rename"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 9l2-2L8 2l-1-1L2 7 1 9z"/>
              <line x1="6" y1="2" x2="8" y2="4"/>
            </svg>
          </button>

          {/* Delete */}
          <button
            className="btn control-btn w-6 h-6 rounded-md"
            style={{ background: 'rgba(224,82,82,0.08)', color: 'var(--danger)', padding: 0 }}
            onClick={() => data.onDelete(ch.id)}
            title="Delete"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="1" y1="1" x2="9" y2="9"/>
              <line x1="9" y1="1" x2="1" y2="9"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// react-window item renderer wrapper
function VirtualChannelRow({
  index,
  style,
  data,
}: {
  index: number
  style: React.CSSProperties
  data: RowData
}): JSX.Element {
  return <ChannelEditorRow index={index} style={style} data={data} />
}

export default function PlaylistEditor(): JSX.Element {
  const {
    playlists,
    activePlaylistId,
    filteredChannels,
    activeGroup,
    groups,
    setActiveGroup,
    renameChannel,
    moveChannel,
    deleteChannel,
    updateChannelLogo,
    exportPlaylist,
    setSearchQuery,
    searchQuery,
    reorderChannels,
    renameGroup,
    reorderGroup,
    setGroupOrder,
    setGroupChannelOrder,
  } = usePlaylistStore()

  const playlist = playlists.find((p) => p.id === activePlaylistId)
  const [editing, setEditing] = useState<EditState | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkGroup, setBulkGroup] = useState('')
  const [showBulk, setShowBulk] = useState(false)
  const [groupSearch, setGroupSearch] = useState('')
  const [groupEditing, setGroupEditing] = useState<string | null>(null)
  const [groupEditValue, setGroupEditValue] = useState('')

  // Virtualized list sizing
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<List>(null)
  const [listHeight, setListHeight] = useState(400)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height
      if (h && h > 0) setListHeight(h)
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleBulkMove = () => {
    if (!bulkGroup) return
    selected.forEach((id) => moveChannel(id, bulkGroup))
    setSelected(new Set())
    setShowBulk(false)
  }

  const handleBulkDelete = () => {
    selected.forEach((id) => deleteChannel(id))
    setSelected(new Set())
  }

  const commitEdit = useCallback(() => {
    if (!editing) return
    if (editing.field === 'name') renameChannel(editing.channelId, editing.value)
    if (editing.field === 'logo') updateChannelLogo(editing.channelId, editing.value)
    if (editing.field === 'group') moveChannel(editing.channelId, editing.value)
    setEditing(null)
  }, [editing, renameChannel, updateChannelLogo, moveChannel])

  // Drag mode: enabled when viewing a specific group with ≤ 300 channels (not "All" or virtualized)
  const useDragList =
    activeGroup !== null &&
    activeGroup !== 'Favorites' &&
    filteredChannels.length <= 300 &&
    !searchQuery

  const itemData: RowData = {
    channels: filteredChannels,
    selected,
    editing,
    onToggleSelect: toggleSelect,
    onSetEditing: setEditing,
    onCommitEdit: commitEdit,
    onReorder: reorderChannels,
    onDelete: deleteChannel,
    isDragMode: useDragList,
  }

  // Draggable groups: all except Favorites (always pinned first)
  const draggableGroups = groups.filter((g) => g !== 'Favorites')
  const filteredDraggable = draggableGroups.filter(
    (g) => !groupSearch || g.toLowerCase().includes(groupSearch.toLowerCase())
  )
  const showFavorites = groups.includes('Favorites') &&
    (!groupSearch || 'favorites'.includes(groupSearch.toLowerCase()))

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-hard)' }}
      >
        <div>
          <h2 className="text-lg font-bold text-metallic" style={{ fontFamily: 'Syne', letterSpacing: '-0.03em' }}>
            Playlist Editor
          </h2>
          {playlist && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {playlist.channels.length.toLocaleString()} channels · {playlist.name}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              <motion.button
                className="btn-neu btn text-xs px-3 py-1.5"
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowBulk(true)}
              >
                Move {selected.size}
              </motion.button>
              <motion.button
                className="btn text-xs px-3 py-1.5 rounded-lg"
                style={{ background: 'rgba(224,82,82,0.1)', color: 'var(--danger)' }}
                whileTap={{ scale: 0.97 }}
                onClick={handleBulkDelete}
              >
                Delete {selected.size}
              </motion.button>
            </>
          )}
          <motion.button
            className="btn-primary btn text-xs px-3 py-1.5"
            whileTap={{ scale: 0.97 }}
            onClick={() => activePlaylistId && exportPlaylist(activePlaylistId)}
          >
            Export .m3u
          </motion.button>
        </div>
      </div>

      {/* Body: category column + channel list */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: category column */}
        <div
          className="flex flex-col flex-shrink-0 overflow-hidden"
          style={{ width: 260, borderRight: '1px solid var(--border-hard)', background: 'var(--bg-surface)' }}
        >
          {/* Group search */}
          <div className="px-2 pt-2 pb-1 flex-shrink-0">
            <div className="relative">
              <svg
                className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                width="10" height="10" viewBox="0 0 10 10" fill="none"
                stroke="var(--text-secondary)" strokeWidth="1.5"
              >
                <circle cx="4" cy="4" r="3"/><path d="M7 7l2 2"/>
              </svg>
              <input
                className="input text-xs"
                style={{ paddingLeft: 26, paddingTop: 5, paddingBottom: 5 }}
                placeholder="Search groups..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
              />
            </div>
          </div>

          <p className="px-3 py-0.5 text-xs font-semibold uppercase flex-shrink-0"
            style={{ letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
            Groups
          </p>

          {/* Group list */}
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {/* "All" — always pinned, not draggable */}
            <button
              className={`nav-item w-full text-left ${!activeGroup ? 'active' : ''}`}
              style={{ paddingLeft: 10, fontSize: 12 }}
              onClick={() => setActiveGroup(null)}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M1 2.5h9M1 5.5h6.5M1 8.5h7.5"/>
              </svg>
              <span className="flex-1 text-left">All</span>
            </button>

            {/* Favorites — pinned, not draggable */}
            {showFavorites && (
              <div className="group flex items-center gap-0.5 my-0.5">
                <button
                  className={`nav-item flex-1 min-w-0 text-left ${activeGroup === 'Favorites' ? 'active' : ''}`}
                  style={{ paddingLeft: 10, fontSize: 12 }}
                  onClick={() => setActiveGroup(activeGroup === 'Favorites' ? null : 'Favorites')}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill={activeGroup === 'Favorites' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" className="flex-shrink-0">
                    <path d="M5.5 1l1.2 2.5 2.8.4-2 2 .5 2.8L5.5 7.4l-2.5 1.3.5-2.8-2-2 2.8-.4L5.5 1z"/>
                  </svg>
                  <span className="truncate flex-1 text-left">Favorites</span>
                </button>
              </div>
            )}

            {/* Draggable groups */}
            <Reorder.Group
              axis="y"
              values={filteredDraggable}
              onReorder={(newOrder) => setGroupOrder(newOrder)}
              style={{ listStyle: 'none', padding: 0, margin: 0 }}
            >
              {filteredDraggable.map((g) => {
                const isActive = activeGroup === g
                const isEditingGroup = groupEditing === g
                return (
                  <Reorder.Item
                    key={g}
                    value={g}
                    style={{ listStyle: 'none' }}
                    whileDrag={{ scale: 1.02, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 50, borderRadius: 8 }}
                  >
                    <div className="group flex items-center gap-0.5 my-0.5">
                      <button
                        className={`nav-item flex-1 min-w-0 text-left ${isActive ? 'active' : ''}`}
                        style={{ paddingLeft: 10, fontSize: 12 }}
                        onClick={() => { if (!isEditingGroup) setActiveGroup(isActive ? null : g) }}
                      >
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.4" className="flex-shrink-0">
                          <path d="M1 2.5h9M1 5.5h6.5M1 8.5h7.5"/>
                        </svg>
                        {isEditingGroup ? (
                          <input
                            className="input text-xs py-0 flex-1 min-w-0"
                            style={{ height: 20, fontSize: 12 }}
                            value={groupEditValue}
                            autoFocus
                            onChange={(e) => setGroupEditValue(e.target.value)}
                            onBlur={() => { renameGroup(g, groupEditValue); setGroupEditing(null) }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { renameGroup(g, groupEditValue); setGroupEditing(null) }
                              if (e.key === 'Escape') setGroupEditing(null)
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span className="truncate flex-1 text-left">{g}</span>
                        )}
                      </button>

                      {/* Category action buttons — inline, always visible on Android (reorder hidden since drag handles it) */}
                      <div className="category-actions flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Reorder buttons — hidden on Android (drag replaces these) */}
                        <div className="category-reorder-btns flex gap-0.5">
                          {/* Move to top */}
                          <button
                            className="btn-neu btn control-btn w-5 h-5"
                            style={{ padding: 0 }}
                            onClick={() => reorderGroup(g, 'top')}
                            title="Move to top"
                          >
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <line x1="1" y1="1" x2="9" y2="1"/><polyline points="3,9 5,3 7,9"/>
                            </svg>
                          </button>
                          {/* Move up */}
                          <button
                            className="btn-neu btn control-btn w-5 h-5"
                            style={{ padding: 0 }}
                            onClick={() => reorderGroup(g, 'up')}
                            title="Move up"
                          >
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <polyline points="2,6 5,3 8,6"/>
                            </svg>
                          </button>
                          {/* Move down */}
                          <button
                            className="btn-neu btn control-btn w-5 h-5"
                            style={{ padding: 0 }}
                            onClick={() => reorderGroup(g, 'down')}
                            title="Move down"
                          >
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <polyline points="2,4 5,7 8,4"/>
                            </svg>
                          </button>
                        </div>
                        {/* Rename */}
                        <button
                          className="btn-neu btn control-btn w-5 h-5"
                          style={{ padding: 0 }}
                          onClick={() => { setGroupEditing(g); setGroupEditValue(g) }}
                          title="Rename"
                        >
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M1 9l2-2L8 2l-1-1L2 7 1 9z"/><line x1="6" y1="2" x2="8" y2="4"/>
                          </svg>
                        </button>
                      </div>{/* end category-actions */}
                    </div>
                  </Reorder.Item>
                )
              })}
            </Reorder.Group>
          </div>
        </div>

        {/* Right: channel list */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Search */}
          <div className="px-3 py-2 flex-shrink-0">
            <input
              className="input"
              placeholder="Search channels..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Count + drag hint */}
          <div className="px-4 pb-1 flex-shrink-0 flex items-center gap-2">
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {filteredChannels.length.toLocaleString()} channels
            </p>
            {useDragList && (
              <p className="text-xs" style={{ color: 'var(--text-secondary)', opacity: 0.6 }}>
                · drag to reorder
              </p>
            )}
          </div>

          {/* Channel list — drag mode (Reorder) or virtualized (react-window) */}
          <div ref={containerRef} className="flex-1 overflow-hidden">
            {useDragList ? (
              <Reorder.Group
                axis="y"
                values={filteredChannels}
                onReorder={(newChans) =>
                  setGroupChannelOrder(activeGroup!, newChans.map((c) => c.id))
                }
                className="overflow-y-auto h-full"
                style={{ listStyle: 'none', padding: 0, margin: 0, height: '100%' }}
              >
                {filteredChannels.map((ch) => (
                  <Reorder.Item
                    key={ch.id}
                    value={ch}
                    style={{ listStyle: 'none' }}
                    whileDrag={{ scale: 1.01, boxShadow: '0 4px 16px rgba(0,0,0,0.25)', zIndex: 50 }}
                  >
                    <ChannelEditorRow
                      channel={ch}
                      data={itemData}
                    />
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            ) : (
              <List
                ref={listRef}
                height={listHeight}
                itemCount={filteredChannels.length}
                itemSize={52}
                width="100%"
                itemData={itemData}
              >
                {VirtualChannelRow}
              </List>
            )}
          </div>
        </div>
      </div>

      {/* Bulk move modal */}
      <AnimatePresence>
        {showBulk && (
          <div className="overlay" onClick={() => setShowBulk(false)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="neu-raised p-6 w-80"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-bold mb-3" style={{ fontFamily: 'Syne' }}>Move to Group</h3>
              <select
                className="input mb-4"
                value={bulkGroup}
                onChange={(e) => setBulkGroup(e.target.value)}
              >
                <option value="">Select group...</option>
                {groups.filter((g) => g !== 'Favorites').map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <motion.button className="btn-primary btn text-sm flex-1" whileTap={{ scale: 0.97 }} onClick={handleBulkMove}>
                  Move
                </motion.button>
                <motion.button className="btn-neu btn text-sm flex-1" whileTap={{ scale: 0.97 }} onClick={() => setShowBulk(false)}>
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
