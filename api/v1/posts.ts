import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "Posts",
  columns: [
    { db: "Id", json: "id" },
    { db: "Type", json: "type" },
    { db: "CategoryId", json: "categoryId" },
    { db: "AuthorId", json: "authorId" },
    { db: "Code", json: "code" },
    { db: "Title", json: "title" },
    { db: "Brief", json: "brief" },
    { db: "Html", json: "html" },
    { db: "Thumb", json: "thumb" },
    { db: "Date", json: "date" },
    { db: "Views", json: "views" },
    { db: "Promoted", json: "promoted" },
  ],
  filters: [
    { queryParam: "category_id", db: "CategoryId", sqlType: sql.Int, mode: "exact" },
    { queryParam: "author_id", db: "AuthorId", sqlType: sql.Int, mode: "exact" },
    { queryParam: "promoted", db: "Promoted", sqlType: sql.Bit, mode: "exact" },
  ],
  searchColumns: ["Title", "Brief"],
  defaultSort: "Date DESC",
  sortable: { date: "Date ASC", "-date": "Date DESC", views: "Views ASC", "-views": "Views DESC" },
});
