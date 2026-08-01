const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff"
};

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.APPS_SCRIPT_WEB_APP_URL || !env.APPS_SCRIPT_API_SECRET) {
    return jsonResponse({
      ok: false,
      error: { message: "Cloudflare ยังไม่ได้ตั้งค่า Apps Script URL หรือ API Secret" }
    }, 500);
  }

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 100000) {
      return jsonResponse({ ok: false, error: { message: "คำขอมีขนาดใหญ่เกินไป" } }, 413);
    }
    body = JSON.parse(raw || "{}");
  } catch {
    return jsonResponse({ ok: false, error: { message: "รูปแบบข้อมูลไม่ถูกต้อง" } }, 400);
  }

  const upstreamPayload = {
    ...body,
    apiSecret: env.APPS_SCRIPT_API_SECRET,
    meta: {
      userAgent: request.headers.get("user-agent") || "",
      country: request.cf?.country || "",
      colo: request.cf?.colo || ""
    }
  };

  try {
    const response = await fetch(env.APPS_SCRIPT_WEB_APP_URL, {
      method: "POST",
      headers: { "content-type": "text/plain; charset=utf-8" },
      body: JSON.stringify(upstreamPayload),
      redirect: "follow"
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return jsonResponse({
        ok: false,
        error: { message: "Apps Script ตอบกลับไม่ถูกต้อง กรุณาตรวจสอบ URL Deployment" }
      }, 502);
    }

    return jsonResponse(parsed, parsed.ok ? 200 : 400);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: { message: "เชื่อมต่อ Google Apps Script ไม่สำเร็จ", detail: String(error) }
    }, 502);
  }
}

export function onRequestGet() {
  return jsonResponse({ ok: true, data: { service: "Moss Assignment Cloudflare Proxy" } });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...JSON_HEADERS, "allow": "POST, GET, OPTIONS" } });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
