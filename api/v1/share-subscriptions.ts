import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "ShareSubscriptions",
  columns: [
    { db: "Id", json: "id" },
    { db: "Type", json: "type" },
    { db: "ShareOfferId", json: "shareOfferId" },
    { db: "FormResponseId", json: "formResponseId" },
    { db: "NoOfShares", json: "noOfShares" },
    { db: "Rights", json: "rights" },
    { db: "PaymentId", json: "paymentId" },
  ],
  filters: [{ queryParam: "share_offer_id", db: "ShareOfferId", sqlType: sql.Int, mode: "exact" }],
  defaultSort: "Id ASC",
});
