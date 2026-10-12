exports.handler = async (event) => {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return jsonResponse(503, { error: "Backend is not configured. Set BACKEND_URL in the Netlify environment variables." });
  }

  const functionPrefix = "/.netlify/functions/api";
  const requestPath = event.path || "";
  const apiPath = (requestPath.startsWith(functionPrefix)
    ? requestPath.slice(functionPrefix.length)
    : requestPath.startsWith("/api/") ? requestPath.slice("/api/".length) : "").replace(/^\/+/, "");
  if (!apiPath) {
    return jsonResponse(404, { error: "API endpoint not found." });
  }

  try {
    const target = new URL(`/api/${apiPath}`, backendUrl);
    for (const [key, value] of Object.entries(event.queryStringParameters || {})) {
      if (value !== null && value !== undefined) target.searchParams.set(key, value);
    }

    const response = await fetch(target, {
      method: event.httpMethod || "GET",
      headers: event.headers?.["content-type"] ? { "content-type": event.headers["content-type"] } : {},
      body: ["GET", "HEAD"].includes(event.httpMethod) ? undefined : event.isBase64Encoded
        ? Buffer.from(event.body || "", "base64")
        : event.body,
    });
    return {
      statusCode: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
      body: await response.text(),
    };
  } catch {
    return jsonResponse(502, { error: "Could not reach the analysis backend. Check BACKEND_URL and the backend deployment." });
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}