import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "Dividends",
  columns: [
    { db: "Id", json: "id" },
    { db: "RegisterId", json: "registerId" },
    { db: "PaymentNo", json: "paymentNo" },
    { db: "Description", json: "description" },
    { db: "AmountDeclared", json: "amountDeclared" },
    { db: "YearEnd", json: "yearEnd" },
    { db: "Date", json: "date" },
    { db: "DatePayable", json: "datePayable" },
    { db: "ClosureDate", json: "closureDate" },
  ],
  filters: [{ queryParam: "register_id", db: "RegisterId", sqlType: sql.Int, mode: "exact" }],
  searchColumns: ["Description", "PaymentNo"],
  defaultSort: "Date DESC",
  sortable: { date: "Date ASC", "-date": "Date DESC" },
});
