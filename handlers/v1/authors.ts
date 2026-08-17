import { createListHandler } from "../../lib/listEndpoint";

export default createListHandler({
  table: "Authors",
  columns: [
    { db: "Id", json: "id" },
    { db: "Name", json: "name" },
    { db: "Bio", json: "bio" },
    { db: "Avatar", json: "avatar" },
  ],
  searchColumns: ["Name"],
  defaultSort: "Name ASC",
  sortable: { name: "Name ASC", "-name": "Name DESC" },
});
