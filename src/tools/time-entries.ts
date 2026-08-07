import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CwManageClient } from "../api-client.js";

export function registerTimeEntryTools(server: McpServer, client: CwManageClient) {
  server.tool(
    "cw_search_time_entries",
    "Search time entries in ConnectWise Manage.",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string (e.g. \"member/identifier = 'jsmith'\")"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
      orderBy: z.string().optional().describe("Field to order by"),
    },
    async ({ conditions, page, pageSize, orderBy }) => {
      const result = await client.get("/time/entries", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
        orderBy,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_list_work_types",
    "List available work types in ConnectWise Manage — the kind of work performed on a time entry (e.g. Installation, Remote Support, After-Hours Support).",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
    },
    async ({ conditions, page, pageSize }) => {
      const result = await client.get("/time/workTypes", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_list_work_roles",
    "List available work roles in ConnectWise Manage — the role the member performed the work under (e.g. Engineer, Senior Engineer, Product Manager), used for billing rate determination.",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
    },
    async ({ conditions, page, pageSize }) => {
      const result = await client.get("/time/workRoles", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_search_charge_codes",
    "Search GL charge codes in ConnectWise Manage — the non-ticket buckets time can be charged to (e.g. Meeting, PTO, Training). Use this to resolve a charge code name to the numeric ID needed by cw_create_time_entry / cw_update_time_entry (chargeToType: 'ChargeCode').",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string (e.g. \"name like '%Meeting%'\")"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
      orderBy: z.string().optional().describe("Field to order by (e.g. 'name asc')"),
    },
    async ({ conditions, page, pageSize, orderBy }) => {
      const result = await client.get("/time/chargeCodes", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
        orderBy,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_time_entry",
    "Get a specific time entry by ID.",
    {
      id: z.number().describe("Time entry ID"),
    },
    async ({ id }) => {
      const result = await client.get(`/time/entries/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_create_time_entry",
    "Create a new time entry.",
    {
      chargeToType: z.enum(["ServiceTicket", "ProjectTicket", "ChargeCode", "Activity"]).describe("What to charge the time to"),
      chargeToId: z.number().describe("ID of the ticket, charge code, or activity"),
      memberId: z.number().describe("Member ID for the time entry"),
      timeStart: z.string().describe("Start time (ISO 8601)"),
      timeEnd: z.string().optional().describe("End time (ISO 8601)"),
      actualHours: z.number().optional().describe("Actual hours worked (alternative to timeEnd)"),
      notes: z.string().optional().describe("Work notes"),
      internalNotes: z.string().optional().describe("Internal-only notes"),
      workTypeId: z.number().optional().describe("Work type ID"),
      workRoleId: z.number().optional().describe("Work role ID"),
      billableOption: z
        .enum(["Billable", "DoNotBill", "NoCharge"])
        .optional()
        .describe(
          "Billable status: 'Billable' invoices normally, 'DoNotBill' excludes the entry from invoices entirely, 'NoCharge' appears on the invoice at no charge.",
        ),
    },
    async ({
      chargeToType,
      chargeToId,
      memberId,
      timeStart,
      timeEnd,
      actualHours,
      notes,
      internalNotes,
      workTypeId,
      workRoleId,
      billableOption,
    }) => {
      const body: Record<string, unknown> = {
        chargeToType,
        chargeToId,
        member: { id: memberId },
        timeStart,
      };
      if (timeEnd) body.timeEnd = timeEnd;
      if (actualHours !== undefined) body.actualHours = actualHours;
      if (notes) body.notes = notes;
      if (internalNotes) body.internalNotes = internalNotes;
      if (workTypeId) body.workType = { id: workTypeId };
      if (workRoleId) body.workRole = { id: workRoleId };
      if (billableOption) body.billableOption = billableOption;

      const result = await client.post("/time/entries", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_update_time_entry",
    "Update an existing time entry using JSON Patch operations — correct the charge target, work type/role, billable status, notes, or hours after the entry was created.",
    {
      id: z.number().describe("Time entry ID"),
      operations: z
        .array(
          z.object({
            op: z.enum(["replace", "add", "remove"]).describe("Patch operation"),
            path: z
              .string()
              .describe(
                "Field path: 'chargeToId', 'chargeToType' (ServiceTicket | ProjectTicket | ChargeCode | Activity), 'workType/id', 'workRole/id', 'billableOption' (Billable | DoNotBill | NoCharge), 'notes', 'internalNotes', 'timeStart', 'timeEnd', 'actualHours'. Change chargeToId and chargeToType together when moving an entry between charge targets.",
              ),
            value: z.unknown().optional().describe("New value"),
          }),
        )
        .describe("Array of JSON Patch operations"),
    },
    async ({ id, operations }) => {
      const result = await client.patch(`/time/entries/${id}`, operations);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_delete_time_entry",
    "Permanently delete a time entry by ID. Use when an entry was created in error and cannot be corrected with cw_update_time_entry. Only entries still in 'Open' status can be deleted — submitted, approved, or billed entries are rejected.",
    {
      id: z.number().describe("Time entry ID to delete"),
    },
    async ({ id }) => {
      const entry = await client.get<{ status?: string }>(`/time/entries/${id}`);
      const status = entry?.status;
      if (status && status !== "Open") {
        return {
          content: [
            {
              type: "text",
              text: `Refusing to delete time entry ${id}: status is '${status}', not 'Open'. Submitted, approved, or billed entries must be reopened in ConnectWise before they can be deleted.`,
            },
          ],
          isError: true,
        };
      }

      await client.delete(`/time/entries/${id}`);
      return { content: [{ type: "text", text: `Time entry ${id} deleted successfully` }] };
    },
  );
}
