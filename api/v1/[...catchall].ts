import type { VercelRequest, VercelResponse } from "@vercel/node";

// Everything under /api/v1/* is routed through this single serverless function.
// Vercel's Hobby plan caps deployments at 12 functions, and this project has
// far more logical endpoints than that — consolidating into one catch-all
// (rather than paying for more functions) keeps every endpoint's own file
// and logic untouched; only how Vercel wires up the URL changed.

import registers from "../../handlers/v1/registers";
import health from "../../handlers/v1/health";
import annualReports from "../../handlers/v1/annual-reports";
import authors from "../../handlers/v1/authors";
import postCategories from "../../handlers/v1/post-categories";
import posts from "../../handlers/v1/posts";
import faqs from "../../handlers/v1/faqs";
import faqSections from "../../handlers/v1/faq-sections";
import contacts from "../../handlers/v1/contacts";
import stockbrokers from "../../handlers/v1/stockbrokers";
import dividends from "../../handlers/v1/dividends";
import registerHoldings from "../../handlers/v1/register-holdings";
import shareOffers from "../../handlers/v1/share-offers";
import shareSubscriptions from "../../handlers/v1/share-subscriptions";
import ecertHoldings from "../../handlers/v1/ecert-holdings";
import ecertRequests from "../../handlers/v1/ecert-requests";
import shareholdersStaging from "../../handlers/v1/shareholders-staging";

import shareholdersSearch from "../../handlers/v1/shareholders/index";
import shareholderDetail from "../../handlers/v1/shareholders/[regno]/index";
import shareholderAccounts from "../../handlers/v1/shareholders/[regno]/accounts";
import shareholderHoldings from "../../handlers/v1/shareholders/[regno]/holdings";
import shareholderDividends from "../../handlers/v1/shareholders/[regno]/dividends";

type Handler = (req: VercelRequest, res: VercelResponse) => Promise<void>;

const flatRoutes: Record<string, Handler> = {
  registers,
  health,
  "annual-reports": annualReports,
  authors,
  "post-categories": postCategories,
  posts,
  faqs,
  "faq-sections": faqSections,
  contacts,
  stockbrokers,
  dividends,
  "register-holdings": registerHoldings,
  "share-offers": shareOffers,
  "share-subscriptions": shareSubscriptions,
  "ecert-holdings": ecertHoldings,
  "ecert-requests": ecertRequests,
  "shareholders-staging": shareholdersStaging,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Parse straight from the URL path rather than relying on req.query.catchall —
  // more robust against any routing/query-population differences in the runtime.
  const pathname = (req.url || "").split("?")[0];
  const allSegments = pathname.split("/").filter(Boolean); // e.g. ["api","v1","shareholders","123"]
  const v1Index = allSegments.findIndex((s) => s === "v1");
  const segments = v1Index >= 0 ? allSegments.slice(v1Index + 1) : [];

  if (segments.length === 1 && flatRoutes[segments[0]]) {
    return flatRoutes[segments[0]](req, res);
  }

  if (segments[0] === "shareholders") {
    if (segments.length === 1) {
      return shareholdersSearch(req, res);
    }
    if (segments.length >= 2) {
      req.query.regno = segments[1];
      if (segments.length === 2) return shareholderDetail(req, res);
      if (segments.length === 3 && segments[2] === "accounts") return shareholderAccounts(req, res);
      if (segments.length === 3 && segments[2] === "holdings") return shareholderHoldings(req, res);
      if (segments.length === 3 && segments[2] === "dividends") return shareholderDividends(req, res);
    }
  }

  res.status(404).json({ message: "Not found" });
}
