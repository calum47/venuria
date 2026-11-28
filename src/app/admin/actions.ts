'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'

/**
 * Creating a Venue is just a plain insert — no auth user involved. It's
 * covered entirely by the admin_manage_venues RLS policy, so this uses the
 * normal session-scoped client (not the service-role client). If someone
 * who isn't an admin ever called this, the insert itself would fail at the
 * database level regardless.
 */
export async function createVenue(formData: FormData) {
  const t = await getTranslations('Errors')
  const supabase = await createClient()

  const name = formData.get('name') as string
  const maxCapacityRaw = formData.get('maxCapacityPersons') as string

  if (!name) {
    return { error: t('venueNameIsRequired') }
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
  const t = await getTranslations('Errors')
  const supabase = await createClient()

  const name = formData.get('name') as string
  const contactEmail = formData.get('contactEmail') as string

  if (!name) {
    return { error: t('rentalCompanyNameIsRequired') }
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

/**
 * Makes an existing planner also a Vendor: creates the vendor's company and links it to the planner's own login
 * (a rental_managers row with the planner's user id), so one login has both roles and can switch between them.
 * Admin only, by the admin_manage_* RLS policies (same pattern as createRentalCompany).
 */
export async function addVendorRole(formData: FormData) {
  const t = await getTranslations('Errors')
  const supabase = await createClient()

  const plannerId = formData.get('plannerId') as string
  const companyName = ((formData.get('companyName') as string) ?? '').trim()
  if (!plannerId) return { error: t('chooseThePlanner') }
  if (!companyName) return { error: t('vendorCompanyNameIsRequired') }

  const { data: planner } = await supabase.from('planners').select('id, user_id, name, email').eq('id', plannerId).maybeSingle()
  if (!planner) return { error: t('thatPlannerWasNotFound') }

  const { data: existing } = await supabase.from('rental_managers').select('id').eq('user_id', planner.user_id).maybeSingle()
  if (existing) return { error: t('nameIsAlreadyLinkedTo', { name: planner.name }) }

  const { data: company, error: cErr } = await supabase
    .from('rental_companies')
    .insert({ name: companyName, contact_email: planner.email || null })
    .select('id')
    .single()
  if (cErr || !company) return { error: cErr?.message ?? t('couldNotCreateTheCompany') }

  const { error: mErr } = await supabase
    .from('rental_managers')
    .insert({ rental_company_id: company.id, user_id: planner.user_id, name: planner.name, email: planner.email })
  if (mErr) {
    // Don't leave a company nobody manages behind.
    await supabase.from('rental_companies').delete().eq('id', company.id)
    return { error: mErr.message }
  }

  revalidatePath('/admin')
  return { success: true }
}
