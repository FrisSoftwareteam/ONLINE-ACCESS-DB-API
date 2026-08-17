// Local-only test harness: routes plain HTTP requests to the compiled
// catch-all router, so we can curl-test the real deployed code without the
// Vercel CLI.
require("dotenv").config();
const http = require("http");
const { URL } = require("url");

const catchall = require("./dist/api/v1/[...catchall]").default;

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
    if (segments[0] === "api" && segments[1] === "v1") {
      req.query.catchall = segments.slice(2);
      return await catchall(req, res);
    }
    res.status(404).json({ message: "Not found" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Unhandled error in test harness", error: String(err) });
  }
});

const PORT = 3000;
server.listen(PORT, () => console.log(`Test server listening on http://localhost:${PORT}`));
