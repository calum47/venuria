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
  roomId: string      // which room this assignment belongs to
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

  // Assign a guest to a chair.
  // Clears: (a) whoever was previously in that chair, and
  //         (b) any other seat this guest already holds in the same room.
  // Does NOT clear the guest's seat in other rooms — cross-room assignment is intentional.
  assignGuest: (assignment: SeatAssignment) => void

  // Unassign a guest from all their seats (used when deleting a guest)
  unassignGuest: (guestId: string) => void

  // Unassign whoever is in a specific chair
  unassignChair: (layoutObjectId: string) => void

  // Helpers
  getGuestForChair: (layoutObjectId: string) => Guest | null

  // Returns the assignment for a guest in a specific room (null if not seated there)
  getAssignmentForGuestInRoom: (guestId: string, roomId: string) => SeatAssignment | null

  // Returns true if the guest already has a seat in the given room
  isGuestSeatedInRoom: (guestId: string, roomId: string) => boolean
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
        ...state.seatAssignments.filter((a) =>
          // Remove the previous occupant of this chair
          a.layoutObjectId !== assignment.layoutObjectId &&
          // Remove any other seat this guest already holds in the same room
          !(a.guestId === assignment.guestId && a.roomId === assignment.roomId)
        ),
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

  getAssignmentForGuestInRoom: (guestId, roomId) => {
    const { seatAssignments } = get()
    return seatAssignments.find((a) => a.guestId === guestId && a.roomId === roomId) ?? null
  },

  isGuestSeatedInRoom: (guestId, roomId) => {
    const { seatAssignments } = get()
    return seatAssignments.some((a) => a.guestId === guestId && a.roomId === roomId)
  },
}))