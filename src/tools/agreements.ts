import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CwManageClient } from "../api-client.js";

export function registerAgreementTools(server: McpServer, client: CwManageClient) {
  server.tool(
    "cw_search_agreements",
    "Search finance agreements (recurring revenue contracts) in ConnectWise Manage. Use 'conditions' for CW query syntax (e.g. \"cancelledFlag = false\", \"company/name = 'Acme'\").",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
      orderBy: z.string().optional().describe("Field to order by"),
    },
    async ({ conditions, page, pageSize, orderBy }) => {
      const result = await client.get("/finance/agreements", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
        orderBy,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_agreement",
    "Get a specific finance agreement by ID.",
    {
      id: z.number().describe("Agreement ID"),
    },
    async ({ id }) => {
      const result = await client.get(`/finance/agreements/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_create_agreement",
    "Create a new finance agreement (recurring revenue contract) in ConnectWise Manage. Surfaces the commonly required fields directly; use 'extraFields' for anything else supported by POST /finance/agreements (e.g. billingCycleId, invoiceDescription, startDate, endDate, noEndingDateFlag).",
    {
      name: z.string().describe("Agreement name"),
      companyId: z.number().describe("Company ID to associate"),
      typeId: z.number().describe("Agreement type ID (required by CW)"),
      contactId: z.number().optional().describe("Contact ID to associate"),
      agreementStatus: z
        .enum(["Active", "Inactive", "Cancelled"])
        .optional()
        .describe("Agreement status (default: CW default, typically Active)"),
      extraFields: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Passthrough for any additional agreement fields supported by the CW API (merged into the request body).",
        ),
    },
    async ({ name, companyId, typeId, contactId, agreementStatus, extraFields }) => {
      const body: Record<string, unknown> = {
        name,
        company: { id: companyId },
        type: { id: typeId },
      };
      if (contactId !== undefined) body.contact = { id: contactId };
      if (agreementStatus) body.agreementStatus = agreementStatus;
      if (extraFields) Object.assign(body, extraFields);

      const result = await client.post("/finance/agreements", body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_update_agreement",
    "Update an existing finance agreement using JSON Patch operations.",
    {
      id: z.number().describe("Agreement ID"),
      operations: z
        .array(
          z.object({
            op: z.enum(["replace", "add", "remove"]).describe("Patch operation"),
            path: z.string().describe("JSON path (e.g. 'name', 'agreementStatus', 'endDate')"),
            value: z.unknown().optional().describe("New value"),
          }),
        )
        .describe("Array of JSON Patch operations"),
    },
    async ({ id, operations }) => {
      const result = await client.patch(`/finance/agreements/${id}`, operations);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_agreement_additions",
    "Get additions (line items) for a specific agreement.",
    {
      agreementId: z.number().describe("Agreement ID"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
    },
    async ({ agreementId, page, pageSize }) => {
      const result = await client.get(`/finance/agreements/${agreementId}/additions`, {
        page: page ?? 1,
        pageSize: pageSize ?? 25,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_agreement_addition",
    "Get a single addition (line item) on an agreement by ID.",
    {
      agreementId: z.number().describe("Agreement ID"),
      additionId: z.number().describe("Addition ID"),
    },
    async ({ agreementId, additionId }) => {
      const result = await client.get(`/finance/agreements/${agreementId}/additions/${additionId}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_add_agreement_addition",
    "Add a new addition (line item) to an agreement. Use 'extraFields' for anything else supported by POST /finance/agreements/{id}/additions (e.g. taxableFlag, invoiceDescription, effectiveDate, cancelledDate).",
    {
      agreementId: z.number().describe("Agreement ID"),
      catalogItemId: z.number().optional().describe("Catalog item (product) ID for this addition"),
      description: z.string().optional().describe("Description of the addition (required if no catalogItemId)"),
      quantity: z.number().optional().describe("Quantity (default: 1)"),
      unitPrice: z.number().optional().describe("Unit price"),
      unitCost: z.number().optional().describe("Unit cost"),
      extraFields: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Passthrough for any additional addition fields supported by the CW API (merged into the request body).",
        ),
    },
    async ({ agreementId, catalogItemId, description, quantity, unitPrice, unitCost, extraFields }) => {
      const body: Record<string, unknown> = {};
      if (catalogItemId !== undefined) body.catalogItem = { id: catalogItemId };
      if (description) body.description = description;
      if (quantity !== undefined) body.quantity = quantity;
      if (unitPrice !== undefined) body.unitPrice = unitPrice;
      if (unitCost !== undefined) body.unitCost = unitCost;
      if (extraFields) Object.assign(body, extraFields);

      const result = await client.post(`/finance/agreements/${agreementId}/additions`, body);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_update_agreement_addition",
    "Update an existing agreement addition using JSON Patch operations.",
    {
      agreementId: z.number().describe("Agreement ID"),
      additionId: z.number().describe("Addition ID"),
      operations: z
        .array(
          z.object({
            op: z.enum(["replace", "add", "remove"]).describe("Patch operation"),
            path: z.string().describe("JSON path (e.g. 'quantity', 'unitPrice', 'description')"),
            value: z.unknown().optional().describe("New value"),
          }),
        )
        .describe("Array of JSON Patch operations"),
    },
    async ({ agreementId, additionId, operations }) => {
      const result = await client.patch(`/finance/agreements/${agreementId}/additions/${additionId}`, operations);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_search_invoices",
    "Search invoices in ConnectWise Manage.",
    {
      conditions: z.string().optional().describe("ConnectWise conditions query string (e.g. \"company/name = 'Acme'\")"),
      page: z.number().optional().describe("Page number (default: 1)"),
      pageSize: z.number().optional().describe("Results per page (default: 25, max: 1000)"),
      orderBy: z.string().optional().describe("Field to order by (e.g. 'id desc')"),
    },
    async ({ conditions, page, pageSize, orderBy }) => {
      const result = await client.get("/finance/invoices", {
        conditions,
        page: page ?? 1,
        pageSize: pageSize ?? 25,
        orderBy,
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    "cw_get_invoice",
    "Get a specific invoice by ID.",
    {
      id: z.number().describe("Invoice ID"),
    },
    async ({ id }) => {
      const result = await client.get(`/finance/invoices/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );
}
