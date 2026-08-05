// Client-safe: no server imports. Lives apart from coach.ts so the chat component
// can render tool activity without dragging the Anthropic SDK and the db client
// into the browser bundle.

/** The model narrates in tool names; the user shouldn't have to read them. */
const TOOL_LABEL: Record<string, string> = {
  get_today: "reading your day",
  list_goals: "checking your goals",
  list_tasks: "looking back over entries",
  get_calendar: "checking your calendar",
  create_task: "writing to your board",
  update_task: "updating your board",
  complete_task: "updating your board",
  delete_task: "updating your board",
  create_goal: "setting up a goal",
  update_goal: "updating a goal",
  log_habit: "ticking a non-negotiable",
  add_to_calendar: "adding to your calendar",
};

export const toolLabel = (name: string): string => TOOL_LABEL[name] ?? `using ${name}`;
