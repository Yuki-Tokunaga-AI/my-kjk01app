const appRoot = document.getElementById("app");

const state = {
  currentScreen: "authChoice",
  submitting: false,
  error: "",
  flashMessage: "",
  currentMember: null,
  currentAdmin: null,
  publicData: null,
  appData: null,
  adminData: null,
  selectedPlayerId: null,
  selectedMissionId: null,
  selectedPassId: null,
  selectedProductId: null,
  selectedReportId: null,
  latestReceipt: null,
  catalogFilters: {
    club: "",
    grade: "",
    position: "",
    tag: ""
  }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
}

function yen(value) {
  return `¥${Number(value || 0).toLocaleString("ja-JP")}`;
}

function getClubs() {
  return state.publicData?.clubs || [];
}

function getReports() {
  return state.appData?.reports || state.publicData?.reports || [];
}

function getData() {
  return state.appData?.data || null;
}

function getOrders() {
  return state.appData?.orders || [];
}

function getPhotoPosts() {
  return state.appData?.photoPosts || [];
}

function getBoardPosts() {
  return state.appData?.boardPosts || [];
}

function getPublicPlayers() {
  return state.publicData?.players || [];
}

function getSelectedPlayer() {
  const players = getData()?.players || getPublicPlayers();
  if (!state.selectedPlayerId) {
    return null;
  }
  return players.find((player) => player.id === state.selectedPlayerId) || null;
}

function getSelectedMission() {
  const missions = getData()?.missions || [];
  return missions.find((mission) => mission.id === state.selectedMissionId) || missions[0] || null;
}

function getSelectedPass() {
  const passes = getData()?.passes || [];
  return passes.find((item) => item.id === state.selectedPassId) || passes[0] || null;
}

function getSelectedProduct() {
  const products = getData()?.products || [];
  return products.find((item) => item.id === state.selectedProductId) || products[0] || null;
}

function getSelectedReport() {
  const reports = getReports();
  return reports.find((report) => report.id === state.selectedReportId) || reports[0] || null;
}

function isMissionCompleted(mission) {
  return Boolean(mission?.completedAt || mission?.status === "達成済み" || mission?.status === "COMPLETE");
}

function getMissionGroupLabel(group) {
  return group === "grand" ? "グランドミッション" : "デイリーミッション";
}

function getGroupedMissions() {
  const missions = getData()?.missions || [];
  return {
    daily: missions.filter((mission) => (mission.missionGroup || "daily") === "daily"),
    grand: missions.filter((mission) => (mission.missionGroup || "daily") === "grand")
  };
}

function setMessage(message = "") {
  state.flashMessage = message;
}

function navigate(screenId, overrides = {}) {
  Object.assign(state, overrides);
  state.currentScreen = screenId;
  state.error = "";
  renderApp();
}

async function callApi(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || "Request failed.");
  }
  return result;
}

function pill(text, tone = "") {
  return `<span class="pill ${tone}">${escapeHtml(text)}</span>`;
}

function card(title, body, actions = "", meta = "") {
  return `
    <article class="card">
      ${meta ? `<div class="card__meta">${meta}</div>` : ""}
      <h3>${escapeHtml(title)}</h3>
      <div class="card__body">${body}</div>
      ${actions ? `<div class="card__actions">${actions}</div>` : ""}
    </article>
  `;
}

function primaryButton(label, action, extra = "") {
  return `<button class="button button--primary" data-action="${action}" ${extra}>${escapeHtml(label)}</button>`;
}

function secondaryButton(label, action, extra = "") {
  return `<button class="button button--secondary" data-action="${action}" ${extra}>${escapeHtml(label)}</button>`;
}

function getCatalogFilterOptions() {
  const players = getPublicPlayers();
  return {
    clubs: [...new Set(players.map((player) => player.proClub).filter(Boolean))],
    grades: [...new Set(players.map((player) => player.grade).filter(Boolean))],
    positions: [...new Set(players.map((player) => player.position).filter(Boolean))],
    tags: [...new Set(players.flatMap((player) => player.interestTags || []))]
  };
}

function getFilteredCatalogPlayers() {
  const players = getPublicPlayers();
  const { club, grade, position, tag } = state.catalogFilters;
  return players.filter((player) => {
    if (club && player.proClub !== club) return false;
    if (grade && player.grade !== grade) return false;
    if (position && player.position !== position) return false;
    if (tag && !(player.interestTags || []).includes(tag)) return false;
    return true;
  });
}

function getPlayerImageUrl(player) {
  const accent = ["#2f6cff", "#1de0a4", "#ff6c85", "#ffc34d"][player.name.length % 4];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#09111f" />
          <stop offset="100%" stop-color="${accent}" />
        </linearGradient>
      </defs>
      <rect width="480" height="480" rx="40" fill="url(#g)" />
      <circle cx="240" cy="165" r="82" fill="rgba(255,255,255,0.18)" />
      <path d="M118 390c22-72 72-112 122-112s100 40 122 112" fill="rgba(255,255,255,0.15)" />
      <text x="240" y="420" text-anchor="middle" fill="#f3f7ff" font-size="28" font-family="Arial, sans-serif">${escapeHtml(player.position || "YP")} / #${escapeHtml(player.jerseyNumber)}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderPlayerMedia(player, compact = false) {
  return `
    <div class="player-media ${compact ? "player-media--compact" : ""}">
      <img src="${getPlayerImageUrl(player)}" alt="${escapeHtml(player.name)}" class="player-media__image" />
      <div class="player-media__badge">OFFICIAL DATA REFERENCE</div>
    </div>
  `;
}

function getPassPlan(passItem, planType = "") {
  const plans = passItem?.planOptions || [];
  return plans.find((item) => item.id === planType) || plans[0] || null;
}

function normalizeQrValue(value) {
  return String(value || "").trim().toUpperCase();
}

function renderMessageBlock() {
  return `
    ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
    ${state.flashMessage ? `<p class="message message--success">${escapeHtml(state.flashMessage)}</p>` : ""}
  `;
}

function renderAuthChoice() {
  return `
    <section class="screen screen--hero">
      <div class="hero-surface">
        <div class="eyebrow">B.LEAGUE BOOST WEB</div>
        <h1>ユース支援WEBサービス</h1>
        <p class="lead">ログイン後にユース選手カタログから推し選手を選び、ミッション、QRチェックイン、共同育成パス購入、掲示板交流までをブラウザ上で利用できます。</p>
        <div class="hero-tags">
          ${pill("B1/B2 CLUBS")}
          ${pill("YOUTH CATALOG")}
          ${pill("QR CHECK-IN")}
        </div>
      </div>
      <div class="card">
        <div class="card__meta">SERVICE OVERVIEW</div>
        <h3>できること</h3>
        <div class="card__body">
          <p>ユース選手の情報閲覧、推し選手設定、ミッション達成、共同育成パス購入、グッズ決済、掲示板での情報共有に対応しています。</p>
          <p>TISコーポレートカラーをベースに、PCでも見やすいWEB画面として再構成しています。</p>
        </div>
      </div>
      <div class="stack-actions">
        ${primaryButton("ログイン", "navigate", 'data-target="login"')}
        ${secondaryButton("管理者ログイン", "navigate", 'data-target="adminLogin"')}
      </div>
    </section>
  `;
}

function renderLogin() {
  return `
    <section class="screen screen--hero">
      <div class="hero-surface hero-surface--compact">
        <div class="eyebrow">MEMBER LOGIN</div>
        <h1>ログイン</h1>
        <p class="lead">登録済みの会員情報でログインします。</p>
      </div>
      <form class="form-card" id="login-form">
        <label class="field">
          <span>メールアドレス</span>
          <input name="identifier" type="email" value="kjktest1@gmail.com" required />
        </label>
        <label class="field">
          <span>パスワード</span>
          <input name="password" type="password" required />
        </label>
        ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
        <div class="stack-actions">
          <button class="button button--primary" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "ログイン中..." : "ログインする"}</button>
        </div>
      </form>
    </section>
  `;
}

function renderSignup() {
  const clubs = getClubs();
  if (!clubs.length) {
    return renderLoading("クラブ情報を読み込んでいます。");
  }
  return `
    <section class="screen">
      <div class="hero-surface hero-surface--compact">
        <div class="eyebrow">CREATE ACCOUNT</div>
        <h1>会員登録</h1>
        <p class="lead">最初はランク0からスタートします。推し選手は登録後にユース選手カタログから設定できます。</p>
      </div>
      <form class="form-card" id="signup-form">
        <label class="field">
          <span>名前</span>
          <input name="name" type="text" required />
        </label>
        <label class="field">
          <span>メールアドレス</span>
          <input name="email" type="email" required />
        </label>
        <label class="field">
          <span>パスワード</span>
          <input name="password" type="password" required />
        </label>
        <label class="field">
          <span>応援クラブ</span>
          <select name="favoriteTeam" required>
            <option value="">選択してください</option>
            ${clubs.map((club) => `<option value="${escapeHtml(club.name)}">${escapeHtml(club.league)} / ${escapeHtml(club.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>生年月日</span>
          <input name="birthdate" type="date" required />
        </label>
        ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
        <div class="stack-actions">
          <button class="button button--primary" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "登録中..." : "登録する"}</button>
          ${secondaryButton("ログインへ", "navigate", 'data-target="login"')}
        </div>
      </form>
    </section>
  `;
}

function renderCatalog() {
  const options = getCatalogFilterOptions();
  const players = getFilteredCatalogPlayers();
  return `
    <section class="screen">
      <div class="hero-surface hero-surface--compact">
        <div class="eyebrow">YOUTH CATALOG</div>
        <h2>ユース選手カタログ</h2>
        <p class="lead">公式参照ベースのユース選手情報を確認し、推し選手を設定できます。画像は閲覧用のカードビジュアルです。</p>
      </div>
      <form class="form-card" id="catalog-filter-form">
        <label class="field">
          <span>クラブ</span>
          <select name="club">
            <option value="">すべて</option>
            ${options.clubs.map((club) => `<option value="${escapeHtml(club)}" ${state.catalogFilters.club === club ? "selected" : ""}>${escapeHtml(club)}</option>`).join("")}
          </select>
        </label>
        <div class="field-row">
          <label class="field">
            <span>学年</span>
            <select name="grade">
              <option value="">すべて</option>
              ${options.grades.map((grade) => `<option value="${escapeHtml(grade)}" ${state.catalogFilters.grade === grade ? "selected" : ""}>${escapeHtml(grade)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>ポジション</span>
            <select name="position">
              <option value="">すべて</option>
              ${options.positions.map((position) => `<option value="${escapeHtml(position)}" ${state.catalogFilters.position === position ? "selected" : ""}>${escapeHtml(position)}</option>`).join("")}
            </select>
          </label>
        </div>
        <label class="field">
          <span>関心タグ</span>
          <select name="tag">
            <option value="">すべて</option>
            ${options.tags.map((tag) => `<option value="${escapeHtml(tag)}" ${state.catalogFilters.tag === tag ? "selected" : ""}>${escapeHtml(tag)}</option>`).join("")}
          </select>
        </label>
      </form>
      <div class="catalog-grid">
        ${players.length ? players.map((player) => `
          <article class="card catalog-card">
            ${renderPlayerMedia(player, true)}
            <div class="card__meta">${escapeHtml(player.proClub)}</div>
            <h3>${escapeHtml(player.name)} #${escapeHtml(player.jerseyNumber)}</h3>
            <div class="card__body">
              <p>${escapeHtml(player.club)} / ${escapeHtml(player.grade)} / ${escapeHtml(player.position)} / ${escapeHtml(player.heightCm)}cm</p>
              <p><strong>選手情報:</strong> ${escapeHtml(player.headline || player.story || "")}</p>
              <p><strong>プレースタイル:</strong> ${escapeHtml(player.playStyle || "")}</p>
              <p><strong>直近の成長テーマ:</strong> ${escapeHtml(player.growthTheme || "")}</p>
              <div class="hero-tags">${(player.interestTags || []).map((tag) => pill(tag)).join("")}</div>
            </div>
            <div class="card__actions">
              ${primaryButton("選手詳細を見る", "open-player", `data-player-id="${player.id}"`)}
              ${state.currentMember ? primaryButton("推し選手に設定", "set-favorite-player", `data-player-id="${player.id}"`) : secondaryButton("ログインして設定", "navigate", 'data-target="login"')}
            </div>
          </article>
        `).join("") : `<div class="complete-panel"><p>条件に合う選手が見つかりませんでした。</p></div>`}
      </div>
    </section>
  `;
}

function renderAdminLogin() {
  return `
    <section class="screen screen--hero">
      <div class="hero-surface hero-surface--compact">
        <div class="eyebrow">ADMIN LOGIN</div>
        <h1>管理者ログイン</h1>
        <p class="lead">管理者IDで会員、ミッション、購入状況を確認します。</p>
      </div>
      <form class="form-card" id="admin-login-form">
        <label class="field">
          <span>管理者ID</span>
          <input name="adminId" type="text" required />
        </label>
        <label class="field">
          <span>パスワード</span>
          <input name="password" type="password" required />
        </label>
        ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
        <div class="stack-actions">
          <button class="button button--primary" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "認証中..." : "管理者ログイン"}</button>
          ${secondaryButton("トップへ戻る", "navigate", 'data-target="authChoice"')}
        </div>
      </form>
    </section>
  `;
}

function renderHome() {
  const data = getData();
  if (!data || !state.currentMember) {
    return renderEmptyState("会員データを読み込めませんでした。");
  }
  const player = getSelectedPlayer();
  const groupedMissions = getGroupedMissions();
  const mission = groupedMissions.daily.find((item) => !isMissionCompleted(item))
    || groupedMissions.grand.find((item) => !isMissionCompleted(item))
    || groupedMissions.daily[0]
    || groupedMissions.grand[0];
  return `
    <section class="screen">
      <div class="hero-surface">
        <div class="eyebrow">BOOST HOME</div>
        <h2>${escapeHtml(state.currentMember.name)}さんのホーム</h2>
        <p class="lead">${escapeHtml(state.currentMember.favoriteTeam)} / 推し選手 ${escapeHtml(player?.name || "未設定")}</p>
        ${renderMessageBlock()}
        <div class="score-grid">
          <div class="score-card"><strong>${escapeHtml(data.ledger.supportPoints)}</strong><span>BOOST PT</span></div>
          <div class="score-card"><strong>${escapeHtml(data.ledger.rank)}</strong><span>RANK</span></div>
          <div class="score-card"><strong>${escapeHtml(data.ledger.nextUnlock)}</strong><span>NEXT</span></div>
        </div>
      </div>
      ${player ? `
        <div class="spotlight-card spotlight-card--player">
          ${renderPlayerMedia(player, true)}
          <div>
            <div class="eyebrow">PUSH PLAYER</div>
            <h3>${escapeHtml(player.name)} #${escapeHtml(player.jerseyNumber)}</h3>
            <p>${escapeHtml(player.club)} / ${escapeHtml(player.position)} / ${escapeHtml(player.ageLabel)}</p>
          </div>
          <div class="mini-stats">
            <span>${escapeHtml(player.recordSummary.points)} PTS</span>
            <span>${escapeHtml(player.recordSummary.assists)} AST</span>
            <span>${escapeHtml(player.recordSummary.rebounds)} REB</span>
          </div>
        </div>
      ` : card("推し選手を選ぶ", "<p>ユース選手カタログから推し選手を設定してください。</p>", primaryButton("カタログを見る", "navigate", 'data-target="catalog"'), "CATALOG")}
      ${mission ? card(
        "今日のミッション",
        `<div class="quest-summary"><div class="quest-topline">${pill(mission.type)} ${pill(mission.difficulty, mission.difficulty === "HARD" ? "pill--alert" : "")}</div><strong>${escapeHtml(mission.title)}</strong><p>${escapeHtml(mission.story)}</p><p>${escapeHtml(mission.rewardPoints)}pt / ${escapeHtml(mission.deadlineLabel || "")}</p></div>`,
        primaryButton("ミッション詳細へ", "open-mission", `data-mission-id="${mission.id}"`),
        isMissionCompleted(mission) ? "COMPLETE" : "ACTIVE"
      ) : ""}
      ${card(
        "サンプルレポート",
        `<p>分析ミッション用のサンプルレポートを確認できます。</p>`,
        primaryButton("レポートを見る", "open-report", `data-report-id="${getReports()[0]?.id || ""}"`),
        "REPORT"
      )}
    </section>
  `;
}

function renderPlayers() {
  const players = getData()?.players || [];
  return `
    <section class="screen">
      ${players.map((player) => `
        <article class="card catalog-card">
          ${renderPlayerMedia(player, true)}
          <div class="card__meta">${player.isFollowed ? "TRACKING" : "WATCH"}</div>
          <h3>${escapeHtml(player.name)} #${escapeHtml(player.jerseyNumber)}</h3>
          <div class="card__body">
            <p>${escapeHtml(player.club)} / ${escapeHtml(player.position)} / ${escapeHtml(player.heightCm)}cm</p>
            <p>${escapeHtml(player.headline || "")}</p>
            <div class="metric-row">${(player.seasonMetrics || []).map((metric) => `<div class="metric-chip"><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span></div>`).join("")}</div>
          </div>
          <div class="card__actions">
            ${primaryButton("選手詳細を見る", "open-player", `data-player-id="${player.id}"`)}
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderPlayerDetail() {
  const player = getSelectedPlayer();
  if (!player) {
    return renderEmptyState("選手情報が見つかりません。");
  }
  const passItem = (getData()?.passes || []).find((item) => item.playerId === player.id) || getData()?.passes?.[0];
  return `
    <section class="screen">
      <div class="player-panel">
        ${renderPlayerMedia(player)}
        <div class="eyebrow">PLAYER RECORD</div>
        <h2>${escapeHtml(player.name)} #${escapeHtml(player.jerseyNumber)}</h2>
        <p>${escapeHtml(player.club)} / ${escapeHtml(player.position)} / ${escapeHtml(player.heightCm)}cm / ${escapeHtml(player.weightKg)}kg</p>
        <p>${escapeHtml(player.story || "")}</p>
        <div class="record-board">
          <div><strong>${escapeHtml(player.recordSummary.points)}</strong><span>PTS</span></div>
          <div><strong>${escapeHtml(player.recordSummary.assists)}</strong><span>AST</span></div>
          <div><strong>${escapeHtml(player.recordSummary.rebounds)}</strong><span>REB</span></div>
          <div><strong>${escapeHtml(player.recordSummary.steals)}</strong><span>STL</span></div>
        </div>
        <p class="form-note">${escapeHtml(player.recordSummary.gameLabel || "")} / ${escapeHtml(player.recordSummary.minutes)} min</p>
      </div>
      ${card(
        "ユース選手情報",
        `<p><strong>プレースタイル:</strong> ${escapeHtml(player.playStyle || "")}</p><p><strong>直近の成長テーマ:</strong> ${escapeHtml(player.growthTheme || "")}</p><p><strong>次の目標:</strong> ${escapeHtml(player.nextGoal || "")}</p><ul class="plain-list">${(player.updates || []).map((update) => `<li>${escapeHtml(update)}</li>`).join("")}</ul>`,
        player.isFollowed
          ? primaryButton("共同育成パスを見る", "open-pass", `data-pass-id="${passItem?.id || ""}"`)
          : `${primaryButton("この選手を追う", "follow-player", `data-player-id="${player.id}"`)} ${secondaryButton("共同育成パスを見る", "open-pass", `data-pass-id="${passItem?.id || ""}"`)}`,
        player.isFollowed ? "TRACKING ACTIVE" : "NEW TARGET"
      )}
    </section>
  `;
}

function renderPassDetail() {
  const passItem = getSelectedPass();
  if (!passItem) {
    return renderEmptyState("共同育成パスが見つかりません。");
  }
  return `
    <section class="screen">
      ${card(
        passItem.title,
        `<p>${escapeHtml(passItem.description || "ユース選手の成長を支える共同育成パスです。")} / 残り${escapeHtml(passItem.remainingSlots)}枠</p><p><strong>使途候補:</strong> ${(passItem.purposeOptions || []).map((item) => escapeHtml(item)).join(" / ")}</p><div class="review-list">${(passItem.planOptions || []).map((plan) => `<div class="checkout-summary"><div><strong>${escapeHtml(plan.label)}</strong><span>${yen(plan.price)}</span></div><p>${escapeHtml(plan.description || "")}</p></div>`).join("")}</div>`,
        passItem.isPurchased ? `<button class="button button--secondary" disabled>購入済み</button>` : primaryButton("購入内容を確認する", "navigate", 'data-target="passCheckout"'),
        "BOOST PASS"
      )}
      ${card(
        "購入前の確認",
        `<div class="notice-panel"><p><strong>返礼なし:</strong> ${escapeHtml(passItem.noReturnNotice || "返礼なし")}</p><p><strong>権利:</strong></p><ul class="plain-list">${(passItem.rights || []).map((right) => `<li>${escapeHtml(right)}</li>`).join("")}</ul><p><strong>注意事項:</strong></p><ul class="plain-list">${(passItem.cautions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`,
        secondaryButton("マイページへ", "navigate", 'data-target="mypage"'),
        "NOTICE"
      )}
    </section>
  `;
}

function renderPassCheckout() {
  const passItem = getSelectedPass();
  const defaultPlan = getPassPlan(passItem);
  if (!passItem || !defaultPlan) {
    return renderEmptyState("購入対象の共同育成パスが見つかりません。");
  }
  return `
    <section class="screen">
      ${card(
        "共同育成パス購入",
        `
          <p>${escapeHtml(passItem.title)}</p>
          <form class="form-card form-card--inline" id="pass-checkout-form">
            <label class="field">
              <span>購入プラン</span>
              <select name="planType" required>
                ${(passItem.planOptions || []).map((plan, index) => `<option value="${escapeHtml(plan.id)}" ${index === 0 ? "selected" : ""}>${escapeHtml(plan.label)} / ${yen(plan.price)}</option>`).join("")}
              </select>
            </label>
            <label class="field">
              <span>使途</span>
              <select name="supportPurpose" required>
                <option value="">選択してください</option>
                ${(passItem.purposeOptions || []).map((purpose) => `<option value="${escapeHtml(purpose)}">${escapeHtml(purpose)}</option>`).join("")}
              </select>
            </label>
            <div class="notice-panel">
              <p><strong>返礼なし:</strong> ${escapeHtml(passItem.noReturnNotice || "返礼なし")}</p>
              <p><strong>プラン説明:</strong> ${escapeHtml(defaultPlan.description || "")}</p>
              <p><strong>権利:</strong></p>
              <ul class="plain-list">${(passItem.rights || []).map((right) => `<li>${escapeHtml(right)}</li>`).join("")}</ul>
              <p><strong>注意事項:</strong></p>
              <ul class="plain-list">${(passItem.cautions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>
            ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
            <div class="stack-actions">
              <button class="button button--primary" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "購入中..." : "内容を確認して購入する"}</button>
            </div>
          </form>
        `,
        "",
        "SUPPORT CHECKOUT"
      )}
    </section>
  `;
}

function renderPassComplete() {
  const receipt = state.latestReceipt;
  return `
    <section class="screen">
      <div class="complete-panel">
        <div class="eyebrow">BOOST PURCHASED</div>
        <h2>共同育成パスの購入が完了しました</h2>
        <p>${escapeHtml(state.flashMessage || "購入内容を更新しました。")}</p>
        ${receipt ? `<div class="checkout-summary"><div><strong>${escapeHtml(receipt.planLabel || "Plan")}</strong><span>${yen(receipt.price || 0)}</span></div><div><strong>使途</strong><span>${escapeHtml(receipt.supportPurpose || "")}</span></div></div>` : ""}
      </div>
      <div class="stack-actions">
        ${primaryButton("マイページを見る", "navigate", 'data-target="mypage"')}
        ${secondaryButton("選手一覧へ", "navigate", 'data-target="players"')}
      </div>
    </section>
  `;
}

function renderMissions() {
  const { daily, grand } = getGroupedMissions();
  const renderMissionCards = (missions) => missions.length
    ? missions.map((mission) => card(
        mission.title,
        `<div class="quest-summary"><div class="quest-topline">${pill(mission.type)} ${pill(mission.difficulty, mission.difficulty === "HARD" ? "pill--alert" : "")}</div><p>${escapeHtml(mission.story || "")}</p><p>${escapeHtml(mission.rewardPoints)}pt / ${escapeHtml(mission.deadlineLabel || "")}</p></div>`,
        primaryButton("ミッション詳細", "open-mission", `data-mission-id="${mission.id}"`),
        isMissionCompleted(mission) ? "COMPLETE" : "ACTIVE"
      )).join("")
    : `<div class="complete-panel"><p>現在表示できるミッションはありません。</p></div>`;

  return `
    <section class="screen">
      ${card(
        getMissionGroupLabel("daily"),
        `<p>毎日または短い周期で挑戦するミッションです。</p>`,
        "",
        "DAILY"
      )}
      ${renderMissionCards(daily)}
      ${card(
        getMissionGroupLabel("grand"),
        `<p>来場や特別体験など、重みのあるチャレンジです。</p>`,
        "",
        "GRAND"
      )}
      ${renderMissionCards(grand)}
    </section>
  `;
}

function renderMissionDetail() {
  const mission = getSelectedMission();
  if (!mission) {
    return renderEmptyState("ミッション情報が見つかりません。");
  }
  let actions = `<button class="button button--secondary" disabled>達成済み</button>`;
  if (!isMissionCompleted(mission)) {
    if (mission.kind === "report") {
      actions = primaryButton("レポートを読む", "open-report", `data-report-id="${mission.reportId}" data-mission-id="${mission.id}"`);
    } else if (mission.kind === "photo") {
      actions = primaryButton("写真を投稿する", "navigate", 'data-target="photoPost"');
    } else if (mission.kind === "arena") {
      actions = primaryButton("QRを読み取る", "navigate", 'data-target="checkinScan"');
    } else {
      actions = primaryButton("このミッションを達成", "complete-mission", `data-mission-id="${mission.id}"`);
    }
  }
  return `
    <section class="screen">
      <div class="quest-hero">
        <div class="quest-topline">${pill(mission.type)} ${pill(mission.difficulty, mission.difficulty === "HARD" ? "pill--alert" : "")}</div>
        <h2>${escapeHtml(mission.title)}</h2>
        <p>${escapeHtml(mission.story || "")}</p>
      </div>
      ${card(
        "達成条件",
        `<ul class="plain-list">${(mission.objectives || []).map((objective) => `<li>${escapeHtml(objective)}</li>`).join("")}</ul><p>報酬: ${escapeHtml(mission.rewardPoints)}pt</p>${mission.venueLabel ? `<p>会場QR: ${escapeHtml(mission.venueLabel)}</p>` : ""}${mission.note ? `<p>メモ: ${escapeHtml(mission.note)}</p>` : ""}`,
        actions,
        isMissionCompleted(mission) ? "COMPLETE" : "ACTIVE"
      )}
    </section>
  `;
}

function renderReportDetail() {
  const report = getSelectedReport();
  if (!report) {
    return renderEmptyState("レポートが見つかりません。");
  }
  const mission = (getData()?.missions || []).find((item) => item.reportId === report.id);
  const player = (getData()?.players || getPublicPlayers()).find((item) => item.id === report.playerId);
  return `
    <section class="screen">
      <div class="hero-surface hero-surface--compact">
        <div class="eyebrow">SAMPLE REPORT</div>
        <h2>${escapeHtml(report.title)}</h2>
        <p>${escapeHtml(player?.name || "")} / ${escapeHtml(report.publishedAt || "")} / ${escapeHtml(report.opponent || "")}</p>
      </div>
      ${card(
        "Summary",
        `<p>${escapeHtml(report.summary || "")}</p><div class="metric-row">${(report.focusMetrics || []).map((metric) => `<div class="metric-chip"><strong>${escapeHtml(metric.value)}</strong><span>${escapeHtml(metric.label)}</span></div>`).join("")}</div>`,
        "",
        "REPORT"
      )}
      ${(report.sections || []).map((section) => card(section.heading, `<p>${escapeHtml(section.body || "")}</p>`, "", "SECTION")).join("")}
      ${card(
        "Watch Points",
        `<ul class="plain-list">${(report.watchPoints || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`,
        mission && !isMissionCompleted(mission) ? primaryButton("このレポートで達成", "complete-mission", `data-mission-id="${mission.id}"`) : secondaryButton("ミッション一覧へ", "navigate", 'data-target="missions"'),
        "WATCH"
      )}
    </section>
  `;
}

function renderCheckinScan() {
  const mission = getSelectedMission();
  return `
    <section class="screen">
      ${card(
        "QRチェックイン",
        `
          <p>${escapeHtml(mission?.story || "会場に掲示されたQRを読み取ってチェックインします。")}</p>
          <p class="form-note">推奨: 会場QRを撮影した画像をアップロードしてください。非対応ブラウザではコード手入力も使えます。</p>
          <form class="form-card form-card--inline" id="checkin-form">
            <label class="field">
              <span>QR画像</span>
              <input name="qrImage" type="file" accept="image/*" capture="environment" />
            </label>
            <label class="field">
              <span>コード手入力</span>
              <input name="manualCode" type="text" placeholder="BLEAGUE-U18-CHECKIN-2026" />
            </label>
            ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
            <div class="stack-actions">
              <button class="button button--primary" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "読み取り中..." : "QRを読み取ってチェックイン"}</button>
            </div>
          </form>
        `,
        "",
        "QR CHECK-IN"
      )}
    </section>
  `;
}

function renderCheckinComplete() {
  return `
    <section class="screen">
      <div class="complete-panel">
        <div class="eyebrow">QUEST CLEARED</div>
        <h2>チェックインが完了しました</h2>
        <p>${escapeHtml(state.flashMessage || "チェックイン結果を更新しました。")}</p>
      </div>
      <div class="stack-actions">
        ${primaryButton("ミッション一覧へ", "navigate", 'data-target="missions"')}
        ${secondaryButton("マイページへ", "navigate", 'data-target="mypage"')}
      </div>
    </section>
  `;
}

function renderPhotoPost() {
  const mission = getSelectedMission();
  return `
    <section class="screen">
      ${card(
        "写真投稿ミッション",
        `
          <p>${escapeHtml(mission?.story || "")}</p>
          <form class="form-card form-card--inline" id="photo-mission-form">
            <label class="field">
              <span>写真</span>
              <input name="photo" type="file" accept="image/*" required />
            </label>
            <label class="field">
              <span>コメント</span>
              <textarea name="note" rows="4" placeholder="20文字以上で入力してください" required></textarea>
            </label>
            ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
            <div class="stack-actions">
              <button class="button button--primary" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "投稿中..." : "写真を投稿して達成する"}</button>
            </div>
          </form>
        `,
        "",
        "PHOTO QUEST"
      )}
    </section>
  `;
}

function renderPostComplete() {
  const photo = getPhotoPosts()[0];
  return `
    <section class="screen">
      <div class="complete-panel">
        <div class="eyebrow">PHOTO POSTED</div>
        <h2>写真投稿が完了しました</h2>
        <p>${escapeHtml(state.flashMessage || "投稿内容を更新しました。")}</p>
      </div>
      ${photo ? `<div class="photo-card"><img src="${photo.imageDataUrl}" alt="${escapeHtml(photo.imageName)}" class="photo-thumb" /><p>${escapeHtml(photo.caption)}</p></div>` : ""}
      <div class="stack-actions">
        ${primaryButton("マイページを見る", "navigate", 'data-target="mypage"')}
        ${secondaryButton("ミッション一覧へ", "navigate", 'data-target="missions"')}
      </div>
    </section>
  `;
}

function renderLedger() {
  const ledger = getData()?.ledger;
  if (!ledger) {
    return renderEmptyState("台帳情報が見つかりません。");
  }
  return `
    <section class="screen">
      ${card(
        "応援台帳",
        `<p>${escapeHtml(ledger.rank)}</p><p>${escapeHtml(ledger.supportPoints)} pt</p><p>${escapeHtml(ledger.nextUnlock)}</p>`,
        "",
        "LEDGER"
      )}
      <div class="ledger-list">
        ${(ledger.history || []).map((item) => `
          <div class="ledger-row">
            <div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.date)}</p></div>
            <div class="ledger-row__meta"><strong>${escapeHtml(item.points)}pt</strong><span>${escapeHtml(item.tag)}</span></div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderMarket() {
  const products = getData()?.products || [];
  return `
    <section class="screen">
      ${products.map((product) => card(
        product.name,
        `<p>${escapeHtml(product.subtitle || "")}</p><p>${yen(product.price)}</p>`,
        primaryButton("商品詳細を見る", "open-product", `data-product-id="${product.id}"`),
        product.isPurchased ? "PURCHASED" : "STORE"
      )).join("")}
    </section>
  `;
}

function renderProductDetail() {
  const product = getSelectedProduct();
  if (!product) {
    return renderEmptyState("商品情報が見つかりません。");
  }
  return `
    <section class="screen">
      ${card(
        product.name,
        `<p>${escapeHtml(product.subtitle || "")}</p><p>${yen(product.price)}</p><ul class="plain-list">${(product.bundleItems || product.specs || []).map((item) => `<li>${escapeHtml(typeof item === "string" ? item : `${item.label}: ${item.value}`)}</li>`).join("")}</ul>`,
        product.isPurchased ? `<button class="button button--secondary" disabled>購入済み</button>` : primaryButton("決済へ進む", "open-checkout", `data-product-id="${product.id}"`),
        "STORE"
      )}
    </section>
  `;
}

function renderCheckout() {
  const product = getSelectedProduct();
  if (!product) {
    return renderEmptyState("決済対象の商品が見つかりません。");
  }
  return `
    <section class="screen">
      <form class="form-card" id="checkout-form">
        <div class="eyebrow">PRODUCT CHECKOUT</div>
        <h2>${escapeHtml(product.name)}</h2>
        <div class="checkout-summary">
          <div><strong>Price</strong><span>${yen(product.price)}</span></div>
        </div>
        <label class="field">
          <span>カード名義</span>
          <input name="billingName" type="text" required />
        </label>
        <label class="field">
          <span>カード番号</span>
          <input name="cardNumber" inputmode="numeric" required />
        </label>
        <div class="field-row">
          <label class="field">
            <span>有効期限</span>
            <input name="expiry" placeholder="MM/YY" required />
          </label>
          <label class="field">
            <span>CVC</span>
            <input name="cvc" type="password" inputmode="numeric" required />
          </label>
        </div>
        ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
        <div class="stack-actions">
          <button class="button button--primary" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "決済中..." : `${yen(product.price)} を決済する`}</button>
          ${secondaryButton("商品詳細へ戻る", "navigate", 'data-target="productDetail"')}
        </div>
      </form>
    </section>
  `;
}

function renderPurchaseComplete() {
  const receipt = state.latestReceipt;
  return `
    <section class="screen">
      <div class="complete-panel">
        <div class="eyebrow">PAYMENT COMPLETE</div>
        <h2>商品購入が完了しました</h2>
        <p>${escapeHtml(state.flashMessage || "購入内容を更新しました。")}</p>
      </div>
      ${receipt ? card(
        "Receipt",
        `<p>商品: ${escapeHtml(receipt.productName)}</p><p>価格: ${yen(receipt.price)}</p><p>支払い: ${escapeHtml(receipt.paymentBrand)} **** ${escapeHtml(receipt.cardLast4)}</p><p>名義: ${escapeHtml(receipt.billingName)}</p>`,
        "",
        "RECEIPT"
      ) : ""}
      <div class="stack-actions">
        ${primaryButton("マイページを見る", "navigate", 'data-target="mypage"')}
        ${secondaryButton("ストアへ戻る", "navigate", 'data-target="market"')}
      </div>
    </section>
  `;
}

function renderBoard() {
  const posts = getBoardPosts();
  return `
    <section class="screen">
      ${card(
        "掲示板に投稿する",
        `
          <form class="form-card form-card--inline" id="board-post-form">
            <label class="field">
              <span>カテゴリ</span>
              <select name="category" required>
                <option value="">選択してください</option>
                <option value="応援トーク">応援トーク</option>
                <option value="試合情報">試合情報</option>
                <option value="来場レポート">来場レポート</option>
                <option value="ユース情報">ユース情報</option>
              </select>
            </label>
            <label class="field">
              <span>タイトル</span>
              <input name="title" type="text" maxlength="80" required />
            </label>
            <label class="field">
              <span>本文</span>
              <textarea name="body" rows="5" placeholder="会員同士で共有したい情報を書いてください" required></textarea>
            </label>
            ${state.error ? `<p class="message message--error">${escapeHtml(state.error)}</p>` : ""}
            <div class="stack-actions">
              <button class="button button--primary" type="submit" ${state.submitting ? "disabled" : ""}>${state.submitting ? "投稿中..." : "投稿する"}</button>
            </div>
          </form>
        `,
        "",
        "BOARD POST"
      )}
      ${posts.length ? posts.map((post) => card(
        post.title,
        `<div class="quest-topline">${pill(post.category)} ${post.isMine ? pill("MY POST") : ""}</div><p>${escapeHtml(post.body)}</p><p class="form-note">${escapeHtml(post.authorName)} / ${escapeHtml(post.createdAt)}</p>`,
        "",
        "COMMUNITY"
      )).join("") : `<div class="complete-panel"><p>まだ投稿はありません。最初の投稿をしてみましょう。</p></div>`}
    </section>
  `;
}

function renderMyPage() {
  const data = getData();
  if (!data || !state.currentMember) {
    return renderEmptyState("会員情報が見つかりません。");
  }
  const followedPlayers = (data.players || []).filter((item) => item.isFollowed);
  const ownedPasses = (data.passes || []).filter((item) => item.isPurchased);
  const orders = getOrders();
  const photoPosts = getPhotoPosts();
  return `
    <section class="screen">
      ${card(
        "プロフィール",
        `<p>${escapeHtml(state.currentMember.name)}</p><p>${escapeHtml(state.currentMember.email)}</p><p>${escapeHtml(state.currentMember.favoriteTeam)}</p><p>推し選手: ${escapeHtml(getSelectedPlayer()?.name || "未設定")}</p>`,
        secondaryButton("ログアウト", "logout"),
        "ACCOUNT"
      )}
      ${card(
        "応援中の選手",
        followedPlayers.length ? `<ul class="plain-list">${followedPlayers.map((player) => `<li>${escapeHtml(player.name)} / ${escapeHtml(player.club)}</li>`).join("")}</ul>` : "<p>まだ設定されていません。</p>",
        `${primaryButton("カタログを見る", "navigate", 'data-target="catalog"')} ${secondaryButton("応援台帳を見る", "navigate", 'data-target="ledger"')}`,
        "TRACK"
      )}
      ${card(
        "共同育成パス",
        ownedPasses.length ? `<ul class="plain-list">${ownedPasses.map((item) => `<li>${escapeHtml(item.title)}</li>`).join("")}</ul>` : "<p>まだ購入されていません。</p>",
        primaryButton("パスを見る", "open-pass", `data-pass-id="${getData()?.passes?.[0]?.id || ""}"`),
        "BOOST"
      )}
      ${card(
        "写真投稿",
        photoPosts.length ? `<div class="photo-grid">${photoPosts.map((item) => `<div class="photo-card"><img src="${item.imageDataUrl}" alt="${escapeHtml(item.imageName)}" class="photo-thumb" /><p>${escapeHtml(item.caption)}</p></div>`).join("")}</div>` : "<p>まだ投稿はありません。</p>",
        secondaryButton("ミッションへ", "navigate", 'data-target="missions"'),
        "PHOTO"
      )}
      ${card(
        "購入履歴",
        orders.length ? `<ul class="plain-list">${orders.map((order) => `<li>${escapeHtml(order.productName)} / ${yen(order.price)} / ${escapeHtml(order.paymentBrand)} **** ${escapeHtml(order.cardLast4)}</li>`).join("")}</ul>` : "<p>まだ購入はありません。</p>",
        secondaryButton("ストアへ", "navigate", 'data-target="market"'),
        "ORDERS"
      )}
    </section>
  `;
}

function renderAdminDashboard() {
  if (!state.adminData) {
    return renderLoading("管理者データを読み込んでいます。");
  }
  return `
    <section class="screen">
      <div class="hero-surface">
        <div class="eyebrow">ADMIN DASHBOARD</div>
        <h2>${escapeHtml(state.currentAdmin.name)}</h2>
        <div class="score-grid">
          <div class="score-card"><strong>${escapeHtml(state.adminData.metrics.memberCount)}</strong><span>MEMBERS</span></div>
          <div class="score-card"><strong>${escapeHtml(state.adminData.metrics.missionCount)}</strong><span>MISSIONS</span></div>
          <div class="score-card"><strong>${escapeHtml(state.adminData.metrics.orderCount)}</strong><span>ORDERS</span></div>
        </div>
      </div>
      ${card(
        "会員一覧",
        `<ul class="plain-list">${(state.adminData.members || []).map((member) => `<li>${escapeHtml(member.name)} / ${escapeHtml(member.favoriteTeam)} / 推し ${escapeHtml(member.favoritePlayerName)}</li>`).join("")}</ul>`,
        "",
        "MEMBERS"
      )}
      ${card(
        "写真投稿",
        state.adminData.photos?.length ? `<div class="photo-grid">${state.adminData.photos.map((item) => `<div class="photo-card"><img src="${item.imageDataUrl}" alt="${escapeHtml(item.imageName)}" class="photo-thumb" /><p>${escapeHtml(item.memberName)} / ${escapeHtml(item.caption)}</p></div>`).join("")}</div>` : "<p>投稿はありません。</p>",
        secondaryButton("ログアウト", "logout"),
        "PHOTOS"
      )}
    </section>
  `;
}

function renderLoading(message) {
  return `<section class="screen"><div class="complete-panel"><p>${escapeHtml(message)}</p></div></section>`;
}

function renderEmptyState(message) {
  return `<section class="screen"><div class="complete-panel"><h2>表示できません</h2><p>${escapeHtml(message)}</p></div></section>`;
}

function renderScreen() {
  switch (state.currentScreen) {
    case "authChoice":
      return renderAuthChoice();
    case "login":
      return renderLogin();
    case "signup":
      return renderSignup();
    case "adminLogin":
      return renderAdminLogin();
    case "adminDashboard":
      return renderAdminDashboard();
    case "home":
      return renderHome();
    case "catalog":
      return renderCatalog();
    case "players":
      return renderPlayers();
    case "playerDetail":
      return renderPlayerDetail();
    case "passDetail":
      return renderPassDetail();
    case "passCheckout":
      return renderPassCheckout();
    case "passComplete":
      return renderPassComplete();
    case "missions":
      return renderMissions();
    case "missionDetail":
      return renderMissionDetail();
    case "reportDetail":
      return renderReportDetail();
    case "checkinScan":
      return renderCheckinScan();
    case "checkinComplete":
      return renderCheckinComplete();
    case "photoPost":
      return renderPhotoPost();
    case "postComplete":
      return renderPostComplete();
    case "ledger":
      return renderLedger();
    case "market":
      return renderMarket();
    case "board":
      return renderBoard();
    case "productDetail":
      return renderProductDetail();
    case "checkout":
      return renderCheckout();
    case "purchaseComplete":
      return renderPurchaseComplete();
    case "mypage":
      return renderMyPage();
    default:
      return renderAuthChoice();
  }
}

function renderTabs() {
  if (!state.currentMember || state.currentAdmin || ["authChoice", "login", "signup", "adminLogin", "checkout", "passCheckout"].includes(state.currentScreen)) {
    return "";
  }
  const tabs = [
    { id: "home", label: "ホーム" },
    { id: "catalog", label: "カタログ" },
    { id: "missions", label: "ミッション" },
    { id: "board", label: "掲示板" },
    { id: "market", label: "ストア" },
    { id: "mypage", label: "マイページ" }
  ];
  return `
    <aside class="tab-bar" aria-label="Main navigation">
      <div class="tab-bar__brand">
        <div class="eyebrow">MEMBER MENU</div>
        <strong>${escapeHtml(state.currentMember.name)}</strong>
        <span>${escapeHtml(state.currentMember.favoriteTeam)}</span>
      </div>
      <div class="tab-bar__nav">
        ${tabs.map((tab) => `<button class="tab-bar__item ${state.currentScreen === tab.id ? "is-active" : ""}" data-action="navigate" data-target="${tab.id}">${escapeHtml(tab.label)}</button>`).join("")}
      </div>
      <button class="button button--secondary tab-bar__logout" data-action="logout">ログアウト</button>
    </aside>
  `;
}

function renderApp() {
  if (!appRoot) return;
  const hasMemberNav = Boolean(state.currentMember && !state.currentAdmin && !["authChoice", "login", "signup", "adminLogin", "checkout", "passCheckout"].includes(state.currentScreen));

  const titleMap = {
    authChoice: "Welcome",
    login: "Login",
    signup: "Sign Up",
    adminLogin: "Admin Login",
    adminDashboard: "Admin Dashboard",
    home: "Home",
    catalog: "Youth Catalog",
    players: "Players",
    playerDetail: "Player Detail",
    passDetail: "Boost Pass",
    passCheckout: "Pass Checkout",
    passComplete: "Pass Complete",
    missions: "Missions",
    missionDetail: "Mission Detail",
    reportDetail: "Report",
    checkinScan: "QR Check-in",
    checkinComplete: "Check-in Complete",
    photoPost: "Photo Mission",
    postComplete: "Post Complete",
    ledger: "Ledger",
    market: "Store",
    board: "Board",
    productDetail: "Product Detail",
    checkout: "Checkout",
    purchaseComplete: "Purchase Complete",
    mypage: "My Page"
  };

  appRoot.innerHTML = `
    <main class="shell ${hasMemberNav ? "shell--dashboard" : "shell--public"}">
      <header class="app-header">
        <div class="app-header__brand">
          <div class="eyebrow">TIS x B.LEAGUE</div>
          <strong>${escapeHtml(titleMap[state.currentScreen] || "Welcome")}</strong>
          <span class="app-header__caption">ユース支援WEBサービス</span>
        </div>
        ${state.currentAdmin ? `<span class="header-badge">ADMIN</span>` : state.currentMember ? `<span class="header-badge">${escapeHtml(state.currentMember.favoriteTeam)}</span>` : ""}
      </header>
      <div class="app-layout ${hasMemberNav ? "app-layout--with-nav" : "app-layout--single"}">
        ${renderTabs()}
        <section class="app-content">
          ${renderScreen()}
        </section>
      </div>
    </main>
  `;

  document.getElementById("signup-form")?.addEventListener("submit", handleSignupSubmit);
  document.getElementById("login-form")?.addEventListener("submit", handleLoginSubmit);
  document.getElementById("admin-login-form")?.addEventListener("submit", handleAdminLoginSubmit);
  document.getElementById("photo-mission-form")?.addEventListener("submit", handlePhotoMissionSubmit);
  document.getElementById("checkout-form")?.addEventListener("submit", handleCheckoutSubmit);
  document.getElementById("pass-checkout-form")?.addEventListener("submit", handlePassCheckoutSubmit);
  document.getElementById("board-post-form")?.addEventListener("submit", handleBoardPostSubmit);
  document.getElementById("checkin-form")?.addEventListener("submit", handleCheckinSubmit);
  document.getElementById("catalog-filter-form")?.addEventListener("change", handleCatalogFilterChange);

  appRoot.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleActionClick);
  });
}

async function handleActionClick(event) {
  const button = event.currentTarget;
  const action = button.getAttribute("data-action");
  const target = button.getAttribute("data-target");
  const playerId = button.getAttribute("data-player-id");
  const missionId = button.getAttribute("data-mission-id");
  const passId = button.getAttribute("data-pass-id");
  const productId = button.getAttribute("data-product-id");
  const reportId = button.getAttribute("data-report-id");

  try {
    if (action === "navigate" && target) {
      navigate(target);
      return;
    }
    if (action === "open-player" && playerId) {
      const linkedPass = (getData()?.passes || []).find((item) => item.playerId === playerId);
      navigate("playerDetail", { selectedPlayerId: playerId, selectedPassId: linkedPass?.id || state.selectedPassId });
      return;
    }
    if (action === "open-mission" && missionId) {
      navigate("missionDetail", { selectedMissionId: missionId });
      return;
    }
    if (action === "open-pass" && passId) {
      navigate("passDetail", { selectedPassId: passId, latestReceipt: null });
      return;
    }
    if (action === "open-product" && productId) {
      navigate("productDetail", { selectedProductId: productId });
      return;
    }
    if (action === "open-report" && reportId) {
      navigate("reportDetail", { selectedReportId: reportId, selectedMissionId: missionId || state.selectedMissionId });
      return;
    }
    if (action === "open-checkout" && productId) {
      navigate("checkout", { selectedProductId: productId, latestReceipt: null });
      return;
    }
    if (action === "follow-player" && playerId) {
      await callMemberAction("/api/follow-player", { playerId }, "playerDetail");
      return;
    }
    if (action === "set-favorite-player" && playerId) {
      await callMemberAction("/api/set-favorite-player", { playerId }, "catalog");
      return;
    }
    if (action === "complete-mission" && missionId) {
      await callMemberAction("/api/complete-mission", { missionId, note: "mission complete" }, "checkinComplete");
      return;
    }
    if (action === "logout") {
      state.currentMember = null;
      state.currentAdmin = null;
      state.appData = null;
      state.adminData = null;
      state.flashMessage = "";
      state.latestReceipt = null;
      navigate("authChoice");
    }
  } catch (error) {
    state.error = error.message;
    renderApp();
  }
}

async function callMemberAction(path, payload, nextScreen) {
  if (!state.currentMember) {
    throw new Error("Please log in first.");
  }
  const result = await callApi(path, {
    method: "POST",
    body: JSON.stringify({
      memberId: state.currentMember.id,
      ...payload
    })
  });
  await loadAppState(state.currentMember.id);
  setMessage(result.message);
  navigate(nextScreen);
}

function handleCatalogFilterChange(event) {
  const formData = new FormData(event.currentTarget);
  state.catalogFilters = {
    club: String(formData.get("club") || ""),
    grade: String(formData.get("grade") || ""),
    position: String(formData.get("position") || ""),
    tag: String(formData.get("tag") || "")
  };
  renderApp();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read the file."));
    reader.readAsDataURL(file);
  });
}

async function handleSignupSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    favoriteTeam: formData.get("favoriteTeam"),
    birthdate: formData.get("birthdate")
  };
  state.submitting = true;
  state.error = "";
  renderApp();
  try {
    const result = await callApi("/api/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    await loadAppState(result.member.id);
    state.currentAdmin = null;
    setMessage(result.message);
    navigate("home");
  } catch (error) {
    state.error = error.message;
    renderApp();
  } finally {
    state.submitting = false;
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  state.submitting = true;
  state.error = "";
  renderApp();
  try {
    const result = await callApi("/api/login", {
      method: "POST",
      body: JSON.stringify({
        identifier: formData.get("identifier"),
        password: formData.get("password")
      })
    });
    await loadAppState(result.member.id);
    state.currentAdmin = null;
    setMessage(result.message);
    navigate("home");
  } catch (error) {
    state.error = error.message;
    renderApp();
  } finally {
    state.submitting = false;
  }
}

async function handleAdminLoginSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  state.submitting = true;
  state.error = "";
  renderApp();
  try {
    const result = await callApi("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        adminId: formData.get("adminId"),
        password: formData.get("password")
      })
    });
    state.currentAdmin = result.admin;
    state.currentMember = null;
    await loadAdminState(result.admin.adminId);
    setMessage(result.message);
    navigate("adminDashboard");
  } catch (error) {
    state.error = error.message;
    renderApp();
  } finally {
    state.submitting = false;
  }
}

async function handlePhotoMissionSubmit(event) {
  event.preventDefault();
  if (!state.currentMember) {
    state.error = "Please log in first.";
    renderApp();
    return;
  }
  const formData = new FormData(event.currentTarget);
  const file = formData.get("photo");
  const note = String(formData.get("note") || "").trim();
  const mission = getSelectedMission();
  if (!(file instanceof File) || !file.name) {
    state.error = "Please choose a photo.";
    renderApp();
    return;
  }
  state.submitting = true;
  state.error = "";
  renderApp();
  try {
    const photoDataUrl = await readFileAsDataUrl(file);
    const result = await callApi("/api/complete-mission", {
      method: "POST",
      body: JSON.stringify({
        memberId: state.currentMember.id,
        missionId: mission.id,
        note,
        imageName: file.name,
        photoDataUrl
      })
    });
    await loadAppState(state.currentMember.id);
    setMessage(result.message);
    navigate("postComplete");
  } catch (error) {
    state.error = error.message;
    renderApp();
  } finally {
    state.submitting = false;
  }
}

async function detectQrCodeFromFile(file) {
  if (!("BarcodeDetector" in window)) {
    throw new Error("This browser does not support QR detection. Please enter the code manually.");
  }
  const detector = new BarcodeDetector({ formats: ["qr_code"] });
  const bitmap = await createImageBitmap(file);
  try {
    const codes = await detector.detect(bitmap);
    return codes[0]?.rawValue || "";
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}

async function handleCheckinSubmit(event) {
  event.preventDefault();
  if (!state.currentMember) {
    state.error = "Please log in first.";
    renderApp();
    return;
  }
  const mission = getSelectedMission();
  const formData = new FormData(event.currentTarget);
  const file = formData.get("qrImage");
  const manualCode = String(formData.get("manualCode") || "").trim();
  state.submitting = true;
  state.error = "";
  renderApp();
  try {
    let qrValue = manualCode;
    if ((!qrValue || normalizeQrValue(qrValue) !== normalizeQrValue(mission?.checkinCode)) && file instanceof File && file.name) {
      qrValue = await detectQrCodeFromFile(file);
    }
    if (normalizeQrValue(qrValue) !== normalizeQrValue(mission?.checkinCode)) {
      throw new Error("Could not verify the venue QR. Try another image or enter the code manually.");
    }
    const result = await callApi("/api/complete-mission", {
      method: "POST",
      body: JSON.stringify({
        memberId: state.currentMember.id,
        missionId: mission.id,
        note: `${mission.venueLabel || "Venue"} QR check-in`
      })
    });
    await loadAppState(state.currentMember.id);
    setMessage(result.message);
    navigate("checkinComplete");
  } catch (error) {
    state.error = error.message;
    renderApp();
  } finally {
    state.submitting = false;
  }
}

async function handlePassCheckoutSubmit(event) {
  event.preventDefault();
  if (!state.currentMember) {
    state.error = "Please log in first.";
    renderApp();
    return;
  }
  const passItem = getSelectedPass();
  const formData = new FormData(event.currentTarget);
  const planType = String(formData.get("planType") || "");
  const supportPurpose = String(formData.get("supportPurpose") || "");
  const selectedPlan = getPassPlan(passItem, planType);
  state.submitting = true;
  state.error = "";
  renderApp();
  try {
    const result = await callApi("/api/purchase-pass", {
      method: "POST",
      body: JSON.stringify({
        memberId: state.currentMember.id,
        passId: passItem.id,
        planType,
        supportPurpose
      })
    });
    await loadAppState(state.currentMember.id);
    state.latestReceipt = result.receipt || {
      planLabel: selectedPlan?.label || "",
      supportPurpose,
      price: selectedPlan?.price || 0
    };
    setMessage(result.message);
    navigate("passComplete");
  } catch (error) {
    state.error = error.message;
    renderApp();
  } finally {
    state.submitting = false;
  }
}

async function handleBoardPostSubmit(event) {
  event.preventDefault();
  if (!state.currentMember) {
    state.error = "Please log in first.";
    renderApp();
    return;
  }

  const formData = new FormData(event.currentTarget);
  state.submitting = true;
  state.error = "";
  renderApp();

  try {
    const result = await callApi("/api/board-post", {
      method: "POST",
      body: JSON.stringify({
        memberId: state.currentMember.id,
        category: formData.get("category"),
        title: formData.get("title"),
        body: formData.get("body")
      })
    });
    await loadAppState(state.currentMember.id);
    setMessage(result.message);
    navigate("board");
  } catch (error) {
    state.error = error.message;
    renderApp();
  } finally {
    state.submitting = false;
  }
}

async function handleCheckoutSubmit(event) {
  event.preventDefault();
  if (!state.currentMember) {
    state.error = "Please log in first.";
    renderApp();
    return;
  }
  const formData = new FormData(event.currentTarget);
  const product = getSelectedProduct();
  state.submitting = true;
  state.error = "";
  renderApp();
  try {
    const result = await callApi("/api/checkout-product", {
      method: "POST",
      body: JSON.stringify({
        memberId: state.currentMember.id,
        productId: product.id,
        billingName: formData.get("billingName"),
        cardNumber: formData.get("cardNumber"),
        expiry: formData.get("expiry"),
        cvc: formData.get("cvc")
      })
    });
    await loadAppState(state.currentMember.id);
    state.latestReceipt = result.receipt;
    setMessage(result.message);
    navigate("purchaseComplete");
  } catch (error) {
    state.error = error.message;
    renderApp();
  } finally {
    state.submitting = false;
  }
}

async function loadPublicData() {
  state.publicData = await callApi("/api/public-data", { headers: {} });
}

async function loadAppState(memberId) {
  const result = await callApi(`/api/app-state?memberId=${memberId}`, { headers: {} });
  state.currentMember = result.member;
  state.appData = result;
  state.selectedPlayerId = result.data.players.find((item) => item.id === result.member.favoritePlayerId)?.id || null;
  state.selectedMissionId = result.data.missions.find((item) => !isMissionCompleted(item))?.id || result.data.missions[0]?.id || null;
  state.selectedPassId = result.data.passes[0]?.id || null;
  state.selectedProductId = result.data.products[0]?.id || null;
  state.selectedReportId = result.reports[0]?.id || null;
}

async function loadAdminState(adminId) {
  state.adminData = await callApi(`/api/admin/state?adminId=${encodeURIComponent(adminId)}`, { headers: {} });
}

async function init() {
  try {
    await loadPublicData();
  } catch (error) {
    state.error = error.message;
  }
  renderApp();
}

init();

