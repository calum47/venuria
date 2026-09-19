'use client'

import { useMemo, useState } from 'react'
import type { DbStockGroup, DbStockItem } from '@/types/db'
import {
  createStockGroup,
  deleteStockGroup,
  createStockItem,
  updateStockItem,
  deleteStockItem,
  uploadStockPhoto,
  type StockItemInput,
} from '@/lib/supabase/stockQueries'
import { money } from './StockApp'

type Props = {
  teamId: string
  currency: string
  items: DbStockItem[]
  groups: DbStockGroup[]
  onItemsChanged: () => void
  onGroupsChanged: () => void
}

export default function CatalogueTab({ teamId, currency, items, groups, onItemsChanged, onGroupsChanged }: Props) {
  const [activeGroup, setActiveGroup] = useState<string | 'all'>('all')
  const [editing, setEditing] = useState<DbStockItem | 'new' | null>(null)
  const [newGroupName, setNewGroupName] = useState('')

  const visible = activeGroup === 'all' ? items : items.filter((i) => i.group_id === activeGroup)
  const groupName = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups])

  const addGroup = async () => {
    const name = newGroupName.trim()
    if (!name) return
    setNewGroupName('')
    await createStockGroup(teamId, name)
    onGroupsChanged()
  }

  const removeGroup = async (id: string) => {
    if (!confirm('Remove this group? Items keep their data and become ungrouped.')) return
    if (activeGroup === id) setActiveGroup('all')
    await deleteStockGroup(id)
    onGroupsChanged()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={activeGroup === 'all'} onClick={() => setActiveGroup('all')}>
          All ({items.length})
        </Chip>
        {groups.map((g) => (
          <div key={g.id} className="group relative">
            <Chip active={activeGroup === g.id} onClick={() => setActiveGroup(g.id)}>
              {g.name} ({items.filter((i) => i.group_id === g.id).length})
            </Chip>
            <button
              onClick={() => removeGroup(g.id)}
              title="Remove group"
              className="absolute -right-1 -top-1 hidden group-hover:flex w-3.5 h-3.5 items-center justify-center rounded-full bg-gray-400 text-white text-[9px] leading-none"
            >
              ✕
            </button>
          </div>
        ))}
        <input
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addGroup()}
          placeholder="+ group"
          className="w-20 text-xs px-2 py-1 rounded-full border border-dashed border-gray-300 text-gray-500 focus:outline-none"
        />
        <button
          onClick={() => setEditing('new')}
          className="ml-auto rounded-lg bg-gray-900 text-white text-sm px-3 py-1.5 hover:bg-gray-800"
        >
          + Add product
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No products {activeGroup === 'all' ? 'yet' : 'in this group'}.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {visible.map((item) => (
            <ItemCard key={item.id} item={item} currency={currency} groupName={groupName.get(item.group_id ?? '')} onClick={() => setEditing(item)} />
          ))}
        </div>
      )}

      {editing && (
        <EditProductModal
          teamId={teamId}
          groups={groups}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onItemsChanged() }}
          onDeleted={() => { setEditing(null); onItemsChanged() }}
        />
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1 rounded-full border transition-colors ${
        active ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  )
}

function ItemCard({
  item,
  currency,
  groupName,
  onClick,
}: {
  item: DbStockItem
  currency: string
  groupName: string | undefined
  onClick: () => void
}) {
  const margin = item.sell_price > 0 ? ((item.sell_price - item.cost_price) / item.sell_price) * 100 : 0
  const low = !item.on_demand && item.current_stock <= item.min_stock_alert

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-gray-100 bg-white p-3 hover:border-gray-300 transition-colors space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <Icon item={item} />
        {item.on_demand ? (
          <span className="text-[10px] uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">On Demand</span>
        ) : (
          <span className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${low ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 text-gray-400'}`}>
            {item.current_stock} in stock
          </span>
        )}
      </div>
      <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{money(item.sell_price, currency)}</span>
        <span>{margin.toFixed(0)}% margin</span>
      </div>
      {groupName && <p className="text-[10px] text-gray-400">{groupName}</p>}
    </button>
  )
}

function Icon({ item }: { item: DbStockItem }) {
  if (item.icon_type === 'photo' && item.icon_value) {
    // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
    return <img src={item.icon_value} alt="" className="w-8 h-8 rounded-lg object-cover" />
  }
  return (
    <span className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-lg">
      {item.icon_value || '📦'}
    </span>
  )
}

// ─── Edit Product modal ────────────────────────────────────────────────────────

function EditProductModal({
  teamId,
  groups,
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  teamId: string
  groups: DbStockGroup[]
  item: DbStockItem | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [groupId, setGroupId] = useState(item?.group_id ?? '')
  const [iconType, setIconType] = useState<'emoji' | 'photo'>(item?.icon_type ?? 'emoji')
  const [emoji, setEmoji] = useState(item?.icon_type === 'emoji' ? item?.icon_value ?? '' : '')
  const [photoUrl, setPhotoUrl] = useState(item?.icon_type === 'photo' ? item?.icon_value ?? null : null)
  const [costPrice, setCostPrice] = useState(String(item?.cost_price ?? ''))
  const [sellPrice, setSellPrice] = useState(String(item?.sell_price ?? ''))
  const [minStockAlert, setMinStockAlert] = useState(String(item?.min_stock_alert ?? 0))
  const [onDemand, setOnDemand] = useState(item?.on_demand ?? false)
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return
    setIsUploading(true)
    setError(null)
    try {
      const url = await uploadStockPhoto(teamId, file)
      setPhotoUrl(url)
      setIconType('photo')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.')
    } finally {
      setIsUploading(false)
    }
  }

  const save = async () => {
    setError(null)
    if (!name.trim()) return setError('Name is required.')
    const cost = Number(costPrice)
    const sell = Number(sellPrice)
    if (Number.isNaN(cost) || Number.isNaN(sell)) return setError('Prices must be numbers.')

    const input: Omit<StockItemInput, 'teamId'> = {
      groupId: groupId || null,
      name: name.trim(),
      iconType,
      iconValue: iconType === 'photo' ? photoUrl : emoji.trim() || null,
      costPrice: cost,
      sellPrice: sell,
      minStockAlert: Number(minStockAlert) || 0,
      onDemand,
      notes: notes.trim() || null,
    }

    setIsSaving(true)
    try {
      if (item) await updateStockItem(item.id, input)
      else await createStockItem({ teamId, ...input })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save.')
    } finally {
      setIsSaving(false)
    }
  }

  const remove = async () => {
    if (!item) return
    if (!confirm(`Delete "${item.name}"? This also removes its purchase/sale/order history.`)) return
    setIsSaving(true)
    try {
      await deleteStockItem(item.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete.')
      setIsSaving(false)
    }
  }

  const input = 'w-full rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-900'
  const label = 'text-xs text-gray-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-xl shadow-xl w-[26rem] max-h-[85vh] overflow-y-auto p-6 space-y-4">
        <h3 className="font-semibold text-gray-900">{item ? 'Edit product' : 'Add product'}</h3>

        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center text-2xl overflow-hidden shrink-0">
            {iconType === 'photo' && photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              emoji || '📦'
            )}
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex gap-1 text-xs">
              <button onClick={() => setIconType('emoji')} className={`px-2 py-0.5 rounded ${iconType === 'emoji' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Emoji</button>
              <button onClick={() => setIconType('photo')} className={`px-2 py-0.5 rounded ${iconType === 'photo' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>Photo</button>
            </div>
            {iconType === 'emoji' ? (
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="📦" maxLength={4} className={input} />
            ) : (
              <input type="file" accept="image/*" onChange={(e) => handlePhoto(e.target.files?.[0])} disabled={isUploading} className="text-xs" />
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className={label}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>

        <div className="space-y-1">
          <label className={label}>Group</label>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={input}>
            <option value="">Ungrouped</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={label}>Cost price</label>
            <input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className={input} />
          </div>
          <div className="space-y-1">
            <label className={label}>Sell price</label>
            <input type="number" step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className={input} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={onDemand} onChange={(e) => setOnDemand(e.target.checked)} className="rounded border-gray-300" />
          On Demand (made to order — no stock count, routed through Orders instead of Purchases/Sales)
        </label>

        {!onDemand && (
          <div className="space-y-1">
            <label className={label}>Low-stock alert threshold</label>
            <input type="number" value={minStockAlert} onChange={(e) => setMinStockAlert(e.target.value)} className={input} />
          </div>
        )}

        <div className="space-y-1">
          <label className={label}>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={input} />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          {item && (
            <button onClick={remove} disabled={isSaving} className="text-sm text-red-500 hover:text-red-700 mr-auto">
              Delete
            </button>
          )}
          <button onClick={onClose} className="py-2 px-3 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={save} disabled={isSaving || isUploading} className="py-2 px-4 text-sm font-medium text-white bg-gray-900 rounded-lg disabled:opacity-40 hover:bg-gray-800">
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
