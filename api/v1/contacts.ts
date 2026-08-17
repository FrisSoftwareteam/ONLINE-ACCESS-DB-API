import { createListHandler } from "../../lib/listEndpoint";

export default createListHandler({
  table: "Contacts",
  columns: [
    { db: "Id", json: "id" },
    { db: "Name", json: "name" },
    { db: "Email", json: "email" },
  ],
  searchColumns: ["Name", "Email"],
  defaultSort: "Id ASC",
});
