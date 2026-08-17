// Local-only test harness: routes plain HTTP requests to the compiled Vercel
// handler functions, so we can curl-test the real code without the Vercel CLI.
require("dotenv").config();
const http = require("http");
const { URL } = require("url");

const registers = require("./dist/api/v1/registers").default;
const health = require("./dist/api/v1/health").default;
const shareholdersSearch = require("./dist/api/v1/shareholders/index").default;
const shareholderDetail = require("./dist/api/v1/shareholders/[regno]/index").default;
const shareholderAccounts = require("./dist/api/v1/shareholders/[regno]/accounts").default;
const shareholderHoldings = require("./dist/api/v1/shareholders/[regno]/holdings").default;
const shareholderDividends = require("./dist/api/v1/shareholders/[regno]/dividends").default;

const flatEndpoints = {
  "annual-reports": require("./dist/api/v1/annual-reports").default,
  authors: require("./dist/api/v1/authors").default,
  "post-categories": require("./dist/api/v1/post-categories").default,
  posts: require("./dist/api/v1/posts").default,
  faqs: require("./dist/api/v1/faqs").default,
  "faq-sections": require("./dist/api/v1/faq-sections").default,
  contacts: require("./dist/api/v1/contacts").default,
  stockbrokers: require("./dist/api/v1/stockbrokers").default,
  dividends: require("./dist/api/v1/dividends").default,
  "register-holdings": require("./dist/api/v1/register-holdings").default,
  "share-offers": require("./dist/api/v1/share-offers").default,
  "share-subscriptions": require("./dist/api/v1/share-subscriptions").default,
  "ecert-holdings": require("./dist/api/v1/ecert-holdings").default,
  "ecert-requests": require("./dist/api/v1/ecert-requests").default,
  "shareholders-staging": require("./dist/api/v1/shareholders-staging").default,
};

function makeRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const query = Object.fromEntries(url.searchParams.entries());
  req.query = query;
  makeRes(res);

  const segments = url.pathname.split("/").filter(Boolean); // e.g. ["api","v1","shareholders","123","holdings"]

  try {
    if (url.pathname === "/api/v1/registers") return await registers(req, res);
    if (url.pathname === "/api/v1/health") return await health(req, res);
    if (url.pathname === "/api/v1/shareholders") return await shareholdersSearch(req, res);

    if (segments[0] === "api" && segments[1] === "v1" && segments.length === 3 && flatEndpoints[segments[2]]) {
      return await flatEndpoints[segments[2]](req, res);
    }

    if (segments[0] === "api" && segments[1] === "v1" && segments[2] === "shareholders" && segments[3]) {
      req.query.regno = segments[3];
      if (segments.length === 4) return await shareholderDetail(req, res);
      if (segments[4] === "accounts") return await shareholderAccounts(req, res);
      if (segments[4] === "holdings") return await shareholderHoldings(req, res);
      if (segments[4] === "dividends") return await shareholderDividends(req, res);
    }

    res.status(404).json({ message: "Not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unhandled error in test harness", error: String(err) });
  }
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Test server listening on http://localhost:${PORT}`));
