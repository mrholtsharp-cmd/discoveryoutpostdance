import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useEffect, useState, Fragment } from "react";
import { Layout } from "@/components/site/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { searchRegistrations, exportRegistrations } from "@/lib/registrations.functions";
import { ChevronLeft, ChevronRight, X, ArrowLeft, ChevronDown, ChevronUp, Download } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  cls: fallback(z.string(), "").default(""),
  lvl: fallback(z.string(), "").default(""),
  trial: fallback(z.enum(["all", "yes", "no"]), "all").default("all"),
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

function RegistrationsAdminPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const fn = useServerFn(searchRegistrations);
  const exportFn = useServerFn(exportRegistrations);
  const [exporting, setExporting] = useState(false);
  const deps = depsFrom(search);

  const opts = queryOptions({
    queryKey: ["registrations", "search", deps],
    queryFn: () => fn({ data: deps }),
  });
  const { data } = useSuspenseQuery(opts);

  // Debounced search input
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
    search.from || search.to || search.sort !== "newest";

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
                        q: "", cls: "", lvl: "", trial: "all" as const,
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
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/30">
                          <td></td>
                          <td colSpan={8} className="py-3 pr-4">
                            <div className="grid sm:grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Emergency contact</div>
                                <div>{r.emergency_contact}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-wide text-muted-foreground">Medical notes</div>
                                <div className="whitespace-pre-wrap">{r.medical_notes || "—"}</div>
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
    </Layout>
  );
}