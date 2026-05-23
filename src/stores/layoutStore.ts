import { create } from 'zustand'
import { LayoutObject } from '@/types'

type LayoutStore = {
  layoutObjects: LayoutObject[]
  selectedObjectId: string | null
  snapToGrid: boolean
  gridSizeCm: number
  projectId: string | null
  isSaving: boolean
  lastSaved: Date | null
  selectedObjectIds: string[]   // the multi-select set

  addObject: (object: LayoutObject) => void
  addObjects: (objects: LayoutObject[]) => void
  updateObject: (id: string, changes: Partial<LayoutObject>) => void
  removeObject: (id: string) => void
  removeObjectWithChairs: (id: string) => void
  selectObject: (id: string | null) => void
  toggleSnapToGrid: () => void
  setGridSize: (sizeCm: number) => void
  setProjectId: (id: string) => void
  setLayoutObjects: (objects: LayoutObject[]) => void
  setIsSaving: (saving: boolean) => void
  setLastSaved: (date: Date) => void
  rotateObjectWithChairs: (id: string, newRotationDeg: number) => void
  setSelectedObjectIds: (ids: string[]) => void
  addToSelection: (id: string) => void
  moveSelection: (deltaX: number, deltaY: number) => void
  rotateSelection: (deltaDeg: number) => void
  deleteSelection: () => void
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  layoutObjects: [],
  selectedObjectId: null,
  snapToGrid: true,
  gridSizeCm: 50,
  projectId: null,
  isSaving: false,
  lastSaved: null,

  addObject: (object) =>
    set((state) => ({
      layoutObjects: [...state.layoutObjects, object]
    })),

  addObjects: (objects) =>
    set((state) => ({
      layoutObjects: [...state.layoutObjects, ...objects]
    })),

  updateObject: (id, changes) =>
    set((state) => ({
      layoutObjects: state.layoutObjects.map((obj) =>
        obj.id === id ? { ...obj, ...changes } : obj
      )
    })),

  removeObject: (id) =>
    set((state) => ({
      layoutObjects: state.layoutObjects.filter((obj) => obj.id !== id),
      selectedObjectId:
        state.selectedObjectId === id ? null : state.selectedObjectId
    })),

  removeObjectWithChairs: (id) =>
    set((state) => ({
      layoutObjects: state.layoutObjects.filter(
        (obj) => obj.id !== id && obj.isChairFor !== id
      ),
      selectedObjectId:
        state.selectedObjectId === id ? null : state.selectedObjectId
    })),

  // In the store implementation:
  selectedObjectIds: [],

  setSelectedObjectIds: (ids) => set({ selectedObjectIds: ids }),

  addToSelection: (id) =>
    set((state) => ({
      selectedObjectIds: state.selectedObjectIds.includes(id)
        ? state.selectedObjectIds.filter((i) => i !== id)
        : [...state.selectedObjectIds, id],
    })),

  moveSelection: (deltaX, deltaY) =>
    set((state) => ({
      layoutObjects: state.layoutObjects.map((obj) =>
        state.selectedObjectIds.includes(obj.id)
          ? { ...obj, positionCm: { x: obj.positionCm.x + deltaX, y: obj.positionCm.y + deltaY } }
          : obj
      ),
    })),

  rotateSelection: (deltaDeg) =>
    set((state) => {
      // Rotate all selected objects around their collective center
      const selected = state.layoutObjects.filter((o) =>
        state.selectedObjectIds.includes(o.id)
      )
      if (selected.length === 0) return state

      const cx = selected.reduce((s, o) => s + o.positionCm.x, 0) / selected.length
      const cy = selected.reduce((s, o) => s + o.positionCm.y, 0) / selected.length
      const rad = (deltaDeg * Math.PI) / 180

      return {
        layoutObjects: state.layoutObjects.map((obj) => {
          if (!state.selectedObjectIds.includes(obj.id)) return obj
          const dx = obj.positionCm.x - cx
          const dy = obj.positionCm.y - cy
          return {
            ...obj,
            positionCm: {
              x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
              y: cy + dx * Math.sin(rad) + dy * Math.cos(rad),
            },
            rotationDeg: obj.rotationDeg + deltaDeg,
          }
        }),
      }
    }),

  deleteSelection: () =>
    set((state) => {
      // Also delete any chairs that belong to selected tables
      const idsToDelete = new Set(state.selectedObjectIds)
      state.layoutObjects.forEach((obj) => {
        if (obj.isChairFor && idsToDelete.has(obj.isChairFor)) {
          idsToDelete.add(obj.id)
        }
      })
      return {
        layoutObjects: state.layoutObjects.filter((o) => !idsToDelete.has(o.id)),
        selectedObjectIds: [],
        selectedObjectId: null,
      }
    }),

  rotateObjectWithChairs: (id, newRotationDeg) =>
    set((state) => {
      const obj = state.layoutObjects.find((o) => o.id === id)
      if (!obj) return state

      const oldRotation = obj.rotationDeg
      const deltaRad = ((newRotationDeg - oldRotation) * Math.PI) / 180
      const tx = obj.positionCm.x
      const ty = obj.positionCm.y

      const updated = state.layoutObjects.map((o) => {
        if (o.id === id) return { ...o, rotationDeg: newRotationDeg }

        if (o.isChairFor === id) {
          const dx = o.positionCm.x - tx
          const dy = o.positionCm.y - ty
          const rotatedX = dx * Math.cos(deltaRad) - dy * Math.sin(deltaRad)
          const rotatedY = dx * Math.sin(deltaRad) + dy * Math.cos(deltaRad)
          return {
            ...o,
            positionCm: { x: tx + rotatedX, y: ty + rotatedY },
            rotationDeg: o.rotationDeg + (newRotationDeg - oldRotation),
          }
        }

        return o
      })

      return { layoutObjects: updated }
    }),

  selectObject: (id) => set({ selectedObjectId: id }),
  toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
  setGridSize: (sizeCm) => set({ gridSizeCm: sizeCm }),
  setProjectId: (id) => set({ projectId: id }),
  setLayoutObjects: (objects) => set({ layoutObjects: objects }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  setLastSaved: (date) => set({ lastSaved: date }),
}))