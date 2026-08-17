import { createListHandler } from "../../lib/listEndpoint";
import { sql } from "../../lib/db";

export default createListHandler({
  table: "ShareOffers",
  columns: [
    { db: "Id", json: "id" },
    { db: "RegisterId", json: "registerId" },
    { db: "UniqueKey", json: "uniqueKey" },
    { db: "Description", json: "description" },
    { db: "StartDate", json: "startDate" },
    { db: "EndDate", json: "endDate" },
    { db: "AllowPublicOffer", json: "allowPublicOffer" },
    { db: "AllowRightIssue", json: "allowRightIssue" },
    { db: "PublicOffer_Price", json: "publicOfferPrice" },
    { db: "PublicOffer_Minimum", json: "publicOfferMinimum" },
    { db: "RightIssue_Price", json: "rightIssuePrice" },
    { db: "RightIssue_NoOfShares", json: "rightIssueNoOfShares" },
    { db: "RightIssue_Rights", json: "rightIssueRights" },
    { db: "Date", json: "date" },
  ],
  filters: [{ queryParam: "register_id", db: "RegisterId", sqlType: sql.Int, mode: "exact" }],
  searchColumns: ["Description"],
  defaultSort: "Date DESC",
  sortable: { date: "Date ASC", "-date": "Date DESC" },
});
