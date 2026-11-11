// RevenueCat 웹훅 → 구독을 취소한 사용자에게 바로 취소 설문 푸시를 보냄 (/.netlify/functions/revenuecat-cancel)
// 앱이 RevenueCat 속성 fcm_token·app_language 를 올려 둬야 보낼 수 있음 (2.9.0 이후)
// 환경 변수 (Netlify 에만 둠, 출력·커밋 금지)
// - RC_WEBHOOK_AUTH: RevenueCat 웹훅에 설정한 Authorization 헤더 값
// - FCM_SERVICE_ACCOUNT: FCM 발송 권한이 있는 서비스 계정 JSON (project_id, client_email, private_key)
// - DISCORD_WEBHOOK_URL: 발송 결과 알림 (없으면 생략)
import { createSign } from "node:crypto";

const SURVEY_URL = "https://pastekeyboard.com/churn-survey/";

const COPY = {
  en: { title: "Sorry to see you go", body: "What could we have done better? Tell us in a 1-minute survey." },
  ko: { title: "구독을 해지하셨네요", body: "어떤 점이 아쉬우셨나요? 1분 설문으로 알려 주시면 더 좋은 앱으로 만들게요." },
  ja: { title: "ご利用ありがとうございました", body: "解約の理由を1分のアンケートで教えてください。アプリの改善に役立てます。" },
  th: { title: "เสียดายที่คุณยกเลิก", body: "บอกเราหน่อยว่าเราควรปรับปรุงอะไร ใช้เวลาแค่ 1 นาที" },
  es: { title: "Lamentamos que te vayas", body: "¿Qué podríamos mejorar? Cuéntanoslo en una encuesta de 1 minuto." },
  "zh-Hant": { title: "很遺憾你取消了訂閱", body: "哪裡讓你不滿意呢？花 1 分鐘填寫問卷，幫助我們改進。" },
};

// 설문 페이지의 normalize 와 같은 규칙 (zh-Hant 만 중국어로, 그 밖의 언어는 영어)
const normalize = (code) => {
  code = String(code || "").toLowerCase();
  if (code.startsWith("zh")) return /hant|tw|hk|mo/.test(code) ? "zh-Hant" : "en";
  code = code.split(/[-_]/)[0];
  return COPY[code] ? code : "en";
};

const attr = (event, key) => event?.subscriber_attributes?.[key]?.value;

const base64url = (input) => Buffer.from(input).toString("base64url");

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(sa.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`oauth ${res.status}`);
  return (await res.json()).access_token;
}

export function buildMessage(event) {
  const lang = normalize(attr(event, "app_language") || attr(event, "locale"));
  const { title, body } = COPY[lang];
  const query = new URLSearchParams({ src: "cancel_push" });
  if (lang !== "en") query.set("lang", lang);
  return {
    lang,
    message: {
      token: attr(event, "fcm_token"),
      notification: { title, body },
      data: { linkURL: `${SURVEY_URL}?${query}`, campaign_id: "churn_survey_cancel_auto" },
      apns: { payload: { aps: { sound: "default" } } },
    },
  };
}

// 직접 해지한 경우만 (결제 실패·환불·개발자 취소 제외). TEST 는 RevenueCat 의 '테스트 이벤트 보내기'
export const shouldSend = (event) =>
  event?.type === "CANCELLATION" && event.cancel_reason === "UNSUBSCRIBE" && event.store === "APP_STORE";

async function notifyDiscord(text) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "복붙키보드 설문", content: text }),
  }).catch(() => {});
}

export default async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });
  const auth = process.env.RC_WEBHOOK_AUTH;
  if (!auth || req.headers.get("authorization") !== auth) return new Response("unauthorized", { status: 401 });

  const { event } = await req.json();
  if (event?.type === "TEST") return new Response("test ok", { status: 200 });
  if (!shouldSend(event)) return new Response("skip", { status: 200 });

  const { lang, message } = buildMessage(event);
  const where = `${event.environment === "SANDBOX" ? "[샌드박스] " : ""}${event.product_id || "-"} · ${event.country_code || "-"} · ${lang}`;
  if (!message.token) {
    await notifyDiscord(`구독 해지 발생 (${where}) — 푸시 토큰 없음(이전 버전), 설문 못 보냄`);
    return new Response("no token", { status: 200 });
  }

  const sa = JSON.parse(process.env.FCM_SERVICE_ACCOUNT || "{}");
  if (!sa.private_key) return new Response("FCM_SERVICE_ACCOUNT not set", { status: 200 });

  // RevenueCat 은 2xx 가 아니면 다시 보내므로, 토큰 만료 같은 FCM 오류도 200 으로 끝냄
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await accessToken(sa)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    await notifyDiscord(`구독 해지 발생 (${where}) — 설문 푸시 ${res.ok ? "보냄" : `실패 ${res.status}`}`);
    return new Response(res.ok ? "sent" : `fcm ${res.status}`, { status: 200 });
  } catch (error) {
    await notifyDiscord(`구독 해지 발생 (${where}) — 설문 푸시 실패 ${error.message}`);
    return new Response("error", { status: 200 });
  }
};
