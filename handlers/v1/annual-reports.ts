import { createListHandler } from "../../lib/listEndpoint";

export default createListHandler({
  table: "AnnualReports",
  columns: [
    { db: "Id", json: "id" },
    { db: "Description", json: "description" },
    { db: "FileName", json: "fileName" },
  ],
  searchColumns: ["Description"],
  defaultSort: "Id ASC",
  sortable: { id: "Id ASC", "-id": "Id DESC" },
});
