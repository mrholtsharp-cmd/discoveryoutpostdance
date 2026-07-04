import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState, Fragment } from "react";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { searchRegistrations, exportRegistrations } from "@/lib/registrations.functions";
import { updateRegistrationApproval, updateRegistration } from "@/lib/admin-dashboard.functions";
import { ChevronLeft, ChevronRight, X, ArrowLeft, ChevronDown, ChevronUp, Download } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MessageParentButton } from "@/components/admin/MessageParentButton";

function approvalBadge(s: string | null | undefined) {
  const v = s ?? "pending";
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "Pending", className: "bg-amber-100 text-amber-900 border-amber-200" },
    approved: { label: "Approved", className: "bg-green-100 text-green-800 border-green-200" },
    waitlisted: { label: "Waitlisted", className: "bg-blue-100 text-blue-800 border-blue-200" },
    declined: { label: "Declined", className: "bg-zinc-200 text-zinc-700 border-zinc-300" },
  };
  return map[v] ?? map.pending;
}

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  cls: fallback(z.string(), "").default(""),
  lvl: fallback(z.string(), "").default(""),
  trial: fallback(z.enum(["all", "yes", "no"]), "all").default("all"),
  status: fallback(z.enum(["all", "pending", "approved", "waitlisted", "declined"]), "all").default("all"),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
  sort: fallback(z.enum(["newest", "oldest"]), "newest").default("newest"),
  page: fallback(z.number().int().min(1), 1).default(1),
  size: fallback(z.union([z.literal(25), z.literal(50), z.literal(100)]), 25).default(25),
});

type SearchParams = z.infer<typeof searchSchema>;

function depsFrom(s: SearchParams) {
  return {
    search: s.q,
    desired_class: s.cls,
    experience_level: s.lvl,
    is_trial: s.trial,
    approval_status: s.status,
    date_from: s.from,
    date_to: s.to,
    sort: s.sort,
    page: s.page,
    page_size: s.size,
  } as const;
}

export const Route = createFileRoute("/_authenticated/admin/registrations")({
  head: () => ({ meta: [{ title: "Registrations — Admin" }] }),
  validateSearch: zodValidator(searchSchema),
  loaderDeps: ({ search }) => depsFrom(search),
  component: RegistrationsAdminPage,
  errorComponent: ({ error }) => (
    <Layout>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-display text-3xl">Couldn't load registrations</h1>
        <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
      </section>
    </Layout>
  ),
  notFoundComponent: () => (
    <Layout>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <p>Not found.</p>
      </section>
    </Layout>
  ),
});

const CLASSES = ["Tap", "Jazz", "Ballet", "Musical Theater"];
const LEVELS = ["Beginner", "Intermediate", "Advanced"];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: Array<Record<string, unknown>>) {
  const cols = [
    "created_at", "student_name", "parent_name", "email", "phone", "age",
    "desired_class", "experience_level", "is_trial", "emergency_contact", "medical_notes",
  ];
  const header = cols.join(",");
  const body = rows.map((r) => cols.map((c) => csvEscape(r[c])).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function RegistrationsAdminPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const fn = useServerFn(searchRegistrations);
  const exportFn = useServerFn(exportRegistrations);
  const approveFn = useServerFn(updateRegistrationApproval);
  const updateFn = useServerFn(updateRegistration);
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const approveM = useMutation({
    mutationFn: (vars: { id: string; status: "pending" | "approved" | "waitlisted" | "declined" }) =>
      approveFn({ data: vars }),
    onSuccess: (_d, v) => {
      toast.success(`Marked as ${v.status}`);
      qc.invalidateQueries({ queryKey: ["registrations"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editM = useMutation({
    mutationFn: (payload: any) => updateFn({ data: payload }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["registrations"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deps = depsFrom(search);

  const opts = queryOptions({
    queryKey: ["registrations", "search", deps],
    queryFn: () => fn({ data: deps }),
  });
  const { data } = useSuspenseQuery(opts);

  const [qLocal, setQLocal] = useState(search.q);
  useEffect(() => setQLocal(search.q), [search.q]);
  useEffect(() => {
    if (qLocal === search.q) return;
    const t = setTimeout(() => {
      navigate({ search: (p: SearchParams) => ({ ...p, q: qLocal, page: 1 }) });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const total = data.total;
  const totalPages = Math.max(1, Math.ceil(total / search.size));
  const startIdx = total === 0 ? 0 : (search.page - 1) * search.size + 1;
  const endIdx = Math.min(total, search.page * search.size);

  const hasFilters =
    search.q || search.cls || search.lvl || search.trial !== "all" ||
    search.status !== "all" || search.from || search.to || search.sort !== "newest";

  return (
    <Layout>
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <Link to="/admin" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Back to admin
            </Link>
            <h1 className="font-display text-4xl mt-2">Registrations</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {total} total · showing {startIdx}–{endIdx}
            </p>
          </div>
          <Button
            variant="outline"
            disabled={exporting || total === 0}
            onClick={async () => {
              setExporting(true);
              try {
                const { page: _p, page_size: _s, ...filters } = deps;
                const rows = await exportFn({ data: filters });
                downloadCsv(rows);
                toast.success(`Exported ${rows.length} registration${rows.length === 1 ? "" : "s"}`);
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setExporting(false);
              }
            }}
          >
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>

        <Card className="mt-8 p-6">
          <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Input
              placeholder="Search name, email, phone…"
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              className="lg:col-span-2"
            />
            <Select
              value={search.cls || "all"}
              onValueChange={(v) =>
                navigate({ search: (p: SearchParams) => ({ ...p, cls: v === "all" ? "" : v, page: 1 }) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Class" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All classes</SelectItem>
                {CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={search.lvl || "all"}
              onValueChange={(v) =>
                navigate({ search: (p: SearchParams) => ({ ...p, lvl: v === "all" ? "" : v, page: 1 }) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={search.trial}
              onValueChange={(v: "all" | "yes" | "no") =>
                navigate({ search: (p: SearchParams) => ({ ...p, trial: v, page: 1 }) })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All registrations</SelectItem>
                <SelectItem value="yes">Trial only</SelectItem>
                <SelectItem value="no">Non-trial</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={search.status}
              onValueChange={(v: SearchParams["status"]) =>
                navigate({ search: (p: SearchParams) => ({ ...p, status: v, page: 1 }) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="waitlisted">Waitlisted</SelectItem>
                <SelectItem value="declined">Declined</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={search.sort}
              onValueChange={(v: "newest" | "oldest") =>
                navigate({ search: (p: SearchParams) => ({ ...p, sort: v, page: 1 }) })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] mt-3">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input
                type="date"
                value={search.from}
                onChange={(e) =>
                  navigate({ search: (p: SearchParams) => ({ ...p, from: e.target.value, page: 1 }) })
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input
                type="date"
                value={search.to}
                onChange={(e) =>
                  navigate({ search: (p: SearchParams) => ({ ...p, to: e.target.value, page: 1 }) })
                }
              />
            </div>
            {hasFilters && (
              <div className="self-end">
                <Button
                  variant="outline"
                  onClick={() =>
                    navigate({
                      search: () => ({
                      q: "", cls: "", lvl: "", trial: "all" as const, status: "all" as const,
                        from: "", to: "", sort: "newest" as const,
                        page: 1, size: search.size,
                      }),
                    })
                  }
                >
                  <X className="h-4 w-4" /> Clear
                </Button>
              </div>
            )}
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b border-border">
                <tr>
                  <th className="py-2 pr-4 w-8"></th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Parent</th>
                  <th className="py-2 pr-4">Contact</th>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4">Level</th>
                  <th className="py-2 pr-4">Age</th>
                  <th className="py-2 pr-4">Trial</th>
                  <th className="py-2 pr-4">Tuition</th>
                  <th className="py-2 pr-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const isOpen = !!expanded[r.id];
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-b border-border/60">
                        <td className="py-2 pr-2">
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => setExpanded((e) => ({ ...e, [r.id]: !isOpen }))}
                            aria-label={isOpen ? "Hide details" : "Show details"}
                          >
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
                        <td className="py-2 pr-4">{r.student_name}</td>
                        <td className="py-2 pr-4">{r.parent_name}</td>
                        <td className="py-2 pr-4">
                          <div>{r.email}</div>
                          <div className="text-muted-foreground text-xs">{r.phone}</div>
                        </td>
                        <td className="py-2 pr-4">{r.desired_class}</td>
                        <td className="py-2 pr-4">{r.experience_level}</td>
                        <td className="py-2 pr-4">{r.age}</td>
                        <td className="py-2 pr-4">{r.is_trial ? "Yes" : ""}</td>
                        <td className="py-2 pr-4">
                          {(() => {
                            const tp = (r as any).tuition_plan as string | null | undefined;
                            if (!tp) return <span className="text-muted-foreground text-xs">—</span>;
                            const isMonthly = tp === "monthly";
                            return (
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                                  isMonthly
                                    ? "bg-sky-100 text-sky-900 border-sky-200"
                                    : "bg-violet-100 text-violet-900 border-violet-200"
                                }`}
                              >
                                {isMonthly ? "Monthly" : "Semester"}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2 pr-4">
                          {(() => {
                            const b = approvalBadge((r as any).approval_status);
                            return (
                              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${b.className}`}>
                                {b.label}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/30">
                          <td></td>
                          <td colSpan={10} className="py-3 pr-4">
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Emergency contact</div>
                                <div>{r.emergency_contact}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Medical notes</div>
                                <div className="whitespace-pre-wrap">{r.medical_notes || "—"}</div>
                              </div>
                              {(r as any).admin_notes && (
                                <div className="sm:col-span-2">
                                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Admin notes</div>
                                  <div className="whitespace-pre-wrap">{(r as any).admin_notes}</div>
                                </div>
                              )}
                              <div className="sm:col-span-2">
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Actions</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <Button size="sm" variant="outline"
                                    disabled={approveM.isPending || (r as any).approval_status === "approved"}
                                    onClick={() => approveM.mutate({ id: r.id, status: "approved" })}
                                  >Approve</Button>
                                  <Button size="sm" variant="outline"
                                    disabled={approveM.isPending || (r as any).approval_status === "waitlisted"}
                                    onClick={() => approveM.mutate({ id: r.id, status: "waitlisted" })}
                                  >Waitlist</Button>
                                  <Button size="sm" variant="outline"
                                    disabled={approveM.isPending || (r as any).approval_status === "declined"}
                                    onClick={() => approveM.mutate({ id: r.id, status: "declined" })}
                                  >Decline</Button>
                                  <Button size="sm" variant="outline" onClick={() => setEditing(r)}>Edit student</Button>
                                  <Button size="sm" variant="outline" asChild>
                                    <Link to="/admin/invoice-requests">Manage invoices</Link>
                                  </Button>
                                  <MessageParentButton
                                    parentEmail={r.email}
                                    parentName={r.parent_name}
                                    defaultSubject={`Regarding ${r.student_name}'s registration`}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {data.rows.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No registrations match these filters.
              </p>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows per page</span>
              <Select
                value={String(search.size)}
                onValueChange={(v) =>
                  navigate({ search: (p: SearchParams) => ({ ...p, size: Number(v) as 25 | 50 | 100, page: 1 }) })
                }
              >
                <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Page {search.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={search.page <= 1}
                onClick={() => navigate({ search: (p: SearchParams) => ({ ...p, page: p.page - 1 }) })}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={search.page >= totalPages}
                onClick={() => navigate({ search: (p: SearchParams) => ({ ...p, page: p.page + 1 }) })}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </section>
      <EditRegistrationDialog
        open={!!editing}
        row={editing}
        onClose={() => setEditing(null)}
        onSave={(patch) => editM.mutate(patch)}
        saving={editM.isPending}
      />
    </Layout>
  );
}

function EditRegistrationDialog({
  open, row, onClose, onSave, saving,
}: {
  open: boolean;
  row: any | null;
  onClose: () => void;
  onSave: (patch: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<any>({});
  useEffect(() => {
    if (row) {
      setDraft({
        student_name: row.student_name ?? "",
        student_first_name: row.student_first_name ?? "",
        student_last_name: row.student_last_name ?? "",
        parent_name: row.parent_name ?? "",
        email: row.email ?? "",
        phone: row.phone ?? "",
        parent_address: row.parent_address ?? "",
        age: row.age ?? 0,
        desired_class: row.desired_class ?? "",
        experience_level: row.experience_level ?? "",
        emergency_contact: row.emergency_contact ?? "",
        medical_notes: row.medical_notes ?? "",
        admin_notes: row.admin_notes ?? "",
      });
    }
  }, [row]);

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit registration</DialogTitle>
        </DialogHeader>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>First name</Label><Input value={draft.student_first_name} onChange={(e) => setDraft({ ...draft, student_first_name: e.target.value })} /></div>
          <div><Label>Last name</Label><Input value={draft.student_last_name} onChange={(e) => setDraft({ ...draft, student_last_name: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Display name</Label><Input value={draft.student_name} onChange={(e) => setDraft({ ...draft, student_name: e.target.value })} /></div>
          <div><Label>Age</Label><Input type="number" value={draft.age} onChange={(e) => setDraft({ ...draft, age: Number(e.target.value) || 0 })} /></div>
          <div><Label>Class</Label>
            <Select value={draft.desired_class} onValueChange={(v) => setDraft({ ...draft, desired_class: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CLASSES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2"><Label>Level</Label>
            <Select value={draft.experience_level} onValueChange={(v) => setDraft({ ...draft, experience_level: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Parent name</Label><Input value={draft.parent_name} onChange={(e) => setDraft({ ...draft, parent_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
          <div><Label>Phone</Label><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
          <div><Label>Address</Label><Input value={draft.parent_address} onChange={(e) => setDraft({ ...draft, parent_address: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Emergency contact</Label><Input value={draft.emergency_contact} onChange={(e) => setDraft({ ...draft, emergency_contact: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Medical notes</Label><Textarea value={draft.medical_notes} onChange={(e) => setDraft({ ...draft, medical_notes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Admin notes (internal)</Label><Textarea value={draft.admin_notes} onChange={(e) => setDraft({ ...draft, admin_notes: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={() => onSave({ id: row.id, ...draft })}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}