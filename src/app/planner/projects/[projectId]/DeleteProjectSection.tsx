'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteProject } from '@/app/planner/projectDelete'

/** "Danger zone" at the bottom of the project hub. Deleting is permanent and needs the title typed in. */
export default function DeleteProjectSection({ projectId, title }: { projectId: string; title: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const matches = typed.trim().toLowerCase() === title.trim().toLowerCase()

  const submit = () => {
    setError(null)
    const fd = new FormData()
    fd.set('projectId', projectId)
    fd.set('confirm', typed)
    startTransition(async () => {
      const r = await deleteProject(fd)
      if (r.error) setError(r.error)
      else router.push('/planner')
    })
  }

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5" aria-labelledby="danger-h">
      <h2 id="danger-h" className="text-base font-medium text-red-800">Delete this project</h2>
      <p className="mt-1 text-sm text-gray-600">
        Removes the project for good: floor plan, guest list, RSVP answers, payments, documents, timetable and uploaded photos. This cannot be undone.
      </p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
          Delete project…
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-sm text-gray-700">
            Type <strong>{title}</strong> to confirm
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className="mt-1 block w-full max-w-sm rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900"
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={submit} disabled={!matches || isPending} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-40">
              {isPending ? 'Deleting…' : 'Delete permanently'}
            </button>
            <button type="button" onClick={() => { setOpen(false); setTyped(''); setError(null) }} className="text-sm text-gray-500 hover:text-gray-800">Cancel</button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </section>
  )
}
