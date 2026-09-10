import { createServer } from "node:http";

const port = Number(process.env["FAKE_BREVO_PORT"] ?? 4179);
const messages: unknown[] = [];

const server = createServer((request, response) => {
  response.setHeader("content-type", "application/json");
  if (request.method === "GET" && request.url === "/__health") {
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (request.method === "GET" && request.url === "/__messages") {
    response.end(JSON.stringify(messages));
    return;
  }
  if (request.method === "DELETE" && request.url === "/__messages") {
    messages.length = 0;
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  const template = request.url?.match(/^\/v3\/smtp\/templates\/(\d+)$/);
  if (request.method === "GET" && template) {
    response.end(
      JSON.stringify({
        id: Number(template[1]),
        name: `E2E template ${template[1]}`,
        subject: "[E2E] GetQHSE transactional email",
        isActive: true,
      }),
    );
    return;
  }
  if (request.method === "POST" && request.url === "/v3/smtp/email") {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
      messages.push(body);
      response.end(JSON.stringify({ messageId: `fake-brevo-${messages.length}` }));
    });
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ code: "not_found" }));
});

server.listen(port, "127.0.0.1");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
