import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "Shareholders_Staging",
  columns: [
    { db: "account_number", json: "accountNumber" },
    { db: "names", json: "names" },
    { db: "address", json: "address" },
    { db: "mail", json: "email" },
    { db: "mobile", json: "mobile" },
    { db: "Company_name", json: "companyName" },
    { db: "register_code", json: "registerCode" },
    { db: "Holdings", json: "holdings" },
    { db: "bankac", json: "bankAccount" },
    { db: "branch_code", json: "branchCode" },
    { db: "clearing_no", json: "clearingNo" },
    { db: "DateAddedToRegister", json: "dateAddedToRegister" },
  ],
  filters: [
    { queryParam: "register_code", db: "register_code", sqlType: sql.Int, mode: "exact" },
    { queryParam: "account_number", db: "account_number", sqlType: sql.Int, mode: "exact" },
  ],
  searchColumns: ["names", "mail", "mobile", "Company_name"],
  defaultSort: "account_number ASC",
  sortable: { account_number: "account_number ASC", "-account_number": "account_number DESC" },
});
