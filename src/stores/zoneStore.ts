import { create } from 'zustand'
import type { ProjectZone, ObstacleShape } from '@/types'
import { ZONE_PRESETS, type ZonePreset, type ZoneTool } from '@/lib/zones'
import {
  getProjectZones,
  insertProjectZone,
  updateProjectZone,
  deleteProjectZone,
} from '@/lib/supabase/queries'

type ZoneState = {
  zones: ProjectZone[]            // zones for the room currently open in the editor
  zoneMode: boolean               // edit mode on/off — zones always render, this only gates editing
  zoneTool: ZoneTool
  selectedZoneId: string | null
  pendingPreset: ZonePreset       // what the NEXT drawn zone is named/coloured as
  isLoading: boolean

  loadZones: (projectId: string, roomId: string) => Promise<void>
  setZoneMode: (on: boolean) => void
  setZoneTool: (tool: ZoneTool) => void
  selectZone: (id: string | null) => void
  setPendingPreset: (preset: ZonePreset) => void

  createZone: (projectId: string, roomId: string, shape: ObstacleShape) => Promise<void>
  /** Local-only update, for live drag/resize feedback. Follow with persistZone. */
  updateZoneLocal: (id: string, patch: Partial<Pick<ProjectZone, 'name' | 'color' | 'shape'>>) => void
  /** Write the zone's current local state to the DB. */
  persistZone: (id: string) => Promise<void>
  /** Update + persist in one go — for panel edits (rename, recolour). */
  updateZone: (id: string, patch: Partial<Pick<ProjectZone, 'name' | 'color' | 'shape'>>) => Promise<void>
  deleteZone: (id: string) => Promise<void>
}

export const useZoneStore = create<ZoneState>((set, get) => ({
  zones: [],
  zoneMode: false,
  zoneTool: 'rect',
  selectedZoneId: null,
  pendingPreset: ZONE_PRESETS[0],
  isLoading: false,

  loadZones: async (projectId, roomId) => {
    set({ isLoading: true, selectedZoneId: null })
    try {
      const zones = await getProjectZones(projectId, roomId)
      set({ zones })
    } finally {
      set({ isLoading: false })
    }
  },

  setZoneMode: (on) => set({ zoneMode: on, selectedZoneId: on ? get().selectedZoneId : null }),
  setZoneTool: (tool) => set({ zoneTool: tool }),
  selectZone: (id) => set({ selectedZoneId: id }),
  setPendingPreset: (preset) => set({ pendingPreset: preset }),

  createZone: async (projectId, roomId, shape) => {
    const { pendingPreset, zones } = get()
    const created = await insertProjectZone({
      projectId,
      roomId,
      name: pendingPreset.name,
      color: pendingPreset.color,
      shape,
      sortOrder: zones.length,
    })
    set((s) => ({ zones: [...s.zones, created], selectedZoneId: created.id, zoneTool: 'select' }))
  },

  updateZoneLocal: (id, patch) =>
    set((s) => ({ zones: s.zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) })),

  persistZone: async (id) => {
    const zone = get().zones.find((z) => z.id === id)
    if (!zone) return
    await updateProjectZone(id, { name: zone.name, color: zone.color, shape: zone.shape })
  },

  updateZone: async (id, patch) => {
    get().updateZoneLocal(id, patch)
    await updateProjectZone(id, patch)
  },

  deleteZone: async (id) => {
    set((s) => ({
      zones: s.zones.filter((z) => z.id !== id),
      selectedZoneId: s.selectedZoneId === id ? null : s.selectedZoneId,
    }))
    await deleteProjectZone(id)
  },
}))
