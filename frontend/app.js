import {
  computed,
  createApp,
  onMounted,
  onUnmounted,
  reactive,
  ref,
} from "https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js";

const DEFAULT_STATE = {
  summary: {
    pendingCount: 0,
    processingCount: 0,
    completeCount: 0,
    botCount: 0,
    idleBotCount: 0,
  },
  orders: {
    pending: [],
    processing: [],
    complete: [],
  },
  bots: [],
  activity: [],
};

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/+$/, "");
}

function getInitialApiBase() {
  const queryValue = new URLSearchParams(window.location.search).get("api");
  const savedValue = window.localStorage.getItem("feedme-api-base");
  const configuredValue = window.FEEDME_CONFIG?.apiBaseUrl ?? "";

  if (queryValue) {
    return normalizeBaseUrl(queryValue);
  }

  if (savedValue) {
    return normalizeBaseUrl(savedValue);
  }

  if (configuredValue) {
    return normalizeBaseUrl(configuredValue);
  }

  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }

  return "";
}

createApp({
  setup() {
    const resolvedApiBase = ref(getInitialApiBase());
    const draftApiBase = ref(resolvedApiBase.value);
    const state = reactive(structuredClone(DEFAULT_STATE));
    const busyActions = reactive(new Set());
    const connection = reactive({
      status: "connecting",
      label: "Connecting",
    });
    const errorMessage = ref("");
    const nowMs = ref(Date.now());

    let pollTimer = null;
    let reconnectTimer = null;
    let eventSource = null;
    let clockTimer = null;

    const completedOrders = computed(() => [...state.orders.complete].reverse());

    const apiUrl = (pathname) =>
      resolvedApiBase.value ? `${resolvedApiBase.value}${pathname}` : pathname;

    const setConnectionStatus = (status, label) => {
      connection.status = status;
      connection.label = label;
    };

    const applySnapshot = (snapshot) => {
      state.summary = snapshot.summary;
      state.orders = snapshot.orders;
      state.bots = snapshot.bots;
      state.activity = snapshot.activity;
    };

    const fetchJson = async (pathname, options = {}) => {
      const response = await fetch(apiUrl(pathname), {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      return response.json();
    };

    const loadState = async ({ silent = false } = {}) => {
      if (!silent) {
        busyActions.add("refresh");
      }

      try {
        const snapshot = await fetchJson("/api/state");
        applySnapshot(snapshot);
        errorMessage.value = "";
      } catch (error) {
        errorMessage.value = `Unable to load state from ${resolvedApiBase.value || "same origin"}.`;
        throw error;
      } finally {
        busyActions.delete("refresh");
      }
    };

    const stopPolling = () => {
      if (pollTimer) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      stopPolling();
      pollTimer = window.setInterval(() => {
        loadState({ silent: true }).catch(() => {});
      }, 5000);
    };

    const disconnectEvents = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const connectEvents = () => {
      disconnectEvents();
      stopPolling();
      setConnectionStatus("connecting", "Connecting");

      const stream = new EventSource(apiUrl("/api/events"));
      eventSource = stream;

      stream.addEventListener("open", () => {
        setConnectionStatus("live", "Live stream");
        errorMessage.value = "";
        stopPolling();
      });

      stream.addEventListener("state", (event) => {
        applySnapshot(JSON.parse(event.data));
      });

      stream.addEventListener("error", () => {
        setConnectionStatus("retrying", "Retrying");
        startPolling();
        disconnectEvents();
        reconnectTimer = window.setTimeout(connectEvents, 2500);
      });
    };

    const runAction = async (key, pathname) => {
      busyActions.add(key);

      try {
        const payload = await fetchJson(pathname, { method: "POST" });
        if (payload.state) {
          applySnapshot(payload.state);
        } else {
          applySnapshot(payload);
        }
        errorMessage.value = "";
      } catch (error) {
        errorMessage.value = `Action failed for ${pathname}.`;
      } finally {
        busyActions.delete(key);
      }
    };

    const createOrder = async (type) => {
      await runAction(type, type === "vip" ? "/api/orders/vip" : "/api/orders/normal");
    };

    const changeBotCount = async (direction) => {
      await runAction(
        direction === "increase" ? "add-bot" : "remove-bot",
        direction === "increase" ? "/api/bots/increase" : "/api/bots/decrease"
      );
    };

    const refreshState = async () => {
      try {
        await loadState();
      } catch (_) {
        return;
      }
    };

    const resetState = async () => {
      if (!window.confirm("Reset all orders and bots?")) {
        return;
      }

      await runAction("reset", "/api/reset");
    };

    const saveApiBase = async () => {
      resolvedApiBase.value = normalizeBaseUrl(draftApiBase.value);
      window.localStorage.setItem("feedme-api-base", resolvedApiBase.value);

      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }

      await refreshState();
      connectEvents();
    };

    const isActionBusy = (key) => busyActions.has(key);

    const remainingSeconds = (entry) => {
      if (!entry.completionDueAt) {
        return 0;
      }

      return Math.max(0, Math.ceil((entry.completionDueAt - nowMs.value) / 1000));
    };

    const progressPercent = (entry) => {
      if (!entry.startedAt || !entry.completionDueAt) {
        return 0;
      }

      const total = entry.completionDueAt - entry.startedAt;
      const elapsed = Math.min(total, Math.max(0, nowMs.value - entry.startedAt));

      return total ? Math.round((elapsed / total) * 100) : 0;
    };

    onMounted(async () => {
      clockTimer = window.setInterval(() => {
        nowMs.value = Date.now();
      }, 1000);

      try {
        await loadState();
      } catch (_) {
        setConnectionStatus("offline", "Offline");
        startPolling();
      }

      connectEvents();
    });

    onUnmounted(() => {
      disconnectEvents();
      stopPolling();
      if (clockTimer) {
        window.clearInterval(clockTimer);
      }
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
    });

    return {
      completedOrders,
      connection,
      createOrder,
      changeBotCount,
      draftApiBase,
      errorMessage,
      isActionBusy,
      progressPercent,
      refreshState,
      remainingSeconds,
      resetState,
      resolvedApiBase,
      saveApiBase,
      state,
    };
  },
}).mount("#app");
