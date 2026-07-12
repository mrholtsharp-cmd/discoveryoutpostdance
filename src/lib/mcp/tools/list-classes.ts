import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser, textResult, errorResult, requireAuth } from "../supabase";

export default defineTool({
  name: "list_classes",
  title: "List classes",
  description: "List the current dance class schedule (day, time, instructor, age group, monthly tuition).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    const unauth = requireAuth(ctx);
    if (unauth) return unauth;
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("class_schedule")
      .select("id, class_name, day, time, instructor, age_group, capacity, monthly_tuition_cents, semester_tuition_cents")
      .order("day")
      .order("time");
    if (error) return errorResult(error.message);
    return textResult({ classes: data ?? [] });
  },
});