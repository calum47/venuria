/** Shown on project pages a Member opened through a Public project they are not assigned to. */
export default function ViewOnlyBanner() {
  return (
    <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span className="font-medium">View only.</span> This project is shared with the team but you are not assigned to it, so you can look but not change anything.
    </p>
  )
}
