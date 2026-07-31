import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CwManageClient } from "../api-client.js";

export function registerScheduleTools(server: McpServer, client: CwManageClient) {
  server.tool(
    "cw_search_schedule_entries",
    "Search schedule entries in ConnectWise Manage.",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string (e.g. \"member/identifier = 'jsmith' and dateStart >= [2026-01-01T00:00:00Z]\")"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
      orderBy: z.string().optional().describe("Field to order by"),
    },
    async ({ conditions, page, pageSize, orderBy }) => {
      const result = await client.get("/schedule/entries", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
        orderBy,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_schedule_entry",
    "Get a specific schedule entry by ID.",
    {
      id: z.number().describe("Schedule entry ID"),
    },
    async ({ id }) => {
      const result = await client.get(`/schedule/entries/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_schedule_statuses",
    "List available ConnectWise schedule statuses. Use this to discover the status ID to mark a schedule entry as Firm or Tentative: a status with showAsTentativeFlag = true displays as Tentative; showAsTentativeFlag = false (or absent) displays as Firm/Confirmed. Status IDs are tenant-specific — always look them up here rather than assuming Firm = 1 / Tentative = 2. Call this before using statusId on cw_create_schedule_entry or cw_update_schedule_entry.",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string (e.g. \"showAsTentativeFlag = true\")"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
    },
    async ({ conditions, page, pageSize }) => {
      const result = await client.get("/schedule/statuses", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_create_schedule_entry",
    "Create a new schedule entry. To control whether it displays as Firm or Tentative, pass statusId set to the ID of a schedule status found via cw_get_schedule_statuses (showAsTentativeFlag = true for Tentative, false for Firm).",
    {
      objectId: z.number().describe("ID of the object being scheduled (ticket, activity, opportunity, etc.)"),
      typeId: z.string().describe("Schedule type identifier (e.g. 'S' for Service, 'A' for Activity)"),
      dateStart: z.string().describe("Start date/time (ISO 8601)"),
      dateEnd: z.string().describe("End date/time (ISO 8601)"),
      memberId: z.number().optional().describe("Member ID to assign the schedule entry to"),
      name: z.string().optional().describe("Name/subject of the schedule entry"),
      description: z.string().optional().describe("Schedule entry description"),
      doNotDisplayInDispatch: z.boolean().optional().describe("Hide from the dispatch portal"),
      statusId: z
        .number()
        .optional()
        .describe(
          "Schedule status ID controlling Firm vs Tentative display. Look this up with cw_get_schedule_statuses first: use the ID of a status with showAsTentativeFlag = true for a Tentative entry, or showAsTentativeFlag = false for a Firm entry. Omit to use the tenant's default status.",
        ),
      allowScheduleConflictsFlag: z
        .boolean()
        .optional()
        .describe(
          "Set to true to allow this entry to be created even if it conflicts with existing schedule entries. Use when intentionally overlapping Tier Queue blocks or other overrideable entries.",
        ),
    },
    async ({ objectId, typeId, dateStart, dateEnd, memberId, name, description, doNotDisplayInDispatch, statusId, allowScheduleConflictsFlag }) => {
      const body: Record<string, unknown> = {
        objectId,
        type: { identifier: typeId },
        dateStart,
        dateEnd,
      };
      if (memberId !== undefined) body.member = { id: memberId };
      if (name) body.name = name;
      if (description) body.description = description;
      if (doNotDisplayInDispatch !== undefined) body.doNotDisplayInDispatch = doNotDisplayInDispatch;
      if (statusId !== undefined) body.status = { id: statusId };
      if (allowScheduleConflictsFlag) body.allowScheduleConflictsFlag = true;

      const result = await client.post("/schedule/entries", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_update_schedule_entry",
    "Update an existing schedule entry (e.g. move it to a new time, reassign it, or flip it between Firm and Tentative) using JSON Patch operations.",
    {
      id: z.number().describe("Schedule entry ID"),
      operations: z
        .array(
          z.object({
            op: z.enum(["replace", "add", "remove"]).describe("Patch operation"),
            path: z.string().describe("JSON path (e.g. 'dateStart', 'dateEnd', 'member/id')"),
            value: z.unknown().optional().describe("New value"),
          }),
        )
        .describe("Array of JSON Patch operations"),
      statusId: z
        .number()
        .optional()
        .describe(
          "Convenience shortcut to change Firm/Tentative status: schedule status ID to set on the entry, equivalent to a 'replace /status' patch op. Look it up with cw_get_schedule_statuses first (showAsTentativeFlag = true for Tentative, false for Firm).",
        ),
      allowScheduleConflictsFlag: z
        .boolean()
        .optional()
        .describe(
          "Set to true to allow this entry to be scheduled over existing conflicting entries. Use when intentionally overlapping Tier Queue blocks or other overrideable entries.",
        ),
    },
    async ({ id, operations, statusId, allowScheduleConflictsFlag }) => {
      const patchOps = [...operations];
      if (statusId !== undefined) {
        patchOps.push({ op: "replace", path: "status", value: { id: statusId } });
      }
      if (allowScheduleConflictsFlag) {
        patchOps.push({ op: "replace", path: "allowScheduleConflictsFlag", value: true });
      }
      const result = await client.patch(`/schedule/entries/${id}`, patchOps);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_schedule_calendar",
    "Get a ConnectWise schedule calendar by ID. Returns working hours per day of the week (e.g. mondayStartTime, mondayEndTime). Use GET /system/members/{id} first to retrieve the member's calendar.id, then call this to determine their actual working hours before scheduling. Never schedule meetings outside a member's working hours.",
    {
      id: z.number().describe("Calendar ID (found on a member object as calendar.id)"),
    },
    async ({ id }) => {
      const result = await client.get(`/schedule/calendars/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
