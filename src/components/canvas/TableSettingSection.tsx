'use client'

import { useState } from 'react'
import { useLayoutStore } from '@/stores/layoutStore'
import type { LayoutObject, TableSettingItem } from '@/types'
import type { DbCatalogItem, DbTableSettingTemplate } from '@/types/db'
import {
  bulkApplyTargets,
  chairsAtTable,
  cloneItems,
  groupByCategory,
  isIndividualOnlyTable,
  lineTotal,
  TABLE_SETTING_CATEGORY_LABELS,
} from '@/lib/tableSetting'

// "Table setting" block in the properties panel. Applying a template copies its
// items onto the table (or onto every eligible table in the current room); after
// that each table is edited on its own and never changes the others.

type Props = {
  object: LayoutObject
  /** Tables/chairs catalog the editor already loaded (for names). */
  catalogItems: DbCatalogItem[]
  /** Scoped items a table setting can use. */
  settingItems: DbCatalogItem[]
  templates: DbTableSettingTemplate[]
  onManageTemplates: () => void
}

export default function TableSettingSection({ object, catalogItems, settingItems, templates, onManageTemplates }: Props) {
  const { updateObject, layoutObjects } = useLayoutStore()
  const [templateId, setTemplateId] = useState('')
  const [adding, setAdding] = useState('')

  const itemById = new Map(settingItems.map((i) => [i.id, i]))
  const tableName = catalogItems.find((i) => i.id === object.catalogItemId)?.name
  const chairs = chairsAtTable(object.id, layoutObjects)
  const setting = object.tableSetting
  const lines = (setting?.items ?? []).filter((l) => itemById.has(l.catalogItemId))
  const appliedFrom = templates.find((t) => t.id === setting?.templateId)

  const targets = bulkApplyTargets(layoutObjects, catalogItems)
  const chosenTemplate = templates.find((t) => t.id === templateId)

  const itemsOf = (template: DbTableSettingTemplate): TableSettingItem[] =>
    template.table_setting_template_items
      .filter((row) => itemById.has(row.catalog_item_id))
      .map((row) => ({ catalogItemId: row.catalog_item_id, quantity: row.quantity }))

  const applyHere = () => {
    if (!chosenTemplate) return
    if (lines.length > 0 && !window.confirm('Replace this table’s current setting?')) return
    updateObject(object.id, { tableSetting: { templateId: chosenTemplate.id, items: cloneItems(itemsOf(chosenTemplate)) } })
  }

  const applyToAll = () => {
    if (!chosenTemplate || targets.length === 0) return
    const overwriting = targets.filter((t) => (t.tableSetting?.items.length ?? 0) > 0).length
    const message = overwriting > 0
      ? `Apply "${chosenTemplate.name}" to ${targets.length} tables in this room? ${overwriting} already have a setting, which will be replaced.`
      : `Apply "${chosenTemplate.name}" to ${targets.length} tables in this room?`
    if (!window.confirm(message)) return
    for (const t of targets) {
      updateObject(t.id, { tableSetting: { templateId: chosenTemplate.id, items: cloneItems(itemsOf(chosenTemplate)) } })
    }
  }

  // Any manual edit makes this table "Custom" (templateId dropped); other tables are untouched.
  const setItems = (items: TableSettingItem[]) =>
    updateObject(object.id, { tableSetting: items.length > 0 ? { items } : undefined })

  const changeQuantity = (catalogItemId: string, quantity: number) => {
    const q = Math.min(50, Math.max(0, Math.floor(quantity) || 0))
    setItems(lines.map((l) => (l.catalogItemId === catalogItemId ? { ...l, quantity: q } : l)).filter((l) => l.quantity >= 1))
  }

  const addItem = (catalogItemId: string) => {
    if (!catalogItemId || lines.some((l) => l.catalogItemId === catalogItemId)) return
    setItems([...cloneItems(lines), { catalogItemId, quantity: 1 }])
    setAdding('')
  }

  const available = settingItems.filter((i) => !lines.some((l) => l.catalogItemId === i.id))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Table setting</p>
        <button onClick={onManageTemplates} className="text-xs text-blue-600 hover:underline">Templates</button>
      </div>

      <p className="text-xs text-gray-400">
        {lines.length === 0 ? 'No setting yet' : appliedFrom ? `From “${appliedFrom.name}”` : 'Custom'}
        {' · '}{chairs} chair{chairs === 1 ? '' : 's'}
      </p>

      {/* Apply a template */}
      <div className="space-y-1.5">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:border-blue-400"
        >
          <option value="">{templates.length === 0 ? 'No templates yet' : 'Choose a template…'}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={applyHere}
            disabled={!chosenTemplate}
            className="text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            This table
          </button>
          <button
            onClick={applyToAll}
            disabled={!chosenTemplate || targets.length === 0}
            className="text-xs py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            All ({targets.length})
          </button>
        </div>
        <p className="text-[11px] text-gray-400">
          “All” covers the tables in this room except sweetheart, cocktail and tall tables — set those one by one.
          {isIndividualOnlyTable(tableName) && ' This is one of them.'}
        </p>
      </div>

      {/* This table's own lines */}
      {lines.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {lines.map((line) => {
            const item = itemById.get(line.catalogItemId)!
            const total = lineTotal(line, item.scope, chairs)
            return (
              <li key={line.catalogItemId} className="px-2 py-1.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-gray-800 truncate">{item.name}</span>
                  <button onClick={() => changeQuantity(line.catalogItemId, 0)} className="text-gray-300 hover:text-red-500" aria-label={`Remove ${item.name}`}>×</button>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={line.quantity}
                    onChange={(e) => changeQuantity(line.catalogItemId, Number(e.target.value))}
                    className="w-12 border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-blue-400"
                  />
                  <span className="text-gray-400">{item.scope === 'per_seat' ? 'per seat' : 'per table'}</span>
                  <span className="ml-auto text-gray-600">= {total}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Add a single item */}
      <select
        value={adding}
        onChange={(e) => addItem(e.target.value)}
        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-500 focus:outline-none focus:border-blue-400"
      >
        <option value="">+ Add item…</option>
        {groupByCategory(available).map(({ category, items }) => (
          <optgroup key={category} label={TABLE_SETTING_CATEGORY_LABELS[category] ?? category}>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </optgroup>
        ))}
      </select>

      {lines.length > 0 && (
        <button onClick={() => setItems([])} className="text-xs text-gray-400 hover:text-red-500">Clear setting</button>
      )}
    </div>
  )
}
