const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

const HAND_NODES = [50, 100, 150];

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
    finalAiReason: null
  };
}

function sanitizeName(name) {
  const value = String(name || "").trim();
  return value.slice(0, 16) || "匿名玩家";
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
    finalAiReason: room.finalAiReason
  };
}

function privatePlayerState(room, socketId) {
  const player = room.players.find((item) => item.id === socketId);
  if (!player) return null;

  return {
    id: player.id,
    name: player.name,
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

function assignRoles(room) {
  const players = shuffle(room.players);

  room.teams.black = [];
  room.teams.white = [];

  players.forEach((player, index) => {
    player.team = index < 3 ? "black" : "white";
    player.role = "loyalist";
    player.eliminated = false;
  });

  const blackPlayers = players.filter((player) => player.team === "black");
  const whitePlayers = players.filter((player) => player.team === "white");

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
  room.gameLog = [
    `游戏开始：黑方 3 人，白方 3 人。`,
    `第 ${HAND_NODES[0]} 手指认节点开启。`
  ];
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
  room.gameLog.push(message);
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
    room.gameLog.push(`第 ${HAND_NODES[room.currentNodeIndex]} 手指认节点开启。`);
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
    const teamName = result.team === "black" ? "黑方" : "白方";
    const spy = room.players.find((player) => player.id === result.spyId);

    if (spy) {
      spy.eliminated = true;
    }

    room.gameLog.push(`第 ${currentHand} 手：${teamName}两名忠臣均指认正确，内鬼出局。`);
  }

  for (const result of failedTeams) {
    const teamName = result.team === "black" ? "黑方" : "白方";
    room.gameLog.push(`第 ${currentHand} 手：${teamName}忠臣指认失败，本方忠臣判负。`);
  }

  if (failedTeams.length > 0) {
    room.phase = "ended";
    room.finalResult = buildImmediateResult(failedTeams);
    room.accusations = {};
    return;
  }

  if (foundTeams.length === 0) {
    room.gameLog.push(`第 ${currentHand} 手：未出现指认失败或成功抓出内鬼，棋局继续。`);
  }

  advanceAccusationNode(room);
}

function buildImmediateResult(failedTeams) {
  const result = [];

  for (const item of failedTeams) {
    result.push({
      team: item.team,
      winner: "spy",
      reason: "本方忠臣指认失败，本方内鬼获胜"
    });
  }

  if (failedTeams.length === 1) {
    const failedTeam = failedTeams[0].team;
    const otherTeam = failedTeam === "black" ? "white" : "black";

    result.push({
      team: otherTeam,
      winner: "team",
      reason: "对方忠臣指认失败，本方 3 人获胜"
    });
  }

  return {
    type: "accusation",
    result
  };
}

function submitFinalAiResult(room, blackAiHigher) {
  const blackSpy = getSpyInTeam(room, "black");
  const whiteSpy = getSpyInTeam(room, "white");

  if (blackAiHigher) {
    room.finalResult = {
      type: "ai",
      black: {
        winner: "loyalists",
        reason: "黑方 AI 胜率更高，黑方忠臣胜"
      },
      white: {
        winner: "spy",
        reason: "黑方 AI 胜率更高，白方内鬼胜"
      },
      revealed: {
        blackSpyId: blackSpy?.id,
        whiteSpyId: whiteSpy?.id
      }
    };

    room.gameLog.push("终局判定：黑方 AI 胜率更高。黑方忠臣胜，白方内鬼胜。");
  } else {
    room.finalResult = {
      type: "ai",
      black: {
        winner: "spy",
        reason: "白方 AI 胜率更高，黑方内鬼胜"
      },
      white: {
        winner: "loyalists",
        reason: "白方 AI 胜率更高，白方忠臣胜"
      },
      revealed: {
        blackSpyId: blackSpy?.id,
        whiteSpyId: whiteSpy?.id
      }
    };

    room.gameLog.push("终局判定：白方 AI 胜率更高。白方忠臣胜，黑方内鬼胜。");
  }

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
  socket.on("room:join", ({ roomId, name }) => {
    const safeRoomId = String(roomId || "").trim().slice(0, 24);

    if (!safeRoomId) {
      socket.emit("error:message", "请输入房间号。");
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
      socket.emit("error:message", `${player.team === "black" ? "黑方" : "白方"}内鬼已找出，本轮指认无需操作。`);
      return;
    }

    if (abstain) {
      room.accusations[player.id] = "abstain";
      room.gameLog.push(`${player.name} 已完成指认。`);
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
    room.gameLog.push(`${player.name} 已完成指认。`);

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
      socket.emit("error:message", "请选择 AI 胜率更高的一方。");
      return;
    }

    submitFinalAiResult(room, winnerTeam === "black");
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

    emitRoom(room);
  });

  socket.on("disconnect", () => {
    removePlayer(socket);
  });
});

server.listen(PORT, () => {
  console.log(`Spy Go server running at http://localhost:${PORT}`);
});
