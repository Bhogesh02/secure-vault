export function jsonResponse(
  success: boolean,
  data: unknown,
  message = "",
  status = 200,
  headers: HeadersInit = {}
): Response {
  const mergedHeaders = new Headers(headers);
  if (!mergedHeaders.has("content-type")) {
    mergedHeaders.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify({ success, data, message }), {
    status,
    headers: mergedHeaders
  });
}

export function errorResponse(message: string, status = 400, data: unknown = null): Response {
  return jsonResponse(false, data, message, status);
}

export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}
