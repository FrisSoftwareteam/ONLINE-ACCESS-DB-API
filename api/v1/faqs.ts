import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "Faqs",
  columns: [
    { db: "Id", json: "id" },
    { db: "SectionId", json: "sectionId" },
    { db: "Question", json: "question" },
    { db: "Html", json: "html" },
  ],
  filters: [{ queryParam: "section_id", db: "SectionId", sqlType: sql.Int, mode: "exact" }],
  searchColumns: ["Question"],
  defaultSort: "Id ASC",
});
