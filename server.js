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
    teams: {
      black: [],
      white: []
    },
    accusations: {},
    gameLog: [],
    finalResult: null,
    finalAiReason: null,
    finalWinRateBonus: {
      black: 0,
      white: 0
    }
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
  if (!rooms.has(roomId)) {
    rooms.set(roomId, createRoom(roomId));
  }
  return rooms.get(roomId);
}

function shuffle(array) {
  const copied = [...array];
  for (let i = copied.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
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

function getSpyInTeam(room, team) {
  return room.players.find((player) => player.team === team && player.role === "spy" && !player.eliminated);
}

function getLoyalistsInTeam(room, team) {
  return room.players.filter((player) => player.team === team && player.role === "loyalist" && !player.eliminated);
}

function isTeamSpyFound(room, team) {
  return !getSpyInTeam(room, team);
}

function areAllSpiesFound(room) {
  return ["black", "white"].every((team) => isTeamSpyFound(room, team));
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
      seatLabel: SEAT_LABEL[player.seat] || "未选座位",
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
    finalWinRateBonus: room.finalWinRateBonus
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
    seatLabel: SEAT_LABEL[player.seat] || "未选座位",
    team: player.team,
    role: player.role,
    eliminated: Boolean(player.eliminated),
    isHost: room.hostId === socketId
  };
}

function emitRoom(room) {
  io.to(room.id).emit("room:update", publicRoomState(room));

  for (const player of room.players) {
    io.to(player.id).emit("player:update", privatePlayerState(room, player.id));
  }
}

function validateSeatConfig(room) {
  const selectedSeats = room.players.map((player) => player.seat);
  const selectedSet = new Set(selectedSeats);

  const hasAllSeats = SEATS.every((seat) => selectedSet.has(seat));
  const hasNoDuplicate = selectedSet.size === selectedSeats.length;

  return room.players.length === 6 && hasAllSeats && hasNoDuplicate;
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

  const blackSpy = blackPlayers[Math.floor(Math.random() * blackPlayers.length)];
  const whiteSpy = whitePlayers[Math.floor(Math.random() * whitePlayers.length)];

  blackSpy.role = "spy";
  whiteSpy.role = "spy";

  room.teams.black = blackPlayers.map((player) => player.id);
  room.teams.white = whitePlayers.map((player) => player.id);

  room.started = true;
  room.phase = "accusing";
  room.currentNodeIndex = 0;
  room.accusations = {};
  room.finalResult = null;
  room.finalAiReason = null;
  room.finalWinRateBonus = {
    black: 0,
    white: 0
  };
  room.gameLog = [];
  pushLog(room, "游戏开始：黑方 3 人，白方 3 人。");
  pushLog(room, "座位确认：黑1、黑2、黑3、白1、白2、白3 均已就位。");
  pushLog(room, `第 ${HAND_NODES[0]} 手指认节点开启。`);
}

function getRequiredAccusers(room) {
  return room.players.filter((player) => {
    return player.team && !player.eliminated && getSpyInTeam(room, player.team);
  });
}

function shouldWaitForAllRequiredAccusers(room) {
  const requiredAccusers = getRequiredAccusers(room);
  return requiredAccusers.some((player) => !room.accusations[player.id]);
}

function enterFinalAiPhase(room, message) {
  room.phase = "final-ai";
  room.accusations = {};
  room.finalAiReason = message;
  pushLog(room, message, "result");
}

function applyFinalRoundBonus(room, foundTeams) {
  if (HAND_NODES[room.currentNodeIndex] !== 150 || foundTeams.length === 0) {
    return;
  }

  for (const result of foundTeams) {
    const opponent = otherTeam(result.team);
    room.finalWinRateBonus[result.team] += 10;
    room.finalWinRateBonus[opponent] -= 10;
    pushLog(
      room,
      `150 手终局指认奖励：${teamName(result.team)}指认成功，${teamName(result.team)} AI 胜率 +10，${teamName(opponent)} AI 胜率 -10。`,
      "result"
    );
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

  if (!spy) {
    return {
      team,
      status: "resolved"
    };
  }

  const loyalists = getLoyalistsInTeam(room, team);
  const loyalistVotes = loyalists.map((player) => room.accusations[player.id]);

  if (loyalistVotes.some((vote) => vote === "abstain")) {
    return {
      team,
      status: "no_action"
    };
  }

  const bothSame = loyalistVotes[0] && loyalistVotes[0] === loyalistVotes[1];

  if (bothSame && loyalistVotes[0] === spy.id) {
    return {
      team,
      status: "spy_found",
      spyId: spy.id
    };
  }

  return {
    team,
    status: "loyalists_failed"
  };
}

function evaluateAccusationNode(room) {
  if (shouldWaitForAllRequiredAccusers(room)) {
    return;
  }

  const currentHand = HAND_NODES[room.currentNodeIndex];
  const teamResults = ["black", "white"].map((team) => evaluateTeamAccusation(room, team));
  const foundTeams = teamResults.filter((item) => item.status === "spy_found");
  const failedTeams = teamResults.filter((item) => item.status === "loyalists_failed");

  for (const result of foundTeams) {
    const spy = room.players.find((player) => player.id === result.spyId);

    if (spy) {
      spy.eliminated = true;
    }

    pushLog(room, `第 ${currentHand} 手：${teamName(result.team)}两名忠臣均指认正确，${teamName(result.team)}内鬼出局。`, "result");
  }

  applyFinalRoundBonus(room, foundTeams);

  for (const result of failedTeams) {
    pushLog(room, `第 ${currentHand} 手：${teamName(result.team)}忠臣指认失败，${teamName(result.team)}忠臣判负。`, "result");
  }

  if (failedTeams.length > 0) {
    room.phase = "ended";
    room.finalResult = buildAccusationFinalResult(room, failedTeams);
    room.accusations = {};
    return;
  }

  if (foundTeams.length === 0) {
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
    seatLabel: SEAT_LABEL[player.seat] || "未选座位",
    team: player.team,
    role: player.role,
    eliminated: Boolean(player.eliminated),
    outcome,
    reason
  };
}

function buildAccusationFinalResult(room, failedTeams) {
  const failedTeamSet = new Set(failedTeams.map((item) => item.team));
  const failedTeamNames = failedTeams.map((item) => teamName(item.team)).join("、");

  const players = room.players.map((player) => {
    const playerTeamName = teamName(player.team);

    if (player.role === "spy") {
      if (player.eliminated) {
        return buildPlayerResult(player, "lose", `${playerTeamName}内鬼已提前出局。`);
      }

      if (failedTeamSet.has(player.team)) {
        return buildPlayerResult(player, "win", `${playerTeamName}忠臣指认失败，${playerTeamName}内鬼获胜。`);
      }

      if (failedTeams.length === 1) {
        return buildPlayerResult(player, "win", `${teamName(failedTeams[0].team)}忠臣指认失败，${playerTeamName}三名玩家获胜。`);
      }

      return buildPlayerResult(player, "lose", `${failedTeamNames}忠臣同时指认失败，只有未出局内鬼获胜。`);
    }

    if (failedTeamSet.has(player.team)) {
      return buildPlayerResult(player, "lose", `${playerTeamName}忠臣指认失败，${playerTeamName}忠臣失败。`);
    }

    return buildPlayerResult(player, "win", `${failedTeamNames}忠臣指认失败，${playerTeamName}忠臣获胜。`);
  });

  return {
    type: "accusation",
    players,
    summary: failedTeams.length === 1
      ? `${teamName(failedTeams[0].team)}忠臣指认失败，游戏提前结束。`
      : "黑方与白方忠臣同时指认失败，游戏提前结束。"
  };
}

function buildAiFinalResult(room, winnerTeam) {
  const loserTeam = otherTeam(winnerTeam);
  const players = room.players.map((player) => {
    const playerTeamName = teamName(player.team);

    if (player.role === "spy") {
      if (player.eliminated) {
        return buildPlayerResult(player, "lose", `${playerTeamName}内鬼已提前出局。`);
      }

      if (player.team === loserTeam) {
        return buildPlayerResult(player, "win", `${teamName(loserTeam)} AI 胜率更低，${teamName(loserTeam)}内鬼获胜。`);
      }

      return buildPlayerResult(player, "lose", `${teamName(winnerTeam)} AI 胜率更高，${teamName(winnerTeam)}内鬼失败。`);
    }

    if (player.team === winnerTeam) {
      return buildPlayerResult(player, "win", `${teamName(winnerTeam)} AI 胜率更高，${teamName(winnerTeam)}忠臣获胜。`);
    }

    return buildPlayerResult(player, "lose", `${teamName(loserTeam)} AI 胜率更低，${teamName(loserTeam)}忠臣失败。`);
  });

  return {
    type: "ai",
    winnerTeam,
    players,
    bonus: room.finalWinRateBonus,
    summary: `${teamName(winnerTeam)}调整后 AI 胜率更高，${teamName(winnerTeam)}忠臣获胜，${teamName(loserTeam)}未出局内鬼获胜。`
  };
}

function submitFinalAiResult(room, winnerTeam) {
  room.finalResult = buildAiFinalResult(room, winnerTeam);

  const blackBonus = room.finalWinRateBonus.black;
  const whiteBonus = room.finalWinRateBonus.white;
  const bonusText = blackBonus || whiteBonus
    ? `奖励修正：黑方 ${blackBonus >= 0 ? "+" : ""}${blackBonus}，白方 ${whiteBonus >= 0 ? "+" : ""}${whiteBonus}。`
    : "无终局指认奖励修正。";

  pushLog(room, `终局判定：${teamName(winnerTeam)}调整后 AI 胜率更高。${bonusText}`, "result");
  room.phase = "ended";
}

function removePlayer(socket) {
  for (const room of rooms.values()) {
    const player = room.players.find((item) => item.id === socket.id);
    if (!player) continue;

    player.connected = false;

    if (!room.started) {
      room.players = room.players.filter((item) => item.id !== socket.id);

      if (room.hostId === socket.id) {
        room.hostId = room.players[0]?.id || null;
      }
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
  socket.on("room:join", ({ roomId, name, rank, seat }) => {
    const safeRoomId = String(roomId || "").trim().slice(0, 24);
    const safeSeat = sanitizeSeat(seat);

    if (!safeRoomId) {
      socket.emit("error:message", "请输入房间号。");
      return;
    }

    if (!safeSeat) {
      socket.emit("error:message", "请选择棋手座位。");
      return;
    }

    const room = getRoom(safeRoomId);

    if (room.started) {
      socket.emit("error:message", "游戏已经开始，无法加入。");
      return;
    }

    if (room.players.length >= 6) {
      socket.emit("error:message", "房间已满，最多 6 人。");
      return;
    }

    socket.join(room.id);

    const player = {
      id: socket.id,
      name: sanitizeName(name),
      rank: sanitizeRank(rank),
      seat: safeSeat,
      team: null,
      role: null,
      eliminated: false,
      connected: true
    };

    room.players.push(player);

    if (!room.hostId) {
      room.hostId = socket.id;
    }

    emitRoom(room);
  });

  socket.on("game:start", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit("error:message", "只有房主可以开始游戏。");
      return;
    }

    if (room.players.length !== 6) {
      socket.emit("error:message", "需要正好 6 名玩家才能开始。");
      return;
    }

    if (!validateSeatConfig(room)) {
      socket.emit("error:message", "棋手座位有误，无法开始游戏。请确认 6 名玩家分别为黑1、黑2、黑3、白1、白2、白3，且不可重复。");
      return;
    }

    assignRoles(room);
    emitRoom(room);
  });

  socket.on("accusation:submit", ({ roomId, targetId, abstain }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "accusing") return;

    const player = room.players.find((item) => item.id === socket.id);
    if (!player) return;

    if (player.eliminated) {
      socket.emit("error:message", "出局玩家无需参与指认。");
      return;
    }

    if (!getSpyInTeam(room, player.team)) {
      socket.emit("error:message", `${teamName(player.team)}内鬼已找出，本轮指认无需操作。`);
      return;
    }

    if (abstain) {
      room.accusations[player.id] = "abstain";
      pushLog(room, `${player.name} 已完成指认。`);
      evaluateAccusationNode(room);
      emitRoom(room);
      return;
    }

    const target = room.players.find((item) => item.id === targetId);

    if (!target) {
      socket.emit("error:message", "请选择要指认的玩家，或选择不指认。");
      return;
    }

    if (target.team !== player.team) {
      socket.emit("error:message", "只能指认本队玩家。");
      return;
    }

    if (target.id === player.id) {
      socket.emit("error:message", "不能指认自己。");
      return;
    }

    if (target.eliminated) {
      socket.emit("error:message", "不能指认已经出局的玩家。");
      return;
    }

    room.accusations[player.id] = target.id;
    pushLog(room, `${player.name} 已完成指认。`);

    evaluateAccusationNode(room);
    emitRoom(room);
  });

  socket.on("final-ai:submit", ({ roomId, winnerTeam }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== "final-ai") return;

    if (room.hostId !== socket.id) {
      socket.emit("error:message", "只有房主可以提交终局 AI 判定。");
      return;
    }

    if (winnerTeam !== "black" && winnerTeam !== "white") {
      socket.emit("error:message", "请选择调整后 AI 胜率更高的一方。\n如第 150 手存在指认成功，请先按黑方/白方奖励修正后再选择。");
      return;
    }

    submitFinalAiResult(room, winnerTeam);
    emitRoom(room);
  });

  socket.on("game:reset", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit("error:message", "只有房主可以重开游戏。");
      return;
    }

    for (const player of room.players) {
      player.team = null;
      player.role = null;
      player.eliminated = false;
    }

    room.started = false;
    room.phase = "waiting";
    room.currentNodeIndex = 0;
    room.teams = {
      black: [],
      white: []
    };
    room.accusations = {};
    room.gameLog = [];
    room.finalResult = null;
    room.finalAiReason = null;
    room.finalWinRateBonus = {
      black: 0,
      white: 0
    };

    emitRoom(room);
  });

  socket.on("disconnect", () => {
    removePlayer(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Spy Go server running at http://localhost:${PORT}`);
});
