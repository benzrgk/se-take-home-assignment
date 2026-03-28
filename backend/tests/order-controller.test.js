import assert from "node:assert/strict";
import test from "node:test";
import { ManualClock } from "../clock.js";
import { OrderController, ORDER_TYPES } from "../order-controller.js";
import { createServer, handleApiRequest } from "../server.js";

test("VIP orders are prioritised ahead of normal orders", () => {
  const controller = new OrderController({
    clock: new ManualClock(),
  });

  controller.addOrder(ORDER_TYPES.NORMAL);
  controller.addOrder(ORDER_TYPES.NORMAL);
  controller.addOrder(ORDER_TYPES.VIP);
  controller.addOrder(ORDER_TYPES.VIP);

  const pendingIds = controller.getSnapshot().orders.pending.map((order) => order.id);
  assert.deepEqual(pendingIds, [3, 4, 1, 2]);
});

test("a bot completes an order only after 10 seconds", () => {
  const clock = new ManualClock();
  const controller = new OrderController({ clock });

  controller.addOrder(ORDER_TYPES.NORMAL);
  controller.addBot();

  assert.equal(controller.getSnapshot().orders.processing.length, 1);

  clock.advance(9_999);
  assert.equal(controller.getSnapshot().orders.complete.length, 0);

  clock.advance(1);
  const snapshot = controller.getSnapshot();

  assert.equal(snapshot.orders.complete.length, 1);
  assert.equal(snapshot.bots[0].status, "IDLE");
});

test("removing a bot requeues its in-flight order in original pending position", () => {
  const controller = new OrderController({
    clock: new ManualClock(),
  });

  controller.addOrder(ORDER_TYPES.NORMAL);
  controller.addOrder(ORDER_TYPES.NORMAL);
  controller.addOrder(ORDER_TYPES.NORMAL);
  controller.addBot();

  controller.removeBot();

  const pendingIds = controller.getSnapshot().orders.pending.map((order) => order.id);
  assert.deepEqual(pendingIds, [1, 2, 3]);
});

test("idle bots pick up newly created orders immediately", () => {
  const controller = new OrderController({
    clock: new ManualClock(),
  });

  controller.addBot();
  controller.addOrder(ORDER_TYPES.VIP);

  const snapshot = controller.getSnapshot();

  assert.equal(snapshot.orders.pending.length, 0);
  assert.equal(snapshot.orders.processing[0].type, ORDER_TYPES.VIP);
  assert.equal(snapshot.bots[0].status, "PROCESSING");
});

test("API routing commands produce the expected snapshots without binding a socket", () => {
  const controller = new OrderController({
    clock: new ManualClock(),
  });

  const server = createServer({ controller, enableStaticFrontend: false });
  assert.equal(typeof server.listen, "function");

  const createResult = handleApiRequest(controller, {
    method: "POST",
    pathname: "/api/orders/vip",
  });
  const stateResult = handleApiRequest(controller, {
    method: "GET",
    pathname: "/api/state",
  });

  assert.equal(createResult.statusCode, 201);
  assert.equal(stateResult.statusCode, 200);
  assert.equal(stateResult.body.summary.pendingCount, 1);
  assert.equal(stateResult.body.orders.pending[0].type, ORDER_TYPES.VIP);
});
