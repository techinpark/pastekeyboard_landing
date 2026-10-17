// Netlify Forms 응답이 저장될 때마다 실행되는 이벤트 함수 (함수 이름이 곧 이벤트 이름)
// premium-survey 응답을 디스코드 채널로 보냄. 웹훅 주소는 Netlify 환경 변수 DISCORD_WEBHOOK_URL 에만 둠
const LABELS = {
  usage: {
    selling: "판매·고객 응대",
    work: "업무 메시지·메일",
    personal: "개인 정보 입력",
    social: "SNS 글·댓글",
    other: "기타",
  },
  reason: {
    no_ads: "광고 제거",
    unlimited: "무제한 저장",
    folders: "폴더 추가",
    alias: "별명",
    support_dev: "개발자 응원",
    other: "기타",
  },
  feature: {
    image_paste: "📷 이미지 붙여넣기",
    sync: "🔄 기기 간 동기화",
    lock_folder: "🔒 Face ID 잠금 폴더",
    auto_date: "📅 날짜·시간 자동 입력",
    keyboard_search: "🔍 키보드 검색",
    other: "기타",
  },
};

const clip = (value, max) => {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

export default async (req) => {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return new Response("DISCORD_WEBHOOK_URL not set", { status: 200 });

  const { payload } = await req.json();
  if (payload?.form_name !== "premium-survey") return new Response("skip", { status: 200 });

  const d = payload.data ?? {};
  const feature = LABELS.feature[d.feature] ?? d.feature ?? "-";
  const featureText = d.feature === "other" && d.feature_other ? `${feature}: ${clip(d.feature_other, 200)}` : feature;
  const keep = Number(d.keep) || 0;

  const fields = [
    { name: "원하는 기능", value: featureText || "-", inline: false },
    { name: "유지 가능성", value: keep ? `${"★".repeat(keep)}${"☆".repeat(5 - keep)} (${keep}/5)` : "-", inline: true },
    { name: "용도", value: LABELS.usage[d.usage] ?? d.usage ?? "-", inline: true },
    { name: "구독 이유", value: LABELS.reason[d.reason] ?? d.reason ?? "-", inline: true },
  ];
  if (d.comment) fields.push({ name: "의견", value: clip(d.comment, 1000), inline: false });
  if (d.email) fields.push({ name: "인터뷰 가능 이메일", value: clip(d.email, 200), inline: false });

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "복붙키보드 설문",
      embeds: [{
        title: "새 프리미엄 설문 응답",
        color: 0x26b8d6,
        fields,
        footer: { text: `언어 ${d.lang || "-"} · 유입 ${d.src || "-"}` },
        timestamp: payload.created_at || new Date().toISOString(),
      }],
    }),
  });
  return new Response(res.ok ? "sent" : `discord ${res.status}`, { status: 200 });
};
