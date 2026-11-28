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

// Body of the "Table setting" section in the properties panel (the section title and
// item count live in the panel's collapsible header). Applying a template copies its
// items onto the table — or onto every eligible table in the current room; after that
// each table is edited on its own and never changes the others.

type Props = {
  object: LayoutObject
  /** Tables/chairs catalog the editor already loaded (for names). */
  catalogItems: DbCatalogItem[]
  /** Scoped items a table setting can use. */
  settingItems: DbCatalogItem[]
  templates: DbTableSettingTemplate[]
  onManageTemplates: () => void
}

function Stepper({ value, label, onChange }: { value: number; label: string; onChange: (next: number) => void }) {
  return (
    <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
      <button type="button" onClick={() => onChange(value - 1)} aria-label={`Fewer ${label}`}
        className="w-6 h-6 text-gray-500 hover:bg-gray-100 leading-none">−</button>
      <span className="w-6 text-center text-xs text-gray-800 tabular-nums">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} aria-label={`More ${label}`}
        className="w-6 h-6 text-gray-500 hover:bg-gray-100 leading-none">+</button>
    </div>
  )
}

export default function TableSettingSection({ object, catalogItems, settingItems, templates, onManageTemplates }: Props) {
  const { updateObject, layoutObjects } = useLayoutStore()
  const [templateId, setTemplateId] = useState('')

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
  }

  const available = settingItems.filter((i) => !lines.some((l) => l.catalogItemId === i.id))
  const grouped = groupByCategory(lines.map((l) => itemById.get(l.catalogItemId)!))
  const quantityOf = (id: string) => lines.find((l) => l.catalogItemId === id)?.quantity ?? 0

  return (
    <div className="space-y-3">
      {/* Apply a template */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400"
          >
            <option value="">{templates.length === 0 ? 'No templates yet' : 'Choose a template…'}</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button type="button" onClick={onManageTemplates} className="text-xs text-blue-600 hover:underline flex-shrink-0">
            Manage
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button" onClick={applyHere} disabled={!chosenTemplate}
            className="text-xs py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600"
          >
            Apply to this table
          </button>
          <button
            type="button" onClick={applyToAll} disabled={!chosenTemplate || targets.length === 0}
            title="Every table in this room except sweetheart, cocktail and tall tables, which are set one by one."
            className="text-xs py-1.5 rounded-lg border border-blue-600 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Apply to all ({targets.length})
          </button>
        </div>
        {isIndividualOnlyTable(tableName) && (
          <p className="text-[11px] text-gray-400">This table type is skipped by “Apply to all”.</p>
        )}
      </div>

      {/* This table's own setting */}
      {lines.length === 0 ? (
        <p className="text-xs text-gray-400">Nothing on this table yet.</p>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between text-[11px] text-gray-400">
            <span>{appliedFrom ? `From “${appliedFrom.name}”` : 'Custom setting'}</span>
            <span>Totals for {chairs} chair{chairs === 1 ? '' : 's'}</span>
          </div>
          {grouped.map(({ category, items }) => (
            <div key={category}>
              <p className="text-[11px] font-medium text-gray-500 mb-1">{TABLE_SETTING_CATEGORY_LABELS[category] ?? category}</p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const quantity = quantityOf(item.id)
                  const total = lineTotal({ catalogItemId: item.id, quantity }, item.scope, chairs)
                  return (
                    <li key={item.id} className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 text-xs text-gray-800 truncate" title={item.name}>{item.name}</span>
                      <Stepper value={quantity} label={item.name} onChange={(next) => changeQuantity(item.id, next)} />
                      <span className="w-12 text-right text-[11px] text-gray-400 tabular-nums">
                        {item.scope === 'per_seat' ? `×seat = ${total}` : `= ${total}`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <select
          value=""
          onChange={(e) => addItem(e.target.value)}
          disabled={available.length === 0}
          className="flex-1 min-w-0 text-xs border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-gray-500 focus:outline-none focus:border-blue-400"
        >
          <option value="">+ Add an item…</option>
          {groupByCategory(available).map(({ category, items }) => (
            <optgroup key={category} label={TABLE_SETTING_CATEGORY_LABELS[category] ?? category}>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </optgroup>
          ))}
        </select>
        {lines.length > 0 && (
          <button type="button" onClick={() => setItems([])} className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0">
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
