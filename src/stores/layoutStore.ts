import { create } from 'zustand'
import { LayoutObject } from '@/types'

type LayoutStore = {
  // Placed objects on the canvas
  layoutObjects: LayoutObject[]

  // Currently selected object id
  selectedObjectId: string | null

  // Grid snap toggle
  snapToGrid: boolean
  gridSizeCm: number  // how big each grid cell is in cm (default 50cm)

  // Actions
  addObject: (object: LayoutObject) => void
  updateObject: (id: string, changes: Partial<LayoutObject>) => void
  removeObject: (id: string) => void
  selectObject: (id: string | null) => void
  toggleSnapToGrid: () => void
  setGridSize: (sizeCm: number) => void
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  layoutObjects: [],
  selectedObjectId: null,
  snapToGrid: true,
  gridSizeCm: 50,

  addObject: (object) =>
    set((state) => ({
      layoutObjects: [...state.layoutObjects, object]
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

  selectObject: (id) => set({ selectedObjectId: id }),

  toggleSnapToGrid: () =>
    set((state) => ({ snapToGrid: !state.snapToGrid })),

  setGridSize: (sizeCm) => set({ gridSizeCm: sizeCm })
}))