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
    "cw_create_schedule_entry",
    "Create a new schedule entry.",
    {
      objectId: z.number().describe("ID of the object being scheduled (ticket, activity, opportunity, etc.)"),
      typeId: z.string().describe("Schedule type identifier (e.g. 'S' for Service, 'A' for Activity)"),
      dateStart: z.string().describe("Start date/time (ISO 8601)"),
      dateEnd: z.string().describe("End date/time (ISO 8601)"),
      memberId: z.number().optional().describe("Member ID to assign the schedule entry to"),
      name: z.string().optional().describe("Name/subject of the schedule entry"),
      description: z.string().optional().describe("Schedule entry description"),
      doNotDisplayInDispatch: z.boolean().optional().describe("Hide from the dispatch portal"),
    },
    async ({ objectId, typeId, dateStart, dateEnd, memberId, name, description, doNotDisplayInDispatch }) => {
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

      const result = await client.post("/schedule/entries", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
