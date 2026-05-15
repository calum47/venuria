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

  addObject: (object: LayoutObject) => void
  updateObject: (id: string, changes: Partial<LayoutObject>) => void
  removeObject: (id: string) => void
  selectObject: (id: string | null) => void
  toggleSnapToGrid: () => void
  setGridSize: (sizeCm: number) => void
  setProjectId: (id: string) => void
  setLayoutObjects: (objects: LayoutObject[]) => void
  setIsSaving: (saving: boolean) => void
  setLastSaved: (date: Date) => void
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
  toggleSnapToGrid: () => set((state) => ({ snapToGrid: !state.snapToGrid })),
  setGridSize: (sizeCm) => set({ gridSizeCm: sizeCm }),
  setProjectId: (id) => set({ projectId: id }),
  setLayoutObjects: (objects) => set({ layoutObjects: objects }),
  setIsSaving: (saving) => set({ isSaving: saving }),
  setLastSaved: (date) => set({ lastSaved: date }),
}))