import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { ManualClock, RealClock, formatClockTime } from "./clock.js";
import { OrderController, ORDER_TYPES } from "./order-controller.js";

const DEMO_START_MS = new Date(2026, 2, 28, 9, 0, 0).getTime();

function printSnapshot(controller, title) {
  const snapshot = controller.getSnapshot();
  const pendingSummary =
    snapshot.orders.pending.map((order) => `${order.displayId}:${order.type}`).join(", ") || "none";
  const processingSummary =
    snapshot.orders.processing
      .map(
        (order) =>
          `${order.displayId}:${order.type}->Bot#${order.assignedBotId} (${Math.ceil(
            order.remainingMs / 1000
          )}s)`
      )
      .join(", ") || "none";
  const completeSummary =
    snapshot.orders.complete
      .map((order) => `${order.displayId}:${order.type}@${order.completedAtText}`)
      .join(", ") || "none";
  const botSummary =
    snapshot.bots
      .map((bot) =>
        bot.status === "IDLE"
          ? `Bot#${bot.id}:${bot.status}`
          : `Bot#${bot.id}:${bot.status}:${bot.currentOrderDisplayId}`
      )
      .join(", ") || "none";

  console.log(`[${snapshot.generatedAtText}] ${title}`);
  console.log(`  pending: ${pendingSummary}`);
  console.log(`  processing: ${processingSummary}`);
  console.log(`  complete: ${completeSummary}`);
  console.log(`  bots: ${botSummary}`);
}

function printHelp() {
  console.log("Commands: normal, vip, +bot, -bot, status, reset, help, exit");
}

async function runDemo() {
  const clock = new ManualClock(DEMO_START_MS);
  const controller = new OrderController({
    clock,
    processingTimeMs: 10_000,
  });

  console.log("FeedMe order controller demo");
  printSnapshot(controller, "Initial state");

  controller.addOrder(ORDER_TYPES.NORMAL);
  controller.addOrder(ORDER_TYPES.NORMAL);
  controller.addOrder(ORDER_TYPES.VIP);
  printSnapshot(controller, "Queued two normal orders and one VIP order");

  controller.addBot();
  printSnapshot(controller, "Added Bot #1, which immediately picked up the VIP order");

  clock.advance(4_000);
  printSnapshot(controller, "4 seconds later");

  controller.addBot();
  printSnapshot(controller, "Added Bot #2, which immediately picked up the oldest normal order");

  controller.addOrder(ORDER_TYPES.VIP);
  printSnapshot(controller, "A second VIP order arrived and jumped ahead of normal orders");

  clock.advance(1_000);
  controller.removeBot();
  printSnapshot(controller, "Removed the newest bot while it was processing; the order returned to pending");

  clock.advance(5_000);
  printSnapshot(controller, "10 seconds after the first pickup, the first VIP order completed");

  controller.addBot();
  printSnapshot(controller, "Added Bot #3 so pending work could resume immediately");

  clock.advance(10_000);
  printSnapshot(controller, "10 more seconds later");

  console.log(`[${formatClockTime(clock.now())}] Demo finished`);
}

async function runInteractive() {
  const controller = new OrderController({
    clock: new RealClock(),
    processingTimeMs: 10_000,
  });

  const rl = readline.createInterface({ input, output });
  let lastActivityId = 0;

  controller.on("activity", (event) => {
    if (event.id <= lastActivityId) {
      return;
    }

    lastActivityId = event.id;
    console.log(`[${event.timestampText}] ${event.message}`);
  });

  console.log("Interactive FeedMe controller");
  printHelp();

  while (true) {
    const command = (await rl.question("> ")).trim().toLowerCase();

    if (command === "normal") {
      controller.addOrder(ORDER_TYPES.NORMAL);
      continue;
    }

    if (command === "vip") {
      controller.addOrder(ORDER_TYPES.VIP);
      continue;
    }

    if (command === "+bot") {
      controller.addBot();
      continue;
    }

    if (command === "-bot") {
      controller.removeBot();
      continue;
    }

    if (command === "status") {
      printSnapshot(controller, "Current state");
      continue;
    }

    if (command === "reset") {
      controller.reset();
      continue;
    }

    if (command === "help") {
      printHelp();
      continue;
    }

    if (command === "exit" || command === "quit") {
      break;
    }

    console.log("Unknown command");
    printHelp();
  }

  rl.close();
}

const mode = process.argv[2] ?? "demo";

if (mode === "interactive") {
  await runInteractive();
} else {
  await runDemo();
}
