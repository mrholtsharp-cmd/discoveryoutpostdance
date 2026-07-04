import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LoadError } from "@/components/site/LoadError";
import { Layout } from "@/components/site/Layout";
import { Card } from "@/components/ui/card";
import { listSchedule } from "@/lib/schedule.functions";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Class Schedule — Discovery Outpost" },
      { name: "description", content: "Weekly Tap, Jazz, and Ballet class schedule at Discovery Outpost Performing Arts Dance." },
      { property: "og:title", content: "Class Schedule — Discovery Outpost" },
      { property: "og:description", content: "Weekly Tap, Jazz, and Ballet class schedule." },
      { property: "og:url", content: "/schedule" },
    ],
    links: [{ rel: "canonical", href: "/schedule" }],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["schedule"],
    queryFn: () => listSchedule(),
    retry: 1,
  });
  const dayOrder = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const byDay = (data ?? []).reduce<Record<string, any[]>>((acc, r) => {
    (acc[r.day] ||= []).push(r); return acc;
  }, {});
  return (
    <Layout>
      <section className="mx-auto max-w-5xl px-6 py-20">
        <span className="text-xs uppercase tracking-[0.25em] text-primary">Weekly Schedule</span>
        <h1 className="font-display text-5xl sm:text-6xl mt-4">Class Schedule</h1>
        <p className="mt-4 text-muted-foreground max-w-xl">
          Our weekly rotation of Tap, Jazz, and Ballet classes. Times subject to change — register to confirm your spot.
        </p>
        {isError ? (
          <div className="mt-12">
            <LoadError
              title="We couldn't load the class schedule"
              message="Please try again in a moment."
              onRetry={() => refetch()}
              retrying={isFetching}
            />
          </div>
        ) : isLoading ? (
          <p className="mt-12 text-muted-foreground">Loading schedule…</p>
        ) : dayOrder.filter((d) => byDay[d]).length === 0 ? (
          <Card className="mt-12 p-8 text-center border-border">
            <p className="text-muted-foreground">No classes scheduled yet. Please check back soon or contact us at (940) 249-5390.</p>
          </Card>
        ) : (
          <div className="mt-12 space-y-4">
            {dayOrder.filter((d) => byDay[d]).map((day) => (
              <Card key={day} className="p-6 border-border">
                <div className="grid sm:grid-cols-[180px_1fr] gap-4">
                  <div className="font-display text-2xl">{day}</div>
                  <ul className="space-y-2">
                    {byDay[day].map((r) => (
                      <li key={r.id} className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
                        <span>{r.class_name}</span>
                        <span className="text-muted-foreground">{r.time}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}