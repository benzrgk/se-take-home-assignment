import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { OrderController, ORDER_TYPES } from "./order-controller.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, "../frontend");

export function createServer({
  controller = new OrderController(),
  enableStaticFrontend = true,
} = {}) {
  const sseClients = new Set();

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, "http://localhost");
    const pathname = requestUrl.pathname;

    try {
      if (request.method === "OPTIONS") {
        writeCorsHeaders(response);
        response.writeHead(204);
        response.end();
        return;
      }

      if (request.method === "GET" && pathname === "/health") {
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "GET" && pathname === "/api/events") {
        writeCorsHeaders(response);
        response.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });

        response.write(serializeSseEvent("state", controller.getSnapshot()));
        const heartbeat = setInterval(() => {
          response.write(": keep-alive\n\n");
        }, 15_000);

        const listener = (snapshot) => {
          response.write(serializeSseEvent("state", snapshot));
        };

        controller.on("state", listener);
        sseClients.add(response);

        request.on("close", () => {
          clearInterval(heartbeat);
          controller.off("state", listener);
          sseClients.delete(response);
          response.end();
        });

        return;
      }

      const apiResponse = handleApiRequest(controller, {
        method: request.method,
        pathname,
      });

      if (apiResponse) {
        sendJson(response, apiResponse.statusCode, apiResponse.body);
        return;
      }

      if (enableStaticFrontend && (pathname === "/" || pathname.startsWith("/assets") || pathname.endsWith(".js") || pathname.endsWith(".css"))) {
        const filePath = resolveFrontendFile(pathname);

        if (filePath) {
          const fileContents = await readFile(filePath);
          response.writeHead(200, {
            "Content-Type": detectContentType(filePath),
            "Cache-Control": "no-store",
          });
          response.end(fileContents);
          return;
        }
      }

      sendJson(response, 404, {
        error: "Not found",
        path: pathname,
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message,
      });
    }
  });

  server.on("close", () => {
    for (const client of sseClients) {
      client.end();
    }
  });

  return server;
}

export function handleApiRequest(controller, { method, pathname }) {
  if (method === "GET" && pathname === "/api/state") {
    return {
      statusCode: 200,
      body: controller.getSnapshot(),
    };
  }

  if (method === "POST" && pathname === "/api/orders/normal") {
    const order = controller.addOrder(ORDER_TYPES.NORMAL);
    return {
      statusCode: 201,
      body: { order, state: controller.getSnapshot() },
    };
  }

  if (method === "POST" && pathname === "/api/orders/vip") {
    const order = controller.addOrder(ORDER_TYPES.VIP);
    return {
      statusCode: 201,
      body: { order, state: controller.getSnapshot() },
    };
  }

  if (method === "POST" && pathname === "/api/bots/increase") {
    const bot = controller.addBot();
    return {
      statusCode: 201,
      body: { bot, state: controller.getSnapshot() },
    };
  }

  if (method === "POST" && pathname === "/api/bots/decrease") {
    const bot = controller.removeBot();
    return {
      statusCode: 200,
      body: { bot, state: controller.getSnapshot() },
    };
  }

  if (method === "POST" && pathname === "/api/reset") {
    controller.reset();
    return {
      statusCode: 200,
      body: controller.getSnapshot(),
    };
  }

  return null;
}

function writeCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, payload) {
  writeCorsHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function serializeSseEvent(name, payload) {
  return `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function resolveFrontendFile(pathname) {
  const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  const fullPath = path.resolve(frontendDir, safePath);

  if (!fullPath.startsWith(frontendDir)) {
    return null;
  }

  return fullPath;
}

function detectContentType(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (filePath.endsWith(".js")) {
    return "application/javascript; charset=utf-8";
  }

  return "application/octet-stream";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createServer();

  server.listen(port, () => {
    console.log(`FeedMe backend listening on http://localhost:${port}`);
  });
}
