import { createServer } from "node:http";

createServer((_request, response) => {
  response.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "60" });
  response.end("League deployment in progress");
}).listen(Number(process.env.PORT || 8080), "0.0.0.0");
