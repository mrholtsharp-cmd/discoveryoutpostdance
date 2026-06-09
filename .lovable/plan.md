## Goal
Create a focused admin page for browsing registrations with search, filters, and pagination — moving beyond the simple unpaginated table currently embedded on `/admin`.

## New route
- `src/routes/_authenticated/admin.registrations.tsx` → `/admin/registrations`
- Add a link from the existing `/admin` dashboard ("View all registrations").

## Server function (new)
Add `searchRegistrations` in `src/lib/registrations.functions.ts`:
- Admin-only (same `has_role` check pattern).
- Input: `{ search?: string, desired_class?: string, experience_level?: string, is_trial?: "all"|"yes"|"no", date_from?: string, date_to?: string, page: number, page_size: number, sort: "newest"|"oldest" }`.
- Uses `count: "exact"` + `.range()` for pagination.
- `search` matches across `student_name`, `parent_name`, `email`, `phone` (ilike OR).
- Returns `{ rows, total, page, page_size }`.

Keep the existing `listRegistrations` for backward compatibility.

## Page UI
Single-card layout with:
- **Filters bar (sticky top of card)**
  - Search input (debounced ~300ms): name / email / phone.
  - Class select: All / Tap / Jazz / Ballet / Musical Theater.
  - Level select: All / Beginner / Intermediate / Advanced.
  - Trial select: All / Trial only / Non-trial.
  - Date range: from / to (native date inputs).
  - Sort: Newest / Oldest.
  - "Clear filters" button.
- **Results table** (same columns as today, plus emergency contact + medical notes accessible via expand row or tooltip — keep it simple: just add a "Details" expandable row toggled per-row).
- **Pagination footer**: "Showing X–Y of Z", Prev / Next, page size select (25 / 50 / 100).
- Empty state and loading skeleton.

## URL state
All filter + pagination state lives in URL search params via `validateSearch` + `zodValidator` + `fallback`, so the page is shareable/bookmarkable and back/forward works. Reading via `Route.useSearch()`, updates via `useNavigate` with function-form `search`. Use `loaderDeps` to pass the relevant subset into the query key.

## Data fetching
- `queryOptions({ queryKey: ["registrations", deps], queryFn: () => searchRegistrations({ data: deps }) })`.
- Loader: `context.queryClient.ensureQueryData(...)`.
- Component: `useSuspenseQuery`.
- `errorComponent` + `notFoundComponent` on the route.

## Out of scope
- No CSV export (can add later).
- No row editing/deleting (admin can still delete via DB; not requested).
- Audit log view stays where it is.

Ready to implement when you approve.