import { createListHandler } from "../../lib/listEndpoint";

export default createListHandler({
  table: "StockBrokers",
  columns: [
    { db: "Id", json: "id" },
    { db: "Code", json: "code" },
    { db: "SecondaryPhone", json: "phone" },
    { db: "Street", json: "street" },
    { db: "City", json: "city" },
    { db: "State", json: "state" },
    { db: "Date", json: "date" },
    { db: "StartDate", json: "startDate" },
    { db: "ExpiryDate", json: "expiryDate" },
    { db: "CreatedOn", json: "createdOn" },
  ],
  searchColumns: ["Code", "City", "State"],
  defaultSort: "Code ASC",
});
