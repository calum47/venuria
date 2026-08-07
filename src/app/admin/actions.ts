'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Creating a Venue is just a plain insert — no auth user involved. It's
 * covered entirely by the admin_manage_venues RLS policy, so this uses the
 * normal session-scoped client (not the service-role client). If someone
 * who isn't an admin ever called this, the insert itself would fail at the
 * database level regardless.
 */
export async function createVenue(formData: FormData) {
  const supabase = await createClient()

  const name = formData.get('name') as string
  const maxCapacityRaw = formData.get('maxCapacityPersons') as string

  if (!name) {
    return { error: 'Venue name is required.' }
  }

  const { error } = await supabase.from('venues').insert({
    name,
    max_capacity_persons: maxCapacityRaw ? Number(maxCapacityRaw) : null,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin')
  return { success: true }
}

/**
 * Same pattern as createVenue — plain insert covered by
 * admin_manage_rental_companies RLS, session-scoped client.
 */
export async function createRentalCompany(formData: FormData) {
  const supabase = await createClient()

  const name = formData.get('name') as string
  const contactEmail = formData.get('contactEmail') as string

  if (!name) {
    return { error: 'Rental company name is required.' }
  }

  const { error } = await supabase.from('rental_companies').insert({
    name,
    contact_email: contactEmail || null,
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/admin')
  return { success: true }
}
