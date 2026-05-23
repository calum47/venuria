import { create } from 'zustand'

export type Guest = {
  id: string
  projectId: string
  name: string
  notes: string | null
  createdAt: string
}

export type SeatAssignment = {
  id: string
  projectId: string
  guestId: string
  layoutObjectId: string
}

type GuestStore = {
  guests: Guest[]
  seatAssignments: SeatAssignment[]
  isGuestMode: boolean

  setGuests: (guests: Guest[]) => void
  setSeatAssignments: (assignments: SeatAssignment[]) => void
  addGuest: (guest: Guest) => void
  removeGuest: (guestId: string) => void
  toggleGuestMode: () => void
  setGuestMode: (on: boolean) => void

  // Assign a guest to a chair — replaces any existing assignment for that guest or chair
  assignGuest: (assignment: SeatAssignment) => void
  // Unassign a guest from their current seat
  unassignGuest: (guestId: string) => void
  // Unassign whoever is in a specific chair
  unassignChair: (layoutObjectId: string) => void

  // Helpers
  getGuestForChair: (layoutObjectId: string) => Guest | null
  getAssignmentForGuest: (guestId: string) => SeatAssignment | null
}

export const useGuestStore = create<GuestStore>((set, get) => ({
  guests: [],
  seatAssignments: [],
  isGuestMode: false,

  setGuests: (guests) => set({ guests }),
  setSeatAssignments: (seatAssignments) => set({ seatAssignments }),

  addGuest: (guest) =>
    set((state) => ({ guests: [...state.guests, guest] })),

  removeGuest: (guestId) =>
    set((state) => ({
      guests: state.guests.filter((g) => g.id !== guestId),
      seatAssignments: state.seatAssignments.filter((a) => a.guestId !== guestId),
    })),

  toggleGuestMode: () => set((state) => ({ isGuestMode: !state.isGuestMode })),
  setGuestMode: (on) => set({ isGuestMode: on }),

  assignGuest: (assignment) =>
    set((state) => ({
      seatAssignments: [
        // Only remove whoever was previously in THIS chair, not all assignments for this guest
        ...state.seatAssignments.filter((a) => a.layoutObjectId !== assignment.layoutObjectId),
        assignment,
      ],
    })),

  unassignGuest: (guestId) =>
    set((state) => ({
      seatAssignments: state.seatAssignments.filter((a) => a.guestId !== guestId),
    })),

  unassignChair: (layoutObjectId) =>
    set((state) => ({
      seatAssignments: state.seatAssignments.filter((a) => a.layoutObjectId !== layoutObjectId),
    })),

  getGuestForChair: (layoutObjectId) => {
    const { guests, seatAssignments } = get()
    const assignment = seatAssignments.find((a) => a.layoutObjectId === layoutObjectId)
    if (!assignment) return null
    return guests.find((g) => g.id === assignment.guestId) ?? null
  },

  getAssignmentForGuest: (guestId) => {
    const { seatAssignments } = get()
    return seatAssignments.find((a) => a.guestId === guestId) ?? null
  },
}))