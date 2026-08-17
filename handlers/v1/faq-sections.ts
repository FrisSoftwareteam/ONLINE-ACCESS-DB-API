import { createListHandler } from "../../lib/listEndpoint";

export default createListHandler({
  table: "FaqSections",
  columns: [
    { db: "Id", json: "id" },
    { db: "Description", json: "description" },
  ],
  searchColumns: ["Description"],
  defaultSort: "Id ASC",
});
