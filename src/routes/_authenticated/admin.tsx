import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
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
import { listSchedule, upsertScheduleEntry, deleteScheduleEntry } from "@/lib/schedule.functions";
import { listRegistrations } from "@/lib/registrations.functions";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin — Discovery Outpost" }] }),
  component: AdminPage,
});

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sched = useServerFn(listSchedule);
  const regs = useServerFn(listRegistrations);
  const upsert = useServerFn(upsertScheduleEntry);
  const del = useServerFn(deleteScheduleEntry);

  const schedule = useQuery({ queryKey: ["schedule"], queryFn: () => sched() });
  const registrations = useQuery({ queryKey: ["registrations"], queryFn: () => regs() });

  const [day, setDay] = useState("Monday");
  const [className, setClassName] = useState("");
  const [time, setTime] = useState("");

  const addM = useMutation({
    mutationFn: () =>
      upsert({ data: { day, class_name: className, time, sort_order: 0 } }),
    onSuccess: () => {
      toast.success("Class added");
      setClassName(""); setTime("");
      qc.invalidateQueries({ queryKey: ["schedule"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule"] }),
  });

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <Layout>
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <span className="text-xs uppercase tracking-[0.25em] text-primary">Studio Admin</span>
            <h1 className="font-display text-4xl mt-2">Dashboard</h1>
          </div>
          <Button variant="outline" onClick={signOut} className="rounded-full">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </div>

        <Card className="mt-10 p-6">
          <h2 className="font-display text-2xl">Class Schedule</h2>
          <div className="mt-4 grid sm:grid-cols-4 gap-3">
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Class name (e.g. Ballet I)" value={className} onChange={(e) => setClassName(e.target.value)} />
            <Input placeholder="Time (e.g. 4:00 - 5:00 PM)" value={time} onChange={(e) => setTime(e.target.value)} />
            <Button onClick={() => addM.mutate()} disabled={!className || !time || addM.isPending}>
              Add Class
            </Button>
          </div>
          <div className="mt-6 divide-y divide-border">
            {schedule.data?.map((row) => (
              <div key={row.id} className="flex items-center justify-between py-3 text-sm">
                <div className="flex gap-4">
                  <span className="w-24 font-medium">{row.day}</span>
                  <span>{row.class_name}</span>
                  <span className="text-muted-foreground">{row.time}</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => delM.mutate(row.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {schedule.data?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No classes yet.</p>
            )}
          </div>
        </Card>

        <Card className="mt-8 p-6">
          <h2 className="font-display text-2xl">Registrations</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b border-border">
                <tr>
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
                {registrations.data?.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-4">{new Date(r.created_at).toLocaleDateString()}</td>
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
                ))}
              </tbody>
            </table>
            {registrations.data?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No registrations yet.</p>
            )}
          </div>
        </Card>
      </section>
    </Layout>
  );
}