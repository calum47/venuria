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