'use client'

import { useState } from 'react'
import type { DbCatalogItem, DbTableSettingTemplate } from '@/types/db'
import { createTemplate, deleteTemplate, updateTemplate } from '@/lib/supabase/tableSettingQueries'
import { groupByCategory, TABLE_SETTING_CATEGORY_LABELS } from '@/lib/tableSetting'

// Team-wide table-setting templates: create, edit, delete. Quantity 0 (or blank)
// leaves an item out. Changing a template never changes tables that already used
// it — they keep their own copy.

type Props = {
  /** Catalog items that carry a scope (plates, cutlery, glassware, candles, flowers, scoped decorations). */
  items: DbCatalogItem[]
  templates: DbTableSettingTemplate[]
  onClose: () => void
  /** Called after any create / update / delete so the editor reloads the list. */
  onChanged: () => Promise<void> | void
}

const NEW = 'new'

function quantitiesOf(template: DbTableSettingTemplate | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const row of template?.table_setting_template_items ?? []) out[row.catalog_item_id] = row.quantity
  return out
}

export default function TableSettingModal({ items, templates, onClose, onChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string>(templates[0]?.id ?? NEW)
  const selected = templates.find((t) => t.id === selectedId)
  const [name, setName] = useState(selected?.name ?? '')
  const [quantities, setQuantities] = useState<Record<string, number>>(quantitiesOf(selected))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const select = (id: string) => {
    const template = templates.find((t) => t.id === id)
    setSelectedId(id)
    setName(template?.name ?? '')
    setQuantities(quantitiesOf(template))
    setError(null)
  }

  const chosen = Object.entries(quantities).filter(([, q]) => q >= 1)

  const handleSave = async () => {
    if (!name.trim()) { setError('Give the template a name.'); return }
    if (chosen.length === 0) { setError('Add at least one item.'); return }
    setBusy(true)
    setError(null)
    try {
      const lines = chosen.map(([catalogItemId, quantity]) => ({ catalogItemId, quantity }))
      if (selectedId === NEW) {
        const id = await createTemplate(name, lines)
        await onChanged()
        setSelectedId(id)
      } else {
        await updateTemplate(selectedId, name, lines)
        await onChanged()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save.'
      setError(message.includes('duplicate key') ? 'A template with that name already exists.' : message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (selectedId === NEW) return
    if (!window.confirm(`Delete "${selected?.name}"? Tables that already use it keep their items.`)) return
    setBusy(true)
    setError(null)
    try {
      await deleteTemplate(selectedId)
      await onChanged()
      setSelectedId(NEW)
      setName('')
      setQuantities({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h2 className="font-semibold text-gray-800">Table setting templates</h2>
            <p className="text-xs text-gray-400 mt-0.5">Shared with your whole team. Per-seat items multiply by the chairs at each table.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="Close">×</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Template list */}
          <div className="w-52 border-r border-gray-200 p-3 space-y-1 overflow-y-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => select(t.id)}
                className={`w-full text-left text-sm px-2.5 py-1.5 rounded-lg truncate ${
                  selectedId === t.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {t.name}
              </button>
            ))}
            <button
              onClick={() => select(NEW)}
              className={`w-full text-left text-sm px-2.5 py-1.5 rounded-lg border border-dashed ${
                selectedId === NEW ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              + New template
            </button>
          </div>

          {/* Editor */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4">
            <input
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rustic dinner, Formal 3-glass"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400"
            />

            {items.length === 0 && <p className="text-sm text-gray-400">No table-setting items in the catalog yet.</p>}

            {groupByCategory(items).map(({ category, items: categoryItems }) => (
              <div key={category}>
                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">
                  {TABLE_SETTING_CATEGORY_LABELS[category] ?? category}
                </p>
                <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
                  {categoryItems.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                      <div className="min-w-0">
                        <span className="text-gray-800">{item.name}</span>
                        <span className="text-xs text-gray-400 ml-2">{item.scope === 'per_seat' ? 'per seat' : 'per table'}</span>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={quantities[item.id] ?? 0}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [item.id]: Math.min(50, Math.max(0, Math.floor(Number(e.target.value) || 0))) }))
                        }
                        className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-200">
          <div className="text-sm">
            {error ? <span className="text-red-600">{error}</span> : <span className="text-gray-400">{chosen.length} item{chosen.length === 1 ? '' : 's'} selected</span>}
          </div>
          <div className="flex gap-2">
            {selectedId !== NEW && (
              <button onClick={handleDelete} disabled={busy} className="text-sm text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 disabled:opacity-40">
                Delete
              </button>
            )}
            <button onClick={onClose} className="text-sm text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              Close
            </button>
            <button onClick={handleSave} disabled={busy} className="text-sm text-white bg-blue-600 rounded-lg px-3 py-1.5 hover:bg-blue-700 disabled:opacity-40">
              {busy ? 'Saving…' : selectedId === NEW ? 'Create template' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
