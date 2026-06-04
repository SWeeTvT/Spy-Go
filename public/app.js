const socket = io();

let roomState = null;
let playerState = null;
let joinedRoomId = null;

const connectionStatus = document.querySelector("#connectionStatus");
const joinPanel = document.querySelector("#joinPanel");
const gamePanel = document.querySelector("#gamePanel");

const joinTitle = document.querySelector("#joinTitle");
const roomPreview = document.querySelector("#roomPreview");
const nameInput = document.querySelector("#nameInput");
const rankInput = document.querySelector("#rankInput");
const seatInput = document.querySelector("#seatInput");
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
const rulesButton = document.querySelector("#rulesButton");
const aboutModal = document.querySelector("#aboutModal");
const rulesModal = document.querySelector("#rulesModal");
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
});

socket.on("room:update", (state) => {
  roomState = state;
  render();
});

socket.on("player:update", (state) => {
  playerState = state;
  render();
});

joinButton.addEventListener("click", () => {
  const name = nameInput.value.trim();
  const rank = rankInput.value.trim();
  const seat = seatInput.value.trim();

  if (!name) {
    showToast("请输入昵称");
    nameInput.focus();
    return;
  }

  if (!rank) {
    showToast("请输入真实段位");
    rankInput.focus();
    return;
  }

  if (!seat) {
    showToast("请选择棋手座位");
    seatInput.focus();
    return;
  }

  localStorage.setItem("spy-go-name", name);
  localStorage.setItem("spy-go-rank", rank);
  localStorage.setItem("spy-go-seat", seat);

  socket.emit("room:join", {
    roomId: joinedRoomId,
    name,
    rank,
    seat
  });

  joinPanel.classList.add("hidden");
  gamePanel.classList.remove("hidden");
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

  document.querySelectorAll("[data-close-modal]").forEach((node) => {
    node.addEventListener("click", () => closeAllModals());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllModals();
    }
  });
}

function openModal(modal) {
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeAllModals() {
  [aboutModal, rulesModal].forEach((modal) => {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  });
  document.body.classList.remove("modal-open");
}

function restorePlayerForm() {
  const savedName = localStorage.getItem("spy-go-name");
  const savedRank = localStorage.getItem("spy-go-rank");
  const savedSeat = localStorage.getItem("spy-go-seat");

  if (savedName) {
    nameInput.value = savedName;
  }

  if (savedRank) {
    rankInput.value = savedRank;
  }

  if (savedSeat) {
    seatInput.value = savedSeat;
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

  playerInfo.innerHTML = `
    <div class="identity">
      你是：${escapeHtml(playerState.name)}
      <span class="rank-text">${escapeHtml(playerState.rank || "未填写段位")}</span>
      <span class="rank-text">${escapeHtml(playerState.seatLabel || "未选座位")}</span>
      <strong>${teamText} · ${roleText}${eliminatedText}</strong>
    </div>
    <p class="hint">${playerState.isHost ? "你是房主。满 6 人且座位无误后可以开始游戏。" : "等待房主操作。"}</p>
  `;
}

function renderPlayers() {
  playersList.innerHTML = `
    <div class="player-table-head">
      <span>玩家昵称</span>
      <span>段位</span>
      <span>棋手座位</span>
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
    node.querySelector(".player-seat").textContent = player.seatLabel || "未选座位";
    node.querySelector(".host-mark").textContent = player.id === roomState.hostId ? "房主" : "";

    const teamText = player.team ? TEAM_LABEL[player.team] : "等待开始";
    node.querySelector(".player-team").textContent =
      player.eliminated ? `${teamText} · 已出局` : teamText;

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
      请提前与其他玩家商议好棋手座位，确保 6 名玩家分别为黑1、黑2、黑3、白1、白2、白3，缺一不可且不可重复。
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

  if (teamSpyFound) {
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
    stageBox.innerHTML = `
      <div class="notice">
        第 <strong>${currentHand}</strong> 手指认节点。
        <br />
        你是内鬼，本环节无需指认，请选择不指认。
      </div>
      <button id="abstainButton">不指认</button>
    `;

    document.querySelector("#abstainButton").addEventListener("click", () => {
      socket.emit("accusation:submit", {
        roomId: joinedRoomId,
        abstain: true
      });
    });

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
          <span class="rank-text">${escapeHtml(player.seatLabel || "未选座位")}</span>
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

  document.querySelector("#submitAccusationButton").addEventListener("click", () => {
    const selected = document.querySelector('input[name="target"]:checked');

    if (!selected) {
      showToast("请选择一名本队玩家，或选择不指认");
      return;
    }

    socket.emit("accusation:submit", {
      roomId: joinedRoomId,
      targetId: selected.value,
      abstain: false
    });
  });

  document.querySelector("#abstainButton").addEventListener("click", () => {
    socket.emit("accusation:submit", {
      roomId: joinedRoomId,
      abstain: true
    });
  });
}

function renderFinalAiStage() {
  const finalReason = roomState.finalAiReason || "第 150 手结束，无人成功指认。";
  const blackBonus = roomState.finalWinRateBonus?.black || 0;
  const whiteBonus = roomState.finalWinRateBonus?.white || 0;
  const bonusText = blackBonus || whiteBonus
    ? `终局奖励修正：黑方 ${formatBonus(blackBonus)}，白方 ${formatBonus(whiteBonus)}。`
    : "终局奖励修正：无。";

  if (!playerState.isHost) {
    stageBox.innerHTML = `
      <div class="notice">
        ${escapeHtml(finalReason)}
        <br />
        ${escapeHtml(bonusText)}
        <br />
        等待房主提交调整后 AI 胜率更高的一方。
      </div>
    `;
    return;
  }

  stageBox.innerHTML = `
    <div class="notice">
      ${escapeHtml(finalReason)}
      <br />
      ${escapeHtml(bonusText)}
      <br />
      请房主按奖励修正后的结果，选择 AI 胜率更高的一方。
    </div>

    <div class="choice-grid">
      <button id="blackAiButton">黑方调整后 AI 胜率更高</button>
      <button id="whiteAiButton">白方调整后 AI 胜率更高</button>
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
            <span>${escapeHtml(item.rank || "未填写段位")} · ${escapeHtml(item.seatLabel || "未选座位")}</span>
            <span>${team} · ${role}${item.eliminated ? " · 已出局" : ""}</span>
            <b>${outcomeText}</b>
          </div>
          <small>${escapeHtml(item.reason)}</small>
        </div>
      `;
    }).join("");

    const bonus = result.bonus
      ? `<p class="hint">终局奖励修正：黑方 ${formatBonus(result.bonus.black || 0)}，白方 ${formatBonus(result.bonus.white || 0)}。</p>`
      : "";

    stageBox.innerHTML = `
      <div class="notice"><strong>${escapeHtml(result.summary || "游戏结束。")}</strong></div>
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
      const text = typeof item === "string" ? item : item.text;
      const type = typeof item === "string" ? "normal" : item.type || "normal";
      const className = type === "result" ? "log-item result-log" : "log-item";
      return `<div class="${className}">${escapeHtml(text)}</div>`;
    })
    .join("");
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
