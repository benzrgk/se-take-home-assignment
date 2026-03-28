import { EventEmitter } from "node:events";
import { RealClock, formatClockTime } from "./clock.js";

export const ORDER_TYPES = Object.freeze({
  NORMAL: "NORMAL",
  VIP: "VIP",
});

export const ORDER_STATUSES = Object.freeze({
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETE: "COMPLETE",
});

export const BOT_STATUSES = Object.freeze({
  IDLE: "IDLE",
  PROCESSING: "PROCESSING",
});

const ACTIVITY_LIMIT = 80;

export class OrderController extends EventEmitter {
  constructor({ clock = new RealClock(), processingTimeMs = 10_000 } = {}) {
    super();
    this.clock = clock;
    this.processingTimeMs = processingTimeMs;
    this.orders = new Map();
    this.bots = new Map();
    this.activity = [];
    this.reset();
  }

  reset() {
    for (const bot of this.bots?.values?.() ?? []) {
      if (bot.timerHandle) {
        this.clock.clearTimeout(bot.timerHandle);
      }
    }

    this.orders = new Map();
    this.bots = new Map();
    this.activity = [];
    this.nextOrderId = 1;
    this.nextBotId = 1;
    this.nextSequence = 1;
    this.nextActivityId = 1;
    this.recordActivity("System reset");
    this.emitState();
  }

  addOrder(type) {
    this.assertOrderType(type);

    const order = {
      id: this.nextOrderId++,
      type,
      sequence: this.nextSequence++,
      status: ORDER_STATUSES.PENDING,
      createdAt: this.clock.now(),
      startedAt: null,
      completedAt: null,
      assignedBotId: null,
      completionDueAt: null,
    };

    this.orders.set(order.id, order);
    this.recordActivity(`${type} order #${order.id} moved to pending`);
    this.emitState();
    this.dispatch();

    return this.toOrderView(order);
  }

  addBot() {
    const bot = {
      id: this.nextBotId++,
      status: BOT_STATUSES.IDLE,
      currentOrderId: null,
      startedAt: null,
      completionDueAt: null,
      timerHandle: null,
    };

    this.bots.set(bot.id, bot);
    this.recordActivity(`Bot #${bot.id} is online`);
    this.emitState();
    this.dispatch();

    return this.toBotView(bot);
  }

  removeBot() {
    const bot = this.getLatestBot();

    if (!bot) {
      return null;
    }

    if (bot.timerHandle) {
      this.clock.clearTimeout(bot.timerHandle);
      bot.timerHandle = null;
    }

    if (bot.currentOrderId) {
      const order = this.orders.get(bot.currentOrderId);

      if (order) {
        order.status = ORDER_STATUSES.PENDING;
        order.startedAt = null;
        order.assignedBotId = null;
        order.completionDueAt = null;
        this.recordActivity(
          `Bot #${bot.id} stopped order #${order.id}; it returned to pending`
        );
      }
    }

    this.bots.delete(bot.id);
    this.recordActivity(`Bot #${bot.id} went offline`);
    this.emitState();
    this.dispatch();

    return {
      botId: bot.id,
    };
  }

  dispatch() {
    while (true) {
      const idleBot = this.getIdleBots()[0];
      const nextOrder = this.getPendingOrders()[0];

      if (!idleBot || !nextOrder) {
        return;
      }

      this.startProcessing(idleBot, nextOrder);
    }
  }

  getSnapshot() {
    const pendingOrders = this.getPendingOrders();
    const processingOrders = this.getProcessingOrders();
    const completedOrders = this.getCompletedOrders();
    const bots = Array.from(this.bots.values()).sort((left, right) => left.id - right.id);
    const now = this.clock.now();

    return {
      generatedAt: now,
      generatedAtText: formatClockTime(now),
      processingTimeMs: this.processingTimeMs,
      summary: {
        totalOrders: this.orders.size,
        pendingCount: pendingOrders.length,
        processingCount: processingOrders.length,
        completeCount: completedOrders.length,
        botCount: bots.length,
        idleBotCount: bots.filter((bot) => bot.status === BOT_STATUSES.IDLE).length,
      },
      orders: {
        pending: pendingOrders.map((order, index) => this.toOrderView(order, now, index + 1)),
        processing: processingOrders.map((order) => this.toOrderView(order, now)),
        complete: completedOrders.map((order) => this.toOrderView(order, now)),
      },
      bots: bots.map((bot) => this.toBotView(bot, now)),
      activity: [...this.activity].sort((left, right) => right.id - left.id),
    };
  }

  toOrderView(order, now = this.clock.now(), queuePosition = null) {
    const priority = order.type === ORDER_TYPES.VIP ? 0 : 1;

    return {
      id: order.id,
      displayId: `#${String(order.id).padStart(3, "0")}`,
      type: order.type,
      status: order.status,
      priority,
      queuePosition,
      assignedBotId: order.assignedBotId,
      createdAt: order.createdAt,
      createdAtText: formatClockTime(order.createdAt),
      startedAt: order.startedAt,
      startedAtText: order.startedAt ? formatClockTime(order.startedAt) : null,
      completedAt: order.completedAt,
      completedAtText: order.completedAt ? formatClockTime(order.completedAt) : null,
      completionDueAt: order.completionDueAt,
      remainingMs:
        order.completionDueAt && order.status === ORDER_STATUSES.PROCESSING
          ? Math.max(0, order.completionDueAt - now)
          : 0,
      waitingSeconds: Math.max(
        0,
        Math.floor(((order.startedAt ?? now) - order.createdAt) / 1000)
      ),
    };
  }

  toBotView(bot, now = this.clock.now()) {
    const currentOrder = bot.currentOrderId ? this.orders.get(bot.currentOrderId) : null;

    return {
      id: bot.id,
      status: bot.status,
      currentOrderId: currentOrder?.id ?? null,
      currentOrderDisplayId: currentOrder ? `#${String(currentOrder.id).padStart(3, "0")}` : null,
      currentOrderType: currentOrder?.type ?? null,
      startedAt: bot.startedAt,
      startedAtText: bot.startedAt ? formatClockTime(bot.startedAt) : null,
      completionDueAt: bot.completionDueAt,
      completionDueAtText: bot.completionDueAt ? formatClockTime(bot.completionDueAt) : null,
      remainingMs:
        bot.completionDueAt && bot.status === BOT_STATUSES.PROCESSING
          ? Math.max(0, bot.completionDueAt - now)
          : 0,
    };
  }

  getPendingOrders() {
    return Array.from(this.orders.values())
      .filter((order) => order.status === ORDER_STATUSES.PENDING)
      .sort(comparePendingOrders);
  }

  getProcessingOrders() {
    return Array.from(this.orders.values())
      .filter((order) => order.status === ORDER_STATUSES.PROCESSING)
      .sort((left, right) => left.startedAt - right.startedAt || left.id - right.id);
  }

  getCompletedOrders() {
    return Array.from(this.orders.values())
      .filter((order) => order.status === ORDER_STATUSES.COMPLETE)
      .sort((left, right) => left.completedAt - right.completedAt || left.id - right.id);
  }

  getIdleBots() {
    return Array.from(this.bots.values())
      .filter((bot) => bot.status === BOT_STATUSES.IDLE)
      .sort((left, right) => left.id - right.id);
  }

  getLatestBot() {
    return Array.from(this.bots.values()).sort((left, right) => right.id - left.id)[0] ?? null;
  }

  startProcessing(bot, order) {
    const startTime = this.clock.now();
    const completionTime = startTime + this.processingTimeMs;

    bot.status = BOT_STATUSES.PROCESSING;
    bot.currentOrderId = order.id;
    bot.startedAt = startTime;
    bot.completionDueAt = completionTime;

    order.status = ORDER_STATUSES.PROCESSING;
    order.startedAt = startTime;
    order.assignedBotId = bot.id;
    order.completionDueAt = completionTime;

    bot.timerHandle = this.clock.setTimeout(() => {
      this.finishProcessing(bot.id, order.id);
    }, this.processingTimeMs);

    this.recordActivity(`Bot #${bot.id} started ${order.type} order #${order.id}`);
    this.emitState();
  }

  finishProcessing(botId, orderId) {
    const bot = this.bots.get(botId);
    const order = this.orders.get(orderId);

    if (!bot || !order || bot.currentOrderId !== orderId) {
      return;
    }

    bot.status = BOT_STATUSES.IDLE;
    bot.currentOrderId = null;
    bot.startedAt = null;
    bot.completionDueAt = null;
    bot.timerHandle = null;

    order.status = ORDER_STATUSES.COMPLETE;
    order.completedAt = this.clock.now();
    order.assignedBotId = botId;
    order.completionDueAt = null;

    this.recordActivity(
      `${order.type} order #${order.id} completed by Bot #${botId}`
    );
    this.emitState();
    this.dispatch();
  }

  recordActivity(message) {
    const time = this.clock.now();
    const event = {
      id: this.nextActivityId++,
      message,
      timestamp: time,
      timestampText: formatClockTime(time),
    };

    this.activity.push(event);
    this.activity = this.activity.slice(-ACTIVITY_LIMIT);
    this.emit("activity", event);
  }

  emitState() {
    this.emit("state", this.getSnapshot());
  }

  assertOrderType(type) {
    if (type !== ORDER_TYPES.NORMAL && type !== ORDER_TYPES.VIP) {
      throw new Error(`Unsupported order type: ${type}`);
    }
  }
}

function comparePendingOrders(left, right) {
  const leftPriority = left.type === ORDER_TYPES.VIP ? 0 : 1;
  const rightPriority = right.type === ORDER_TYPES.VIP ? 0 : 1;

  return leftPriority - rightPriority || left.sequence - right.sequence;
}
