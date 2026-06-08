const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.get("/notes.txt", (req, res) => {
  res.sendFile(path.join(__dirname, "notes.txt"));
});

const rooms = new Map();
const HAND_NODES = [50, 100, 150];
const TEAMS = ["black", "white"];
const SEATS = ["black1", "black2", "black3", "white1", "white2", "white3"];
const SEAT_LABEL = {
  black1: "黑1",
  black2: "黑2",
  black3: "黑3",
  white1: "白1",
  white2: "白2",
  white3: "白3"
};

function createRoom(roomId) {
  return {
    id: roomId,
    hostId: null,
    players: [],
    started: false,
    phase: "waiting",
    currentNodeIndex: 0,
    teams: { black: [], white: [] },
    accusations: {},
    gameLog: [],
    finalResult: null,
    finalAiReason: null,
    finalWinRateBonus: { black: 0, white: 0 },
    advancedSpyAccusation: true
  };
}

function sanitizeName(name) {
  const value = String(name || "").trim();
  return value.slice(0, 16) || "匿名玩家";
}

function sanitizeRank(rank) {
  const value = String(rank || "").trim();
  return value.slice(0, 16) || "未填写段位";
}

function sanitizeSeat(seat) {
  const value = String(seat || "").trim();
  return SEATS.includes(value) ? value : "";
}

function getSeatTeam(seat) {
  return String(seat || "").startsWith("black") ? "black" : "white";
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, createRoom(roomId));
  return rooms.get(roomId);
}

function teamName(team) {
  return team === "black" ? "黑方" : "白方";
}

function otherTeam(team) {
  return team === "black" ? "white" : "black";
}

function pushLog(room, text, type = "normal") {
  room.gameLog.push({ text, type });
}

function getSpyInTeam(room, team, includeEliminated = false) {
  return room.players.find((player) => {
    return player.team === team && player.role === "spy" && (includeEliminated || !player.eliminated);
  });
}

function getLoyalistsInTeam(room, team) {
  return room.players.filter((player) => player.team === team && player.role === "loyalist" && !player.eliminated);
}

function isTeamSpyFound(room, team) {
  return !getSpyInTeam(room, team);
}

function areAllSpiesFound(room) {
  return TEAMS.every((team) => isTeamSpyFound(room, team));
}

function publicRoomState(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      rank: player.rank,
      seat: player.seat,
      seatLabel: SEAT_LABEL[player.seat] || "未选顺序",
      team: player.team,
      eliminated: Boolean(player.eliminated),
      connected: player.connected
    })),
    teamStatus: {
      blackSpyFound: isTeamSpyFound(room, "black"),
      whiteSpyFound: isTeamSpyFound(room, "white"),
      allSpiesFound: areAllSpiesFound(room)
    },
    started: room.started,
    phase: room.phase,
    currentHand: HAND_NODES[room.currentNodeIndex] || 150,
    accusations: room.accusations,
    gameLog: room.gameLog,
    finalResult: room.finalResult,
    finalAiReason: room.finalAiReason,
    finalWinRateBonus: room.finalWinRateBonus,
    advancedSpyAccusation: room.advancedSpyAccusation
  };
}

function privatePlayerState(room, socketId) {
  const player = room.players.find((item) => item.id === socketId);
  if (!player) return null;

  return {
    id: player.id,
    name: player.name,
    rank: player.rank,
    seat: player.seat,
    seatLabel: SEAT_LABEL[player.seat] || "未选顺序",
    team: player.team,
    role: player.role,
    eliminated: Boolean(player.eliminated),
    isHost: room.hostId === socketId
  };
}

function emitRoom(room) {
  io.to(room.id).emit("room:update", publicRoomState(room));
  for (const player of room.players) {
    if (player.connected) io.to(player.id).emit("player:update", privatePlayerState(room, player.id));
  }
}

function replacePlayerSocketReferences(room, oldSocketId, newSocketId) {
  if (!oldSocketId || oldSocketId === newSocketId) return;
  if (room.hostId === oldSocketId) room.hostId = newSocketId;
  room.teams.black = room.teams.black.map((id) => id === oldSocketId ? newSocketId : id);
  room.teams.white = room.teams.white.map((id) => id === oldSocketId ? newSocketId : id);
  if (Object.prototype.hasOwnProperty.call(room.accusations, oldSocketId)) {
    room.accusations[newSocketId] = room.accusations[oldSocketId];
    delete room.accusations[oldSocketId];
  }
  for (const [voterId, targetId] of Object.entries(room.accusations)) {
    if (targetId === oldSocketId) room.accusations[voterId] = newSocketId;
  }
}

function reconnectExistingPlayer(room, player, socket, incomingData) {
  const oldSocketId = player.id;
  socket.join(room.id);
  replacePlayerSocketReferences(room, oldSocketId, socket.id);
  player.id = socket.id;
  player.connected = true;
  if (!room.started) player.rank = sanitizeRank(incomingData.rank);
  emitRoom(room);
}

function validateSeatConfig(room) {
  const selectedSeats = room.players.map((player) => player.seat);
  const selectedSet = new Set(selectedSeats);
  return room.players.length === 6 &&
    SEATS.every((seat) => selectedSet.has(seat)) &&
    selectedSet.size === selectedSeats.length &&
    selectedSeats.every((seat) => SEATS.includes(seat));
}

function assignRoles(room) {
  room.teams.black = [];
  room.teams.white = [];

  room.players.forEach((player) => {
    player.team = getSeatTeam(player.seat);
    player.role = "loyalist";
    player.eliminated = false;
  });

  const blackPlayers = room.players.filter((player) => player.team === "black");
  const whitePlayers = room.players.filter((player) => player.team === "white");
  blackPlayers[Math.floor(Math.random() * blackPlayers.length)].role = "spy";
  whitePlayers[Math.floor(Math.random() * whitePlayers.length)].role = "spy";

  room.teams.black = blackPlayers.map((player) => player.id);
  room.teams.white = whitePlayers.map((player) => player.id);
  room.started = true;
  room.phase = "accusing";
  room.currentNodeIndex = 0;
  room.accusations = {};
  room.finalResult = null;
  room.finalAiReason = null;
  room.finalWinRateBonus = { black: 0, white: 0 };
  room.gameLog = [];
  pushLog(room, "游戏开始：黑方 3 人，白方 3 人。");
  pushLog(room, `进阶规则：内鬼指认${room.advancedSpyAccusation ? "已开启" : "未开启"}。`);
  pushLog(room, "联棋顺序确认：黑1、黑2、黑3、白1、白2、白3 均已就位。");
  pushLog(room, `第 ${HAND_NODES[0]} 手指认节点开启。`);
}

function getRequiredAccusers(room) {
  return room.players.filter((player) => {
    if (!player.team || player.eliminated) return false;
    const ownSpy = getSpyInTeam(room, player.team);
    if (player.role === "loyalist") return Boolean(ownSpy);
    const opponentSpy = getSpyInTeam(room, otherTeam(player.team));
    return room.advancedSpyAccusation ? Boolean(opponentSpy) : Boolean(ownSpy);
  });
}

function shouldWaitForAllRequiredAccusers(room) {
  return getRequiredAccusers(room).some((player) => !room.accusations[player.id]);
}

function enterFinalAiPhase(room, message) {
  room.phase = "final-ai";
  room.accusations = {};
  room.finalAiReason = message;
  pushLog(room, message, "result");
}

function addBonus(room, team, points, reason) {
  if (!points) return;
  room.finalWinRateBonus[team] += points;
  pushLog(room, `${reason}：${teamName(team)} +${points} 目（具体奖励数值与形式可由玩家自行调整）。`, "result");
}

function applyBasicFinalReward(room, teams) {
  if (HAND_NODES[room.currentNodeIndex] !== 150) return;
  for (const team of teams) addBonus(room, team, 7.5, `150 手终局指认奖励`);
}

function applyNonEndingEliminationRewards(room, eliminatedTeams, doubleFailTeams) {
  const currentHand = HAND_NODES[room.currentNodeIndex];
  for (const team of eliminatedTeams) {
    if (currentHand === 150) {
      addBonus(room, team, 7.5, `150 手内鬼出局奖励`);
    } else {
      pushLog(room, `${teamName(team)}内鬼出局，${teamName(team)}忠臣获得一份奖励：由 AI 接管出局内鬼位置。`, "result");
    }
  }
  for (const team of doubleFailTeams) {
    addBonus(room, team, 7.5, `${teamName(team)}内鬼博弈双重失败额外奖励`);
  }
}

function advanceAccusationNode(room) {
  if (areAllSpiesFound(room)) {
    enterFinalAiPhase(room, "内鬼已全部找出，请正常行棋至 150 手比拼终局 AI 胜率。");
    return;
  }
  if (room.currentNodeIndex >= HAND_NODES.length - 1) {
    enterFinalAiPhase(room, "第 150 手指认环节结束，进入 AI 胜率判定。");
  } else {
    room.currentNodeIndex += 1;
    room.accusations = {};
    pushLog(room, `第 ${HAND_NODES[room.currentNodeIndex]} 手指认节点开启。`);
  }
}

function evaluateTeamAccusation(room, team) {
  const spy = getSpyInTeam(room, team);
  if (!spy) return { team, status: "resolved" };
  const loyalists = getLoyalistsInTeam(room, team);
  const loyalistVotes = loyalists.map((player) => room.accusations[player.id]);
  if (loyalistVotes.some((vote) => vote === "abstain")) return { team, status: "no_action" };
  const bothSame = loyalistVotes[0] && loyalistVotes[0] === loyalistVotes[1];
  if (bothSame && loyalistVotes[0] === spy.id) return { team, status: "spy_found", spyId: spy.id };
  return { team, status: "loyalists_failed" };
}

function evaluateSpyAccusation(room, team) {
  const spy = getSpyInTeam(room, team);
  const opponent = otherTeam(team);
  const opponentSpy = getSpyInTeam(room, opponent);
  if (!room.advancedSpyAccusation || !spy || !opponentSpy) return { team, status: "resolved" };
  const vote = room.accusations[spy.id];
  if (vote === "abstain") return { team, status: "no_action" };
  if (vote === opponentSpy.id) return { team, status: "spy_found", targetTeam: opponent, targetSpyId: opponentSpy.id };
  return { team, status: "spy_failed", spyId: spy.id };
}

function buildFlags(room, teamResults, spyResults) {
  const loyalistSuccess = { black: false, white: false };
  const loyalistFailed = { black: false, white: false };
  const spyFoundByOpponentSpy = { black: false, white: false };
  const spyAccusationFailed = { black: false, white: false };

  for (const item of teamResults) {
    if (item.status === "spy_found") loyalistSuccess[item.team] = true;
    if (item.status === "loyalists_failed") loyalistFailed[item.team] = true;
  }
  for (const item of spyResults) {
    if (item.status === "spy_found") spyFoundByOpponentSpy[item.targetTeam] = true;
    if (item.status === "spy_failed") spyAccusationFailed[item.team] = true;
  }

  const spyFail = {
    black: loyalistSuccess.black || spyFoundByOpponentSpy.black || spyAccusationFailed.black,
    white: loyalistSuccess.white || spyFoundByOpponentSpy.white || spyAccusationFailed.white
  };
  const doubleFail = {
    black: spyFoundByOpponentSpy.black && spyAccusationFailed.black,
    white: spyFoundByOpponentSpy.white && spyAccusationFailed.white
  };
  const special = {
    black: loyalistSuccess.black && (spyFoundByOpponentSpy.black || spyAccusationFailed.black),
    white: loyalistSuccess.white && (spyFoundByOpponentSpy.white || spyAccusationFailed.white)
  };

  return { loyalistSuccess, loyalistFailed, spyFoundByOpponentSpy, spyAccusationFailed, spyFail, doubleFail, special };
}

function evaluateAccusationNode(room) {
  if (shouldWaitForAllRequiredAccusers(room)) return;

  const currentHand = HAND_NODES[room.currentNodeIndex];
  const teamResults = TEAMS.map((team) => evaluateTeamAccusation(room, team));
  const spyResults = TEAMS.map((team) => evaluateSpyAccusation(room, team));
  const flags = buildFlags(room, teamResults, spyResults);

  for (const team of TEAMS) {
    if (flags.loyalistSuccess[team]) {
      pushLog(room, `第 ${currentHand} 手：${teamName(team)}忠臣指认成功，${teamName(team)}内鬼出局。`, "result");
    }
    if (flags.loyalistFailed[team]) {
      pushLog(room, `第 ${currentHand} 手：${teamName(team)}忠臣指认失败，${teamName(team)}忠臣判负。`, "result");
    }
    if (flags.spyFoundByOpponentSpy[team]) {
      pushLog(room, `第 ${currentHand} 手：${teamName(otherTeam(team))}内鬼指认成功，${teamName(team)}内鬼出局。`, "result");
    }
    if (flags.spyAccusationFailed[team]) {
      pushLog(room, `第 ${currentHand} 手：${teamName(team)}内鬼指认失败，${teamName(team)}内鬼出局。`, "result");
    }
    if (flags.doubleFail[team]) {
      pushLog(room, `第 ${currentHand} 手：${teamName(team)}内鬼同时自己指错且被对方内鬼指对，触发内鬼博弈双重失败。`, "result");
    }
    if (flags.special[team]) {
      pushLog(room, `第 ${currentHand} 手：${teamName(team)}内鬼同时被己方忠臣正确指出并在内鬼博弈中失败，触发特殊双重抓出。`, "result");
    }
  }

  const earlyEnd = flags.loyalistFailed.black || flags.loyalistFailed.white || flags.special.black || flags.special.white;
  if (earlyEnd) {
    room.phase = "ended";
    room.finalResult = buildAdvancedAccusationFinalResult(room, flags);
    room.accusations = {};
    return;
  }

  const eliminatedTeams = TEAMS.filter((team) => flags.spyFail[team]);
  for (const team of eliminatedTeams) {
    const spy = getSpyInTeam(room, team);
    if (spy) spy.eliminated = true;
  }

  applyNonEndingEliminationRewards(room, eliminatedTeams, TEAMS.filter((team) => flags.doubleFail[team]));

  if (eliminatedTeams.length === 0) {
    pushLog(room, `第 ${currentHand} 手：未出现指认失败或成功抓出内鬼，棋局继续。`, "result");
  }

  advanceAccusationNode(room);
}

function buildPlayerResult(player, outcome, reason) {
  return {
    id: player.id,
    name: player.name,
    rank: player.rank,
    seat: player.seat,
    seatLabel: SEAT_LABEL[player.seat] || "未选顺序",
    team: player.team,
    role: player.role,
    eliminated: Boolean(player.eliminated),
    outcome,
    reason
  };
}

function buildAdvancedAccusationFinalResult(room, flags) {
  const bothSpecial = flags.special.black && flags.special.white;
  const players = room.players.map((player) => {
    const team = player.team;
    const label = teamName(team);

    if (bothSpecial) {
      if (player.role === "spy") return buildPlayerResult(player, "lose", `${label}内鬼触发特殊双重抓出，内鬼失败。`);
      return buildPlayerResult(player, "win", "黑白双方同时触发特殊双重抓出，只惩罚两个内鬼，双方忠臣均获胜。");
    }

    const loyalistFail = flags.loyalistFailed[team] || flags.special[otherTeam(team)];
    const spyFail = flags.spyFail[team];

    if (player.role === "spy") {
      if (spyFail) return buildPlayerResult(player, "lose", `${label}内鬼满足失败或出局条件，按失败优先原则判负。`);
      return buildPlayerResult(player, "win", `${label}内鬼未满足失败条件，获得胜利。`);
    }

    if (loyalistFail) return buildPlayerResult(player, "lose", `${label}忠臣满足失败条件，判负。`);
    return buildPlayerResult(player, "win", `${label}忠臣未满足失败条件，获得胜利。`);
  });

  const summary = bothSpecial
    ? "黑白双方同时触发特殊双重抓出，两个内鬼失败，双方忠臣获胜。"
    : "本轮触发提前结算：按失败/出局条件优先原则判定每名玩家胜负。";

  return { type: "accusation", players, summary, bonus: room.finalWinRateBonus };
}

function buildAiFinalResult(room, winnerTeam) {
  const loserTeam = otherTeam(winnerTeam);
  const players = room.players.map((player) => {
    const playerTeamName = teamName(player.team);
    if (player.role === "spy") {
      if (player.eliminated) return buildPlayerResult(player, "lose", `${playerTeamName}内鬼已提前出局。`);
      if (player.team === loserTeam) return buildPlayerResult(player, "win", `${teamName(loserTeam)}终局 AI 胜率更低，${teamName(loserTeam)}内鬼获胜。`);
      return buildPlayerResult(player, "lose", `${teamName(winnerTeam)}终局 AI 胜率更高，${teamName(winnerTeam)}内鬼失败。`);
    }
    if (player.team === winnerTeam) return buildPlayerResult(player, "win", `${teamName(winnerTeam)}终局 AI 胜率更高，${teamName(winnerTeam)}忠臣获胜。`);
    return buildPlayerResult(player, "lose", `${teamName(loserTeam)}终局 AI 胜率更低，${teamName(loserTeam)}忠臣失败。`);
  });

  return { type: "ai", winnerTeam, players, bonus: room.finalWinRateBonus, summary: `${teamName(winnerTeam)}终局 AI 胜率更高，${teamName(winnerTeam)}忠臣获胜，${teamName(loserTeam)}未出局内鬼获胜。` };
}

function submitFinalAiResult(room, winnerTeam) {
  room.finalResult = buildAiFinalResult(room, winnerTeam);
  const blackBonus = room.finalWinRateBonus.black;
  const whiteBonus = room.finalWinRateBonus.white;
  const bonusText = blackBonus || whiteBonus
    ? `终局奖励：黑方 ${blackBonus >= 0 ? "+" : ""}${blackBonus} 目，白方 ${whiteBonus >= 0 ? "+" : ""}${whiteBonus} 目。`
    : "无终局奖励。";
  pushLog(room, `终局判定：${teamName(winnerTeam)}终局 AI 胜率更高。${bonusText}`, "result");
  room.phase = "ended";
}

function removePlayer(socket) {
  for (const room of rooms.values()) {
    const player = room.players.find((item) => item.id === socket.id);
    if (!player) continue;
    player.connected = false;
    if (!room.started) {
      room.players = room.players.filter((item) => item.id !== socket.id);
      if (room.hostId === socket.id) room.hostId = room.players[0]?.id || null;
    }
    if (room.players.length === 0) {
      rooms.delete(room.id);
      return;
    }
    emitRoom(room);
    return;
  }
}

io.on("connection", (socket) => {
  socket.on("room:join", ({ roomId, name, rank }) => {
    const safeRoomId = String(roomId || "").trim().slice(0, 24);
    const safeName = sanitizeName(name);
    if (!safeRoomId) return socket.emit("error:message", "请输入房间号。");

    const room = getRoom(safeRoomId);
    const existingPlayer = room.players.find((player) => player.name === safeName);
    if (existingPlayer) return reconnectExistingPlayer(room, existingPlayer, socket, { rank });
    if (room.started) return socket.emit("error:message", "游戏已经开始。若要恢复身份，请输入与原玩家完全相同的昵称。");
    if (room.players.length >= 6) return socket.emit("error:message", "房间已满，最多 6 人。");

    socket.join(room.id);
    const player = { id: socket.id, name: safeName, rank: sanitizeRank(rank), seat: "", team: null, role: null, eliminated: false, connected: true };
    room.players.push(player);
    if (!room.hostId) room.hostId = socket.id;
    emitRoom(room);
  });

  socket.on("advanced-rule:update", ({ roomId, enabled }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit("error:message", "只有房主可以修改进阶规则。");
    if (room.started) return socket.emit("error:message", "游戏已经开始，不能再修改进阶规则。");
    room.advancedSpyAccusation = Boolean(enabled);
    emitRoom(room);
  });

  socket.on("seat:update", ({ roomId, seat }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.started) return socket.emit("error:message", "游戏已经开始，不能再修改联棋顺序。");
    const player = room.players.find((item) => item.id === socket.id);
    if (!player) return;
    player.seat = sanitizeSeat(seat);
    emitRoom(room);
  });

  socket.on("game:start", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit("error:message", "只有房主可以开始游戏。");
    if (room.players.length !== 6) return socket.emit("error:message", "需要正好 6 名玩家才能开始。");
    if (!validateSeatConfig(room)) return socket.emit("error:message", "联棋顺序有误，无法开始游戏。请确认 6 名玩家分别为黑1、黑2、黑3、白1、白2、白3，且不可重复。");
    assignRoles(room);
    emitRoom(room);
  });

  socket.on("accusation:submit", ({ roomId, targetId, abstain }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "accusing") return;
    const player = room.players.find((item) => item.id === socket.id);
    if (!player) return;
    if (player.eliminated) return socket.emit("error:message", "出局玩家无需参与指认。");

    if (abstain) {
      room.accusations[player.id] = "abstain";
      pushLog(room, `${player.name} 已完成指认。`);
      evaluateAccusationNode(room);
      emitRoom(room);
      return;
    }

    const target = room.players.find((item) => item.id === targetId);
    if (!target) return socket.emit("error:message", "请选择要指认的玩家，或选择不指认。");
    if (target.eliminated) return socket.emit("error:message", "不能指认已经出局的玩家。");

    if (player.role === "spy") {
      if (!room.advancedSpyAccusation) return socket.emit("error:message", "未开启内鬼指认，内鬼请选择不指认。");
      if (!getSpyInTeam(room, otherTeam(player.team))) return socket.emit("error:message", "对方内鬼已找出，本轮内鬼指认无需操作。");
      if (target.team === player.team) return socket.emit("error:message", "内鬼只能在对方三人中指认。");
    } else {
      if (!getSpyInTeam(room, player.team)) return socket.emit("error:message", `${teamName(player.team)}内鬼已找出，本轮指认无需操作。`);
      if (target.team !== player.team) return socket.emit("error:message", "忠臣只能指认本队玩家。");
      if (target.id === player.id) return socket.emit("error:message", "不能指认自己。");
    }

    room.accusations[player.id] = target.id;
    pushLog(room, `${player.name} 已完成指认。`);
    evaluateAccusationNode(room);
    emitRoom(room);
  });

  socket.on("final-ai:submit", ({ roomId, winnerTeam }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "final-ai") return;
    if (room.hostId !== socket.id) return socket.emit("error:message", "只有房主可以提交终局 AI 判定。");
    if (winnerTeam !== "black" && winnerTeam !== "white") return socket.emit("error:message", "请选择终局 AI 胜率更高的一方。");
    submitFinalAiResult(room, winnerTeam);
    emitRoom(room);
  });

  socket.on("game:reset", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit("error:message", "只有房主可以重开游戏。");
    for (const player of room.players) {
      player.team = null;
      player.role = null;
      player.eliminated = false;
      player.seat = "";
    }
    room.started = false;
    room.phase = "waiting";
    room.currentNodeIndex = 0;
    room.teams = { black: [], white: [] };
    room.accusations = {};
    room.gameLog = [];
    room.finalResult = null;
    room.finalAiReason = null;
    room.finalWinRateBonus = { black: 0, white: 0 };
    room.advancedSpyAccusation = true;
    emitRoom(room);
  });

  socket.on("disconnect", () => removePlayer(socket));
});

server.listen(PORT, () => {
  console.log(`Spy Go server running at http://localhost:${PORT}`);
});
