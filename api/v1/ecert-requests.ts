import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "ECertRequests",
  columns: [
    { db: "Id", json: "id" },
    { db: "StockBrokerId", json: "stockBrokerId" },
    { db: "Code", json: "code" },
    { db: "Description", json: "description" },
    { db: "Brief", json: "brief" },
    { db: "Status", json: "status" },
    { db: "Date", json: "date" },
  ],
  filters: [
    { queryParam: "stock_broker_id", db: "StockBrokerId", sqlType: sql.Int, mode: "exact" },
    { queryParam: "status", db: "Status", sqlType: sql.Int, mode: "exact" },
  ],
  searchColumns: ["Description", "Code"],
  defaultSort: "Date DESC",
  sortable: { date: "Date ASC", "-date": "Date DESC" },
});
