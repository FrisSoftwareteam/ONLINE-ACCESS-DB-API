import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "RegisterHoldings",
  columns: [
    { db: "Id", json: "id" },
    { db: "RegisterId", json: "registerId" },
    { db: "AccountNo", json: "accountNo" },
    { db: "ClearingNo", json: "clearingNo" },
    { db: "Name", json: "name" },
    { db: "Address", json: "address" },
    { db: "Email", json: "email" },
    { db: "Phone", json: "phone" },
    { db: "Mobile", json: "mobile" },
    { db: "Units", json: "units" },
    { db: "Date", json: "date" },
  ],
  filters: [
    { queryParam: "register_id", db: "RegisterId", sqlType: sql.Int, mode: "exact" },
    { queryParam: "account_no", db: "AccountNo", sqlType: sql.Int, mode: "exact" },
  ],
  searchColumns: ["Name", "Email"],
  defaultSort: "Id ASC",
});
