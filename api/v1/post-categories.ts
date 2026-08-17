import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "PostCategories",
  columns: [
    { db: "Id", json: "id" },
    { db: "Type", json: "type" },
    { db: "Code", json: "code" },
    { db: "Description", json: "description" },
  ],
  filters: [{ queryParam: "type", db: "Type", sqlType: sql.Int, mode: "exact" }],
  searchColumns: ["Description", "Code"],
  defaultSort: "Description ASC",
});
