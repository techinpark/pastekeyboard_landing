// 히어로 키보드 데모 + Android 방문자에게 Google Play 우선 노출
(() => {
  const data = JSON.parse(document.getElementById("demo-data").textContent);
  const $ = (s) => document.querySelector(s);
  const field = $("#field"), thread = $("#thread"), note = $("#note");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let cat = 0, typing = null, text = "";

  document.documentElement.classList.add("js");

  if (/Android/i.test(navigator.userAgent)) {
    document.querySelectorAll("[data-best]").forEach(a => { a.href = data.play; });
    document.querySelectorAll(".stores").forEach(box => box.prepend(box.querySelector(".badge-play")));
  }

  function renderField() {
    field.textContent = text;
    if (text) { const c = document.createElement("span"); c.className = "caret"; field.append(c); }
  }
  function bubble(s) {
    const b = document.createElement("div");
    b.className = "bubble out"; b.textContent = s; thread.append(b);
    while (thread.children.length > 4) thread.firstElementChild.remove();
  }
  function renderKeys() {
    const tabs = $("#tabs"); tabs.replaceChildren();
    data.cats.forEach(([name], i) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = name;
      b.setAttribute("aria-pressed", i === cat);
      b.onclick = () => { cat = i; renderKeys(); };
      tabs.append(b);
    });
    const keys = $("#keys"); keys.replaceChildren();
    data.cats[cat][1].forEach(([alias, full], i) => {
      const k = document.createElement("button");
      k.type = "button"; k.className = "key"; k.id = "key-" + i; k.textContent = alias; k.title = full;
      k.onclick = () => insert(alias, full);
      keys.append(k);
    });
  }
  function insert(alias, full) {
    clearInterval(typing);
    const a = document.createElement("span"); a.className = "from"; a.textContent = alias;
    note.replaceChildren(a, " → " + full);
    const chars = Array.from(full);
    if (text) text += " ";
    if (reduce) { text += full; renderField(); return; }
    let i = 0;
    typing = setInterval(() => {
      text += chars[i++]; renderField();
      if (i >= chars.length) clearInterval(typing);
    }, 26);
  }
  function send() {
    clearInterval(typing);
    if (!text.trim()) return;
    bubble(text); text = ""; renderField();
  }
  $("#send").onclick = send;
  $("#ret").onclick = send;
  $("#del").onclick = () => { clearInterval(typing); text = Array.from(text).slice(0, -1).join(""); renderField(); };
  $("#globe").onclick = () => { cat = (cat + 1) % data.cats.length; renderKeys(); };

  // 스토어 이동 클릭을 GA4 install_click 이벤트로 기록 (어느 위치의 버튼인지 placement 로 구분)
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href*="apps.apple.com"], a[href*="play.google.com"]');
    if (!a || typeof gtag !== "function") return;
    const placement = [["install-bar", ".install-bar"], ["header", ".top"], ["hero", ".hero"], ["end", ".end"]]
      .find(([, sel]) => a.closest(sel))?.[0] || "other";
    gtag("event", "install_click", { store: a.href.includes("play.google.com") ? "google_play" : "app_store", placement });
  });

  renderField();
  renderKeys();
  setupScrollEffects();

  function setupScrollEffects() {
    // 헤더 그림자
    const top = $(".top");
    const onScroll = () => top.classList.toggle("scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();

    if (!("IntersectionObserver" in window)) { document.querySelector(".install-bar").classList.add("show"); return; }

    // 모바일 설치 바: 히어로 설치 배지가 화면 밖으로 나가면 보여 줌
    const bar = $(".install-bar");
    new IntersectionObserver(([e]) => bar.classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < 0))
      .observe($(".hero .stores"));

    if (reduce) return;

    // 스크롤 등장 (형제끼리 조금씩 시차)
    const targets = document.querySelectorAll(".sec-head, .feat, .review, .steps li, .gstats > div, .big-score, .score-side, .faq details, .end .wrap > *, .globe h2, .reviews-note");
    const io = new IntersectionObserver((entries) => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in"); io.unobserve(e.target);
      if (e.target.matches(".gstats > div")) countUp(e.target.querySelector("dd"));
    }), { rootMargin: "0px 0px -8% 0px" });
    targets.forEach(el => {
      if (el.getBoundingClientRect().top < innerHeight) { el.classList.add("in"); return; }
      const i = Array.prototype.indexOf.call(el.parentElement.children, el);
      el.style.setProperty("--d", Math.min(i, 5) * 70 + "ms");
      el.classList.add("reveal"); io.observe(el);
    });
  }

  // 글로벌 수치 카운트업: "76,000+", "76.000+", "155", "4.7" 형태
  function countUp(dd) {
    const raw = dd.textContent.trim();
    const m = raw.match(/^([\d.,]+)(.*)$/); if (!m) return;
    const decimal = /^\d+\.\d$/.test(m[1]);
    const target = decimal ? parseFloat(m[1]) : parseInt(m[1].replace(/[.,]/g, ""), 10);
    const nf = new Intl.NumberFormat(decimal ? "en" : document.documentElement.lang, decimal ? { minimumFractionDigits: 1, maximumFractionDigits: 1 } : {});
    const t0 = performance.now(), dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
      dd.textContent = p < 1 ? nf.format(decimal ? target * eased : Math.round(target * eased)) + m[2] : raw;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  // 첫 화면에서 키보드가 무엇을 하는지 바로 보이도록 한 번 시연
  if (!reduce) {
    setTimeout(() => {
      const k = $("#key-1"); if (!k || text) return;
      k.classList.add("pressed"); k.click();
      setTimeout(() => k.classList.remove("pressed"), 220);
    }, 1100);
  }
})();
