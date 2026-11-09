// Netlify Forms 응답이 저장될 때마다 실행되는 이벤트 함수 (함수 이름이 곧 이벤트 이름)
// premium-survey·churn-survey 응답을 디스코드 채널로 보냄. 웹훅 주소는 Netlify 환경 변수 DISCORD_WEBHOOK_URL 에만 둠
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
  date_feature: {
    often: "자주 씀",
    tried: "몇 번 써봄",
    not_yet: "아직 안 씀",
    unaware: "몰랐음",
  },
  feature: {
    image_paste: "📷 이미지 붙여넣기",
    sync: "🔄 기기 간 동기화",
    lock_folder: "🔒 Face ID 잠금 폴더",
    auto_date: "📅 날짜·시간 자동 입력",
    keyboard_search: "🔍 키보드 검색",
    other: "기타",
  },
  churn_reason: {
    price: "💸 가격 부담",
    not_often: "자주 안 씀",
    missing_feature: "필요한 기능 없음",
    bug: "🐞 오류·불편",
    trial_charge: "체험만 하려다 결제됨",
    switched: "다른 앱으로 바꿈",
    other: "기타",
  },
  comeback: {
    discount: "할인·낮은 가격",
    feature: "필요한 기능",
    bug_fix: "문제 해결",
    nothing: "없음",
  },
};

const clip = (value, max) => {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const featureText = (d) => {
  const feature = LABELS.feature[d.feature] ?? d.feature ?? "-";
  return d.feature === "other" && d.feature_other ? `${feature}: ${clip(d.feature_other, 200)}` : feature;
};

const premiumMessage = (d) => {
  const keep = Number(d.keep) || 0;
  return {
    title: "새 프리미엄 설문 응답",
    fields: [
      { name: "원하는 기능", value: featureText(d) || "-", inline: false },
      { name: "유지 가능성", value: keep ? `${"★".repeat(keep)}${"☆".repeat(5 - keep)} (${keep}/5)` : "-", inline: true },
      { name: "용도", value: LABELS.usage[d.usage] ?? d.usage ?? "-", inline: true },
      { name: "구독 이유", value: LABELS.reason[d.reason] ?? d.reason ?? "-", inline: true },
      { name: "📅 날짜·시간 자동 입력", value: LABELS.date_feature[d.date_feature] ?? d.date_feature ?? "-", inline: true },
    ],
  };
};

const churnMessage = (d) => {
  const reason = LABELS.churn_reason[d.reason] ?? d.reason ?? "-";
  return {
    title: "새 구독 취소 설문 응답",
    fields: [
      { name: "취소 이유", value: d.reason === "other" && d.reason_other ? `${reason}: ${clip(d.reason_other, 200)}` : reason, inline: false },
      { name: "다시 구독할 조건", value: LABELS.comeback[d.comeback] ?? d.comeback ?? "-", inline: true },
      { name: "용도", value: LABELS.usage[d.usage] ?? d.usage ?? "-", inline: true },
      { name: "원하는 기능", value: featureText(d) || "-", inline: false },
    ],
  };
};

export default async (req) => {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return new Response("DISCORD_WEBHOOK_URL not set", { status: 200 });

  const { payload } = await req.json();
  const message = payload?.form_name === "premium-survey" ? premiumMessage(payload.data ?? {})
    : payload?.form_name === "churn-survey" ? churnMessage(payload.data ?? {})
    : null;
  if (!message) return new Response("skip", { status: 200 });

  const d = payload.data ?? {};
  const { title, fields } = message;
  if (d.comment) fields.push({ name: "의견", value: clip(d.comment, 1000), inline: false });
  if (d.email) fields.push({ name: "인터뷰 가능 이메일", value: clip(d.email, 200), inline: false });

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "복붙키보드 설문",
      embeds: [{
        title,
        color: 0x26b8d6,
        fields,
        footer: { text: `언어 ${d.lang || "-"} · 유입 ${d.src || "-"}` },
        timestamp: payload.created_at || new Date().toISOString(),
      }],
    }),
  });
  return new Response(res.ok ? "sent" : `discord ${res.status}`, { status: 200 });
};
