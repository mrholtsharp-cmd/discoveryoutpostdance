import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, textResult, errorResult, requireAuth } from "../supabase";

export default defineTool({
  name: "get_my_account",
  title: "Get my account",
  description: "Return the signed-in parent's profile, students, emergency contacts, active enrollments, and waitlist entries.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    const supabase = supabaseForUser(ctx);
    const { data: parent, error: parentErr } = await supabase
      .from("parents")
      .select("*")
      .eq("auth_user_id", ctx.getUserId())
      .maybeSingle();
    if (parentErr) return errorResult(parentErr.message);
    if (!parent) return textResult({ parent: null, students: [], emergency_contacts: [], enrollments: [], waitlist: [] });

    const [studentsRes, ecRes] = await Promise.all([
      supabase.from("students").select("*").eq("parent_id", parent.id).order("created_at"),
      supabase.from("emergency_contacts").select("*").eq("parent_id", parent.id),
    ]);
    if (studentsRes.error) return errorResult(studentsRes.error.message);
    const students = studentsRes.data ?? [];
    const studentIds = students.map((s: any) => s.id);

    let enrollments: any[] = [];
    let waitlist: any[] = [];
    if (studentIds.length) {
      const [enRes, wlRes] = await Promise.all([
        supabase
          .from("enrollments")
          .select("id, student_id, class_id, status, enrolled_at, class_schedule:class_id(day, class_name, time, instructor, age_group, monthly_tuition_cents)")
          .in("student_id", studentIds),
        supabase
          .from("waitlist_entries")
          .select("id, student_id, class_id, wait_position, created_at, class_schedule:class_id(day, class_name, time, instructor, age_group)")
          .in("student_id", studentIds),
      ]);
      enrollments = enRes.data ?? [];
      waitlist = wlRes.data ?? [];
    }
    return textResult({ parent, students, emergency_contacts: ecRes.data ?? [], enrollments, waitlist });
  },
});