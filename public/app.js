const socket = io();

let roomState = null;
let playerState = null;
let joinedRoomId = null;
let notesLoaded = false;

const connectionStatus = document.querySelector("#connectionStatus");
const joinPanel = document.querySelector("#joinPanel");
const gamePanel = document.querySelector("#gamePanel");

const joinTitle = document.querySelector("#joinTitle");
const roomPreview = document.querySelector("#roomPreview");
const nameInput = document.querySelector("#nameInput");
const rankInput = document.querySelector("#rankInput");
const joinButton = document.querySelector("#joinButton");

const inviteBox = document.querySelector("#inviteBox");
const inviteInput = document.querySelector("#inviteInput");
const copyInviteButton = document.querySelector("#copyInviteButton");
const copyRoomButton = document.querySelector("#copyRoomButton");

const roomBadge = document.querySelector("#roomBadge");
const countBadge = document.querySelector("#countBadge");
const phaseBadge = document.querySelector("#phaseBadge");

const playerInfo = document.querySelector("#playerInfo");
const playersList = document.querySelector("#playersList");
const stageBox = document.querySelector("#stageBox");
const logBox = document.querySelector("#logBox");

const startButton = document.querySelector("#startButton");
const resetButton = document.querySelector("#resetButton");
const aboutButton = document.querySelector("#aboutButton");
const notesButton = document.querySelector("#notesButton");
const rulesButton = document.querySelector("#rulesButton");
const advancedRulesButton = document.querySelector("#advancedRulesButton");
const aboutModal = document.querySelector("#aboutModal");
const notesModal = document.querySelector("#notesModal");
const rulesModal = document.querySelector("#rulesModal");
const advancedRulesModal = document.querySelector("#advancedRulesModal");
const notesContent = document.querySelector("#notesContent");
const toast = document.querySelector("#toast");

const playerTemplate = document.querySelector("#playerTemplate");

const TEAM_LABEL = {
  black: "黑方",
  white: "白方"
};

const ROLE_LABEL = {
  loyalist: "忠臣",
  spy: "内鬼"
};

const PHASE_LABEL = {
  waiting: "等待玩家",
  accusing: "指认阶段",
  "final-ai": "终局 AI 判定",
  ended: "游戏结束"
};

const SEAT_ORDER = ["black1", "black2", "black3", "white1", "white2", "white3"];
const SEAT_LABEL = {
  black1: "黑1",
  black2: "黑2",
  black3: "黑3",
  white1: "白1",
  white2: "白2",
  white3: "白3"
};

initRoomFromUrl();
restorePlayerForm();
initModalActions();

socket.on("connect", () => {
  connectionStatus.textContent = "已连接";
});

socket.on("disconnect", () => {
  connectionStatus.textContent = "已断开";
});

socket.on("error:message", (message) => {
  showToast(message);
  if (!playerState) {
    joinPanel.classList.remove("hidden");
    gamePanel.classList.add("hidden");
  }
});

socket.on("room:update", (state) => {
  roomState = state;
  render();
});

socket.on("player:update", (state) => {
  playerState = state;
  joinPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
  render();
});

joinButton.addEventListener("click", () => {
  submitJoin();
});

copyInviteButton.addEventListener("click", copyInviteLink);
copyRoomButton.addEventListener("click", copyInviteLink);

startButton.addEventListener("click", () => {
  socket.emit("game:start", {
    roomId: joinedRoomId
  });
});

resetButton.addEventListener("click", () => {
  const confirmed = confirm("确定要重新开局吗？当前结果会被清空。");
  if (!confirmed) return;

  socket.emit("game:reset", {
    roomId: joinedRoomId
  });
});

function submitJoin() {
  const name = nameInput.value.trim();
  const rank = rankInput.value.trim();

  if (!name) {
    showToast("请输入昵称");
    nameInput.focus();
    return false;
  }

  if (!rank) {
    showToast("请输入真实段位");
    rankInput.focus();
    return false;
  }

  localStorage.setItem("spy-go-name", name);
  localStorage.setItem("spy-go-rank", rank);

  socket.emit("room:join", {
    roomId: joinedRoomId,
    name,
    rank
  });

  joinPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");

  return true;
}

function updateSeat(seat) {
  socket.emit("seat:update", {
    roomId: joinedRoomId,
    seat
  });
}

function updateAdvancedRule(enabled) {
  socket.emit("advanced-rule:update", {
    roomId: joinedRoomId,
    enabled
  });
}

function initRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = params.get("room");

  joinedRoomId = normalizeRoomId(roomFromUrl) || createRoomId();

  const cleanUrl = createInviteUrl(joinedRoomId);

  window.history.replaceState({}, "", cleanUrl);

  roomPreview.textContent = joinedRoomId;
  inviteInput.value = cleanUrl;
  inviteBox.classList.remove("hidden");

  joinTitle.textContent = roomFromUrl ? "加入房间" : "创建房间";
}

function initModalActions() {
  aboutButton?.addEventListener("click", () => openModal(aboutModal));
  rulesButton?.addEventListener("click", () => openModal(rulesModal));
  advancedRulesButton?.addEventListener("click", () => openModal(advancedRulesModal));
  notesButton?.addEventListener("click", () => {
    openModal(notesModal);
    loadNotesContent();
  });

  document.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", () => closeAllModals());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });
}

async function loadNotesContent() {
  if (notesLoaded || !notesContent) return;

  try {
    const response = await fetch("/notes.txt", { cache: "no-store" });
    if (!response.ok) throw new Error("notes fetch failed");
    const text = await response.text();
    notesContent.textContent = text.trim() || "暂无使用说明。";
    notesLoaded = true;
  } catch {
    notesContent.textContent = "使用说明加载失败，请稍后重试。";
  }
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeAllModals() {
  [aboutModal, notesModal, rulesModal, advancedRulesModal].forEach((modal) => {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  });
  document.body.classList.remove("modal-open");
}

function restorePlayerForm() {
  const savedName = localStorage.getItem("spy-go-name");
  const savedRank = localStorage.getItem("spy-go-rank");

  if (savedName) {
    nameInput.value = savedName;
  }

  if (savedRank) {
    rankInput.value = savedRank;
  }
}

function createRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";

  for (let i = 0; i < 6; i++) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return value;
}

function normalizeRoomId(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 24);

  return normalized || "";
}

function createInviteUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  return url.toString();
}

async function copyInviteLink() {
  const link = createInviteUrl(joinedRoomId);

  try {
    await navigator.clipboard.writeText(link);
    showToast("邀请链接已复制");
  } catch {
    inviteInput.value = link;
    inviteInput.select();
    document.execCommand("copy");
    showToast("邀请链接已复制");
  }
}

function render() {
  if (!roomState) return;

  renderHeader();
  renderCurrentPlayer();
  renderPlayers();
  renderStage();
  renderLog();
}

function renderHeader() {
  roomBadge.textContent = `房间 ${roomState.id}`;
  countBadge.textContent = `${roomState.players.length} / 6`;
  phaseBadge.textContent = PHASE_LABEL[roomState.phase] || roomState.phase;

  const isHost = playerState?.isHost;
  const canStart = isHost && !roomState.started && roomState.players.length === 6;

  startButton.classList.toggle("hidden", !isHost || roomState.started);
  startButton.disabled = !canStart;

  resetButton.classList.toggle("hidden", !isHost);
}

function renderCurrentPlayer() {
  if (!playerState) {
    playerInfo.innerHTML = `<p class="hint">正在同步玩家信息...</p>`;
    return;
  }

  const teamText = playerState.team ? TEAM_LABEL[playerState.team] : "未分队";
  const roleText = playerState.role ? ROLE_LABEL[playerState.role] : "未发放";
  const eliminatedText = playerState.eliminated ? " · 已出局" : "";
  const seatControls = !roomState.started ? renderSeatSelector() : "";
  const advancedControls = !roomState.started ? renderAdvancedRuleControl() : renderAdvancedRuleStatus();

  playerInfo.innerHTML = `
    <div class="identity">
      你是：${escapeHtml(playerState.name)}
      <span class="rank-text">${escapeHtml(playerState.rank || "未填写段位")}</span>
      <span class="rank-text">${escapeHtml(playerState.seatLabel || "未选顺序")}</span>
      <strong>${teamText} · ${roleText}${eliminatedText}</strong>
    </div>
    ${seatControls}
    ${advancedControls}
    <p class="hint">${playerState.isHost ? "你是房主。满 6 人且联棋顺序无误后可以开始游戏。" : "等待房主操作。"}</p>
    <p class="hint">刷新、掉线或退出后，重新输入相同昵称即可恢复身份。</p>
  `;

  const seatSelect = document.querySelector("#roomSeatInput");
  if (seatSelect) {
    seatSelect.addEventListener("change", () => {
      updateSeat(seatSelect.value);
    });
  }

  const advancedInput = document.querySelector("#advancedSpyInput");
  if (advancedInput) {
    advancedInput.addEventListener("change", () => {
      updateAdvancedRule(advancedInput.checked);
    });
  }
}

function renderSeatSelector() {
  const options = [
    ["", "请选择联棋顺序"],
    ["black1", "黑1"],
    ["black2", "黑2"],
    ["black3", "黑3"],
    ["white1", "白1"],
    ["white2", "白2"],
    ["white3", "白3"]
  ].map(([value, label]) => {
    const selected = playerState.seat === value ? "selected" : "";
    return `<option value="${value}" ${selected}>${label}</option>`;
  }).join("");

  return `
    <label class="seat-control">
      联棋顺序
      <select id="roomSeatInput">
        ${options}
      </select>
    </label>
    <p class="hint seat-warning">游戏开始前可随时调整联棋顺序。允许临时重复选择，开始游戏时会统一校验。</p>
  `;
}

function renderAdvancedRuleControl() {
  const checked = roomState.advancedSpyAccusation ? "checked" : "";
  const disabled = playerState?.isHost ? "" : "disabled";

  return `
    <label class="advanced-rule-control">
      <input id="advancedSpyInput" type="checkbox" ${checked} ${disabled} />
      <span>进阶规则：内鬼指认</span>
    </label>
    <p class="hint">${playerState?.isHost ? "仅房主可修改，默认开启。" : "仅房主可修改，其他玩家可见。"}</p>
  `;
}

function renderAdvancedRuleStatus() {
  return `<p class="hint">进阶规则：内鬼指认${roomState.advancedSpyAccusation ? "已开启" : "未开启"}。</p>`;
}

function renderPlayers() {
  playersList.innerHTML = `
    <div class="player-table-head">
      <span>玩家昵称</span>
      <span>段位</span>
      <span>联棋顺序</span>
      <span>分队状态</span>
      <span>房主</span>
    </div>
  `;

  const sortedPlayers = [...roomState.players].sort((a, b) => {
    return SEAT_ORDER.indexOf(a.seat) - SEAT_ORDER.indexOf(b.seat);
  });

  for (const player of sortedPlayers) {
    const node = playerTemplate.content.cloneNode(true);

    node.querySelector(".player-name").textContent = player.name;
    node.querySelector(".player-rank").textContent = player.rank || "未填写段位";
    node.querySelector(".player-seat").textContent = player.seatLabel || "未选顺序";
    node.querySelector(".host-mark").textContent = player.id === roomState.hostId ? "房主" : "";

    const teamText = player.team ? TEAM_LABEL[player.team] : "等待开始";
    const connectionText = player.connected ? "" : " · 离线";
    node.querySelector(".player-team").textContent =
      player.eliminated ? `${teamText} · 已出局${connectionText}` : `${teamText}${connectionText}`;

    playersList.appendChild(node);
  }
}

function renderStage() {
  if (!playerState) {
    stageBox.innerHTML = "";
    return;
  }

  if (roomState.phase === "waiting") {
    renderWaitingStage();
    return;
  }

  if (roomState.phase === "accusing") {
    renderAccusingStage();
    return;
  }

  if (roomState.phase === "final-ai") {
    renderFinalAiStage();
    return;
  }

  if (roomState.phase === "ended") {
    renderEndedStage();
    return;
  }

  stageBox.innerHTML = `<div class="notice">未知阶段。</div>`;
}

function renderWaitingStage() {
  const missing = 6 - roomState.players.length;

  stageBox.innerHTML = `
    <div class="notice">
      当前正在等待玩家加入。还需要 <strong>${missing}</strong> 人。
      <br />
      进入房间后，请在“我的身份”中选择或调整联棋顺序。开始游戏时会统一校验 6 名玩家是否分别为黑1、黑2、黑3、白1、白2、白3，缺一不可且不可重复。
    </div>
  `;
}

function renderAccusingStage() {
  const currentHand = roomState.currentHand;
  const alreadySubmitted = Boolean(roomState.accusations[playerState.id]);
  const teamSpyFound = playerState.team === "black"
    ? roomState.teamStatus?.blackSpyFound
    : roomState.teamStatus?.whiteSpyFound;

  if (roomState.teamStatus?.allSpiesFound) {
    stageBox.innerHTML = `
      <div class="notice">
        内鬼已全部找出，请正常行棋至 150 手比拼终局 AI 胜率。
      </div>
    `;
    return;
  }

  if (playerState.eliminated) {
    stageBox.innerHTML = `
      <div class="notice">
        第 <strong>${currentHand}</strong> 手指认节点。
        <br />
        你已出局，本轮指认无需操作。
      </div>
    `;
    return;
  }

  const opponentTeam = playerState.team === "black" ? "white" : "black";
  const opponentSpyFound = playerState.team === "black"
    ? roomState.teamStatus?.whiteSpyFound
    : roomState.teamStatus?.blackSpyFound;

  if (playerState.role === "spy" && roomState.advancedSpyAccusation && opponentSpyFound) {
    stageBox.innerHTML = `
      <div class="notice">
        第 <strong>${currentHand}</strong> 手指认节点。
        <br />
        ${TEAM_LABEL[opponentTeam]}内鬼已找出，本轮内鬼指认无需操作。
      </div>
    `;
    return;
  }

  if (playerState.role !== "spy" && teamSpyFound) {
    stageBox.innerHTML = `
      <div class="notice">
        第 <strong>${currentHand}</strong> 手指认节点。
        <br />
        ${TEAM_LABEL[playerState.team]}内鬼已找出，本轮指认无需操作。
      </div>
    `;
    return;
  }

  if (alreadySubmitted) {
    stageBox.innerHTML = `
      <div class="notice">
        第 <strong>${currentHand}</strong> 手指认节点。
        <br />
        你已经提交，本轮等待其他玩家。
      </div>
    `;
    return;
  }

  if (playerState.role === "spy") {
    if (!roomState.advancedSpyAccusation) {
      stageBox.innerHTML = `
        <div class="notice">
          第 <strong>${currentHand}</strong> 手指认节点。
          <br />
          你是内鬼，未开启“内鬼指认”，本环节无需指认，请选择不指认。
        </div>
        <button id="abstainButton">不指认</button>
      `;
      document.querySelector("#abstainButton").addEventListener("click", submitAbstain);
      return;
    }

    const opponents = roomState.players.filter((player) => {
      return player.team === opponentTeam && !player.eliminated;
    });

    const options = opponents.map((player) => {
      return `
        <div class="choice-card">
          <label>
            <input type="radio" name="target" value="${player.id}" />
            ${escapeHtml(player.name)}
            <span class="rank-text">${escapeHtml(player.rank || "未填写段位")}</span>
            <span class="rank-text">${escapeHtml(player.seatLabel || "未选顺序")}</span>
          </label>
        </div>
      `;
    }).join("");

    stageBox.innerHTML = `
      <div class="notice">
        第 <strong>${currentHand}</strong> 手指认节点。
        <br />
        你是内鬼，可以在${TEAM_LABEL[opponentTeam]}三人中指认 1 人，也可以选择不指认。
      </div>
      <div class="choice-grid">
        ${options}
      </div>
      <div class="choice-grid">
        <button id="submitAccusationButton">提交内鬼指认</button>
        <button id="abstainButton" class="secondary">不指认</button>
      </div>
    `;

    document.querySelector("#submitAccusationButton").addEventListener("click", submitSelectedAccusation);
    document.querySelector("#abstainButton").addEventListener("click", submitAbstain);
    return;
  }

  const teammates = roomState.players.filter((player) => {
    return player.team === playerState.team && player.id !== playerState.id && !player.eliminated;
  });

  const options = teammates.map((player) => {
    return `
      <div class="choice-card">
        <label>
          <input type="radio" name="target" value="${player.id}" />
          ${escapeHtml(player.name)}
          <span class="rank-text">${escapeHtml(player.rank || "未填写段位")}</span>
          <span class="rank-text">${escapeHtml(player.seatLabel || "未选顺序")}</span>
        </label>
      </div>
    `;
  }).join("");

  stageBox.innerHTML = `
    <div class="notice">
      第 <strong>${currentHand}</strong> 手指认节点。
      <br />
      你是忠臣，可以选择指认本队玩家，也可以选择不指认。
    </div>

    <div class="choice-grid">
      ${options}
    </div>

    <div class="choice-grid">
      <button id="submitAccusationButton">提交指认</button>
      <button id="abstainButton" class="secondary">不指认</button>
    </div>
  `;

  document.querySelector("#submitAccusationButton").addEventListener("click", submitSelectedAccusation);
  document.querySelector("#abstainButton").addEventListener("click", submitAbstain);
}

function submitSelectedAccusation() {
  const selected = document.querySelector('input[name="target"]:checked');

  if (!selected) {
    showToast("请选择一名玩家，或选择不指认");
    return;
  }

  socket.emit("accusation:submit", {
    roomId: joinedRoomId,
    targetId: selected.value,
    abstain: false
  });
}

function submitAbstain() {
  socket.emit("accusation:submit", {
    roomId: joinedRoomId,
    abstain: true
  });
}

function renderFinalAiStage() {
  const finalReason = formatDisplayText(roomState.finalAiReason || "第 150 手结束，无人成功指认。");
  const rewardText = getFinalRewardText();

  if (!playerState.isHost) {
    stageBox.innerHTML = `
      <div class="notice">
        ${escapeHtml(finalReason)}
        <br />
        ${escapeHtml(rewardText)}
        <br />
        等待房主提交终局 AI 胜率更高的一方。
      </div>
    `;
    return;
  }

  stageBox.innerHTML = `
    <div class="notice">
      ${escapeHtml(finalReason)}
      <br />
      ${escapeHtml(rewardText)}
      <br />
      请房主按双方商议的奖励形式，选择终局 AI 胜率更高的一方。
    </div>

    <div class="choice-grid">
      <button id="blackAiButton">黑方终局 AI 胜率更高</button>
      <button id="whiteAiButton">白方终局 AI 胜率更高</button>
    </div>
  `;

  document.querySelector("#blackAiButton").addEventListener("click", () => {
    socket.emit("final-ai:submit", {
      roomId: joinedRoomId,
      winnerTeam: "black"
    });
  });

  document.querySelector("#whiteAiButton").addEventListener("click", () => {
    socket.emit("final-ai:submit", {
      roomId: joinedRoomId,
      winnerTeam: "white"
    });
  });
}

function renderEndedStage() {
  const result = roomState.finalResult;

  if (!result) {
    stageBox.innerHTML = `<div class="notice">游戏已结束。</div>`;
    return;
  }

  if (Array.isArray(result.players)) {
    const items = result.players.map((item) => {
      const team = TEAM_LABEL[item.team];
      const role = ROLE_LABEL[item.role];
      const outcomeText = item.outcome === "win" ? "胜" : "负";
      const outcomeClass = item.outcome === "win" ? "win" : "lose";

      return `
        <div class="result-item ${outcomeClass}">
          <div class="result-main">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.rank || "未填写段位")} · ${escapeHtml(item.seatLabel || "未选顺序")}</span>
            <span>${team} · ${role}${item.eliminated ? " · 已出局" : ""}</span>
            <b>${outcomeText}</b>
          </div>
          <small>${escapeHtml(item.reason)}</small>
        </div>
      `;
    }).join("");

    const rewardText = getFinalRewardText();
    const bonus = rewardText !== "终局奖励：无。"
      ? `<p class="hint">${escapeHtml(rewardText)}</p>`
      : "";

    stageBox.innerHTML = `
      <div class="notice"><strong>${escapeHtml(formatDisplayText(result.summary || "游戏结束。"))}</strong></div>
      ${bonus}
      <div class="result-box">
        ${items}
      </div>
    `;
    return;
  }

  stageBox.innerHTML = `<div class="notice">游戏已结束。</div>`;
}

function renderLog() {
  if (!roomState.gameLog || roomState.gameLog.length === 0) {
    logBox.innerHTML = `<p class="hint">暂无记录。</p>`;
    return;
  }

  logBox.innerHTML = roomState.gameLog
    .slice()
    .reverse()
    .map((item) => {
      const rawText = typeof item === "string" ? item : item.text;
      const text = formatDisplayText(rawText);
      const type = typeof item === "string" ? "normal" : item.type || "normal";
      const className = type === "result" ? "log-item result-log" : "log-item";
      return `<div class="${className}">${escapeHtml(text)}</div>`;
    })
    .join("");
}

function getFinalRewardText() {
  const bonus = roomState?.finalWinRateBonus || { black: 0, white: 0 };
  const parts = [];

  if (bonus.black) {
    parts.push(`黑方 ${formatBonus(bonus.black)} 目`);
  }

  if (bonus.white) {
    parts.push(`白方 ${formatBonus(bonus.white)} 目`);
  }

  if (parts.length === 0) {
    return "终局奖励：无。";
  }

  return `终局奖励：${parts.join("；")}（具体奖励数值与形式可由玩家自行调整）。`;
}

function formatDisplayText(value) {
  return String(value || "")
    .replace(
      /150\s*手终局指认奖励：(黑方|白方)指认成功，\1 AI 胜率 \+10，(黑方|白方) AI 胜率 -10。/g,
      (_match, team) => `150 手终局指认奖励：${team}指认成功，${team} +7.5 目（具体奖励数值与形式可由玩家自行调整）。`
    )
    .replace(
      /终局奖励修正：黑方 [+-]?\d+，白方 [+-]?\d+。/g,
      getFinalRewardText()
    );
}

function formatBonus(value) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 1800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
