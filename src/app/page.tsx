'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createProject } from '@/lib/supabase/queries'

const VENUE_ID = '00000000-0000-0000-0000-000000000001'
const ROOM_ID = '00000000-0000-0000-0000-000000000002'

export default function Home() {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(false)

  const handleNewProject = async () => {
    setIsCreating(true)
    try {
      const project = await createProject(VENUE_ID, ROOM_ID)
      router.push(`/editor/${project.id}`)
    } catch (err) {
      console.error('Failed to create project:', err)
      setIsCreating(false)
    }
  }

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <div className="text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
            Venuria
          </h1>
          <p className="text-gray-400 text-sm">
            Plan your perfect event layout
          </p>
        </div>

        <button
          onClick={handleNewProject}
          disabled={isCreating}
          className="px-8 py-3 bg-gray-900 text-white rounded-xl text-sm
                     font-medium hover:bg-gray-700 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? 'Creating project...' : 'New Project'}
        </button>
      </div>
    </main>
  )
}