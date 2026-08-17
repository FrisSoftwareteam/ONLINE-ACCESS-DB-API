import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "ECertHoldings",
  columns: [
    { db: "Id", json: "id" },
    { db: "HolderId", json: "holderId" },
    { db: "RegisterId", json: "registerId" },
    { db: "AccountNo", json: "accountNo" },
    { db: "CertificateNo", json: "certificateNo" },
    { db: "ClearingNo", json: "clearingNo" },
    { db: "Units", json: "units" },
    { db: "Date", json: "date" },
  ],
  filters: [
    { queryParam: "register_id", db: "RegisterId", sqlType: sql.Int, mode: "exact" },
    { queryParam: "account_no", db: "AccountNo", sqlType: sql.VarChar, mode: "exact" },
  ],
  searchColumns: ["CertificateNo"],
  defaultSort: "Date DESC",
  sortable: { date: "Date ASC", "-date": "Date DESC" },
});
