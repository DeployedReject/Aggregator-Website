globalThis.fetch = async function (url, options) {
  const reqId = "fetch_" + Math.random().toString(36).substring(2);
  const normalizedUrl = typeof url === "string" ? url : (url?.url || "");
  const normalizedInit = {
    method: options?.method || "GET",
    headers: options?.headers || {},
    body: options?.body,
  };

  return new Promise((resolve) => {
    function handleResponse(event) {
      if (event.data?.action === "PROXY_FETCH_RESPONSE" && event.data.reqId === reqId) {
        window.removeEventListener("message", handleResponse);
        const { status, statusText, ok, headers, body } = event.data;
        resolve({
          status,
          statusText,
          ok,
          headers: new Headers(headers || {}),
          async text() {
            return body || "";
          },
          async json() {
            try {
              return JSON.parse(body || "{}");
            } catch (e) {
              return {};
            }
          },
        });
      }
    }
    window.addEventListener("message", handleResponse);
    window.parent.postMessage(
      {
        action: "PROXY_FETCH",
        reqId,
        url: normalizedUrl,
        init: normalizedInit,
      },
      "*"
    );
  });
};

const browserMock = {
  runtime: {
    async sendMessage(msg) {
      const reqId = "msg_" + Math.random().toString(36).substring(2);
      return new Promise((resolve) => {
        function handleResponse(event) {
          if (event.data?.action === "PROXY_MESSAGE_RESPONSE" && event.data.reqId === reqId) {
            window.removeEventListener("message", handleResponse);
            resolve(event.data.response);
          }
        }
        window.addEventListener("message", handleResponse);
        window.parent.postMessage(
          {
            action: "PROXY_MESSAGE",
            reqId,
            message: msg,
          },
          "*"
        );
      });
    },
  },
};
globalThis.browser = browserMock;
globalThis.chrome = browserMock;

const activeSandboxPlugins = new Map();

window.addEventListener("message", async (event) => {
  if (!event.data) return;

  if (event.data.action === "PING_SANDBOX") {
    window.parent.postMessage({ action: "SANDBOX_READY" }, "*");
  } else if (event.data.action === "REGISTER_PLUGIN") {
    const { pluginId, code } = event.data;
    try {
      const executableCode = code
        .replace(/\bexport\s+default\s+([a-zA-Z0-9_$]+)\s*;?/g, "module.exports = $1; module.exports.default = $1;")
        .replace(/\bexport\s+default\s+/g, "module.exports.default = ")
        .replace(/\bexport\s+(const|let|var|function|class)\s+/g, "$1 ");
      const fn = new Function("module", "exports", executableCode);
      const mockModule = { exports: {} };
      fn(mockModule, mockModule.exports);
      const plugin = mockModule.exports.id
        ? mockModule.exports
        : (mockModule.exports.default || mockModule.exports);

      if (plugin && typeof plugin.id === "string") {
        activeSandboxPlugins.set(plugin.id, plugin);
        window.parent.postMessage(
          {
            action: "PLUGIN_REGISTERED",
            pluginId: plugin.id,
            success: true,
            meta: {
              id: plugin.id,
              name: plugin.name || plugin.id,
              baseUrl: plugin.baseUrl || "",
              version: plugin.version || "1.0.0",
              hasHome: typeof plugin.getHome === "function",
            },
          },
          "*"
        );
      } else {
        window.parent.postMessage(
          {
            action: "PLUGIN_REGISTERED",
            pluginId,
            success: false,
            error: "Plugin did not export a valid plugin object",
          },
          "*"
        );
      }
    } catch (err) {
      window.parent.postMessage(
        {
          action: "PLUGIN_REGISTERED",
          pluginId,
          success: false,
          error: err.message,
        },
        "*"
      );
    }
  } else if (event.data.action === "EXECUTE_PLUGIN_METHOD") {
    const { reqId, pluginId, method, args } = event.data;
    const plugin = activeSandboxPlugins.get(pluginId);
    if (!plugin) {
      window.parent.postMessage(
        {
          action: "EXECUTE_PLUGIN_METHOD_RESPONSE",
          reqId,
          success: false,
          error: `Plugin ${pluginId} not found in sandbox`,
        },
        "*"
      );
      return;
    }
    if (typeof plugin[method] !== "function") {
      window.parent.postMessage(
        {
          action: "EXECUTE_PLUGIN_METHOD_RESPONSE",
          reqId,
          success: false,
          error: `Method ${method} not found on plugin ${pluginId}`,
        },
        "*"
      );
      return;
    }
    try {
      const result = await plugin[method](...(args || []));
      window.parent.postMessage(
        {
          action: "EXECUTE_PLUGIN_METHOD_RESPONSE",
          reqId,
          success: true,
          result,
        },
        "*"
      );
    } catch (err) {
      window.parent.postMessage(
        {
          action: "EXECUTE_PLUGIN_METHOD_RESPONSE",
          reqId,
          success: false,
          error: err.message,
        },
        "*"
      );
    }
  }
});

window.parent.postMessage({ action: "SANDBOX_READY" }, "*");
