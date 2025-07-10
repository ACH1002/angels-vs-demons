const {
  ROLES,
  GAME_CONFIG,
  CARD_DECK,
  ROUND_STATUS,
} = require("../utils/constants");

class GameRoom {
  constructor(roomId, roomCode, hostName) {
    this.roomId = roomId;
    this.roomCode = roomCode;
    this.hostName = hostName;
    this.players = new Map();
    this.gameState = {
      phase: "waiting",
      currentRound: 1,
      currentTurnIndex: 0,
      turnOrder: [],
      proposedExecutor: null,
      votes: new Map(),
      goodDeeds: 0,
      evilDeeds: 0,
      cardDeck: [],
      revealedDemons: [],
      deadPlayers: [],
      canKill: false,
      timer: 0,
      timerInterval: null,
      godGuesses: new Map(),
      // 새로 추가: 각 순서별 상태 추적
      turnHistory: [], // 각 턴의 결과를 저장
      currentTurnStatus: ROUND_STATUS.PENDING,
    };
    this.maxPlayers = GAME_CONFIG.MAX_PLAYERS;
    this.gameStarted = false;
  }

  addPlayer(socket, playerName) {
    if (this.players.size >= this.maxPlayers || this.gameStarted) {
      return false;
    }

    const player = {
      id: socket.id,
      name: playerName,
      socket: socket,
      role: null,
      alive: true,
    };

    this.players.set(socket.id, player);
    this.broadcastPlayerCount();
    this.broadcastPlayerList();

    if (this.players.size === this.maxPlayers) {
      setTimeout(() => this.startGame(), 1000);
    }

    return true;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.players.size === 0) {
      this.cleanup();
    } else {
      this.broadcastPlayerCount();
      this.broadcastPlayerList();
    }
  }

  startGame() {
    this.gameStarted = true;
    this.assignRoles();

    const playerArray = Array.from(this.players.values());
    this.gameState.turnOrder = playerArray.sort(() => Math.random() - 0.5);
    this.gameState.phase = "nomination";
    this.gameState.currentTurnIndex = 0;

    this.sendRoleInfo();
    this.broadcastGameState();
    this.startNominationPhase();
  }

  assignRoles() {
    const roles = [
      "god",
      "archangel",
      "angel",
      "angel",
      "angel",
      "angel",
      "lucifer",
      "demon",
      "demon",
      "demon",
    ];
    const shuffledRoles = roles.sort(() => Math.random() - 0.5);

    let index = 0;
    for (const player of this.players.values()) {
      player.role = shuffledRoles[index++];
    }
  }

  sendRoleInfo() {
    for (const player of this.players.values()) {
      const roleInfo = {
        role: player.role,
        team: ROLES[player.role].team,
        knownAllies: this.getKnownAllies(player),
      };
      player.socket.emit("roleAssigned", roleInfo);
    }
  }

  getKnownAllies(player) {
    const allies = [];

    if (player.role === "archangel") {
      const god = Array.from(this.players.values()).find(
        (p) => p.role === "god"
      );
      if (god) allies.push({ name: god.name, role: "god" });
    } else if (["lucifer", "demon"].includes(player.role)) {
      for (const p of this.players.values()) {
        if (["lucifer", "demon"].includes(p.role) && p.id !== player.id) {
          allies.push({ name: p.name, role: p.role });
        }
      }
    }

    return allies;
  }

  startNominationPhase() {
    this.gameState.phase = "nomination";
    this.gameState.proposedExecutor = null;
    this.gameState.votes.clear();
    this.gameState.currentTurnStatus = ROUND_STATUS.NOMINATING;

    this.broadcastGameState();
    this.startTimer(GAME_CONFIG.TIMER_NOMINATION);

    const currentLeader =
      this.gameState.turnOrder[this.gameState.currentTurnIndex];

    // 현재 턴 정보를 히스토리에 추가/업데이트
    const currentTurnInfo = {
      round: this.gameState.currentRound,
      turnIndex: this.gameState.currentTurnIndex,
      leader: {
        id: currentLeader.id,
        name: currentLeader.name,
      },
      status: ROUND_STATUS.NOMINATING,
      proposedExecutor: null,
      voteResult: null,
    };

    // 현재 턴 인덱스에 해당하는 히스토리 업데이트
    this.gameState.turnHistory[this.gameState.currentTurnIndex] =
      currentTurnInfo;

    this.broadcast("phaseChange", {
      phase: "nomination",
      currentLeader: { id: currentLeader.id, name: currentLeader.name },
      message: `라운드 ${this.gameState.currentRound}: 집행자를 지목하세요`,
    });

    // 턴 순서 정보 브로드캐스트
    this.broadcastTurnOrder();
  }

  handleNomination(socketId, targetPlayerId) {
    const currentLeader =
      this.gameState.turnOrder[this.gameState.currentTurnIndex];
    if (currentLeader.id !== socketId || targetPlayerId === socketId) return;

    const targetPlayer = this.players.get(targetPlayerId);
    if (!targetPlayer || !targetPlayer.alive) return;

    this.gameState.proposedExecutor = targetPlayer;
    this.gameState.currentTurnStatus = ROUND_STATUS.VOTING;

    // 턴 히스토리 업데이트
    if (this.gameState.turnHistory[this.gameState.currentTurnIndex]) {
      this.gameState.turnHistory[
        this.gameState.currentTurnIndex
      ].proposedExecutor = {
        id: targetPlayer.id,
        name: targetPlayer.name,
      };
      this.gameState.turnHistory[this.gameState.currentTurnIndex].status =
        ROUND_STATUS.VOTING;
    }

    this.broadcastTurnOrder();
    this.startVotingPhase();
  }

  startVotingPhase() {
    this.gameState.phase = "voting";
    this.gameState.votes.clear();

    this.broadcastGameState();
    this.startTimer(GAME_CONFIG.TIMER_VOTING);

    this.broadcast("phaseChange", {
      phase: "voting",
      proposedExecutor: {
        id: this.gameState.proposedExecutor.id,
        name: this.gameState.proposedExecutor.name,
      },
      message: `${this.gameState.proposedExecutor.name}의 집행자 승인 투표`,
    });
  }

  handleVote(socketId, approve) {
    if (this.gameState.phase !== "voting") return;

    const player = this.players.get(socketId);
    if (!player || !player.alive) return;

    this.gameState.votes.set(socketId, approve);

    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.alive
    );
    if (this.gameState.votes.size === alivePlayers.length) {
      this.processVoteResults();
    }
  }

  processVoteResults() {
    const approveVotes = Array.from(this.gameState.votes.values()).filter(
      (v) => v
    ).length;
    const totalVotes = this.gameState.votes.size;
    const majority = Math.ceil(totalVotes / 2);
    const approved = approveVotes >= majority;

    // 턴 히스토리 업데이트
    if (this.gameState.turnHistory[this.gameState.currentTurnIndex]) {
      this.gameState.turnHistory[this.gameState.currentTurnIndex].voteResult = {
        approved,
        approveVotes,
        totalVotes,
      };
      this.gameState.turnHistory[this.gameState.currentTurnIndex].status =
        approved ? ROUND_STATUS.APPROVED : ROUND_STATUS.REJECTED;
    }

    this.gameState.currentTurnStatus = approved
      ? ROUND_STATUS.APPROVED
      : ROUND_STATUS.REJECTED;

    this.broadcast("voteResults", {
      approveVotes,
      totalVotes,
      approved,
    });

    this.broadcastTurnOrder();

    if (approved) {
      this.startCardSelectionPhase();
    } else {
      this.nextTurn();
    }
  }

  broadcastTurnOrder() {
    const turnOrderInfo = this.gameState.turnOrder.map((player, index) => {
      const turnInfo = this.gameState.turnHistory[index];
      return {
        index,
        player: {
          id: player.id,
          name: player.name,
          alive: player.alive,
        },
        isCurrent: index === this.gameState.currentTurnIndex,
        status: turnInfo ? turnInfo.status : ROUND_STATUS.PENDING,
        proposedExecutor: turnInfo ? turnInfo.proposedExecutor : null,
        voteResult: turnInfo ? turnInfo.voteResult : null,
      };
    });

    this.broadcast("turnOrderUpdate", {
      turnOrder: turnOrderInfo,
      currentTurnIndex: this.gameState.currentTurnIndex,
      currentRound: this.gameState.currentRound,
    });
  }

  startCardSelectionPhase() {
    this.gameState.phase = "cardSelection";

    const deck = [];
    for (let i = 0; i < CARD_DECK.GOOD_CARDS; i++) deck.push("good");
    for (let i = 0; i < CARD_DECK.EVIL_CARDS; i++) deck.push("evil");

    this.gameState.cardDeck = [];
    for (let i = 0; i < CARD_DECK.DRAW_COUNT; i++) {
      const randomIndex = Math.floor(Math.random() * deck.length);
      this.gameState.cardDeck.push(deck.splice(randomIndex, 1)[0]);
    }

    this.broadcastGameState();
    this.startTimer(GAME_CONFIG.TIMER_CARD_SELECTION);

    const currentLeader =
      this.gameState.turnOrder[this.gameState.currentTurnIndex];

    currentLeader.socket.emit("phaseChange", {
      phase: "cardSelection",
      step: "leader",
      cards: this.gameState.cardDeck,
      message: "제거할 카드를 선택하세요",
      isMyTurn: true,
    });

    for (const player of this.players.values()) {
      if (player.id !== currentLeader.id) {
        player.socket.emit("phaseChange", {
          phase: "cardSelection",
          step: "leader",
          message: `${currentLeader.name}이(가) 카드를 제거하는 중입니다...`,
          isMyTurn: false,
        });
      }
    }
  }

  handleCardSelection(socketId, cardIndex) {
    if (this.gameState.phase !== "cardSelection") return;

    const currentLeader =
      this.gameState.turnOrder[this.gameState.currentTurnIndex];
    const isLeaderTurn = this.gameState.cardDeck.length === 3;
    const isExecutorTurn = this.gameState.cardDeck.length === 2;

    if (isLeaderTurn && currentLeader.id !== socketId) return;
    if (isExecutorTurn && this.gameState.proposedExecutor.id !== socketId)
      return;

    this.gameState.cardDeck.splice(cardIndex, 1);

    if (this.gameState.cardDeck.length === 2) {
      this.broadcast("chatMessage", {
        playerName: "System",
        message: `📋 ${currentLeader.name}이(가) 카드를 제거했습니다. (남은 카드: 2장)`,
        timestamp: Date.now(),
      });

      this.gameState.proposedExecutor.socket.emit("phaseChange", {
        phase: "cardSelection",
        step: "executor",
        cards: this.gameState.cardDeck,
        message: "제거할 카드를 선택하세요",
        isMyTurn: true,
      });

      for (const player of this.players.values()) {
        if (player.id !== this.gameState.proposedExecutor.id) {
          player.socket.emit("phaseChange", {
            phase: "cardSelection",
            step: "executor",
            message: `${this.gameState.proposedExecutor.name}이(가) 카드를 제거하는 중입니다...`,
            isMyTurn: false,
          });
        }
      }

      this.startTimer(GAME_CONFIG.TIMER_CARD_SELECTION);
    } else if (this.gameState.cardDeck.length === 1) {
      this.broadcast("chatMessage", {
        playerName: "System",
        message: `📋 ${this.gameState.proposedExecutor.name}이(가) 카드를 제거했습니다. 최종 카드를 공개합니다!`,
        timestamp: Date.now(),
      });

      this.revealFinalCard();
    }
  }

  revealFinalCard() {
    const finalCard = this.gameState.cardDeck[0];

    if (finalCard === "good") {
      this.gameState.goodDeeds++;
    } else {
      this.gameState.evilDeeds++;
      this.revealDemonToGod();

      if (this.gameState.evilDeeds === GAME_CONFIG.EVIL_KILL_THRESHOLD) {
        this.gameState.canKill = true;
      }
    }

    this.broadcast("cardRevealed", {
      card: finalCard,
      goodDeeds: this.gameState.goodDeeds,
      evilDeeds: this.gameState.evilDeeds,
    });

    if (
      this.gameState.canKill &&
      this.gameState.evilDeeds === GAME_CONFIG.EVIL_KILL_THRESHOLD
    ) {
      this.startKillPhase();
    } else {
      this.checkWinCondition();
    }
  }

  revealDemonToGod() {
    if (this.gameState.evilDeeds > 3) return;

    const god = Array.from(this.players.values()).find((p) => p.role === "god");
    if (!god || !god.alive) return;

    const unrevealedDemons = Array.from(this.players.values()).filter(
      (p) =>
        p.role === "demon" &&
        !this.gameState.revealedDemons.includes(p.id) &&
        p.alive
    );

    if (unrevealedDemons.length > 0) {
      const randomIndex = Math.floor(Math.random() * unrevealedDemons.length);
      const revealed = unrevealedDemons[randomIndex];

      this.gameState.revealedDemons.push(revealed.id);

      god.socket.emit("demonRevealed", {
        name: revealed.name,
        playerId: revealed.id,
        revealedCount: this.gameState.revealedDemons.length,
        totalRevealed: this.gameState.revealedDemons.map((id) => {
          const player = this.players.get(id);
          return { name: player.name, playerId: id };
        }),
      });
    }
  }

  startKillPhase() {
    this.gameState.phase = "kill";
    this.broadcastGameState();
    this.startTimer(GAME_CONFIG.TIMER_KILL);

    const currentLeader =
      this.gameState.turnOrder[this.gameState.currentTurnIndex];
    this.broadcast("phaseChange", {
      phase: "kill",
      currentLeader: { id: currentLeader.id, name: currentLeader.name },
      message: "대표자가 플레이어를 제거합니다",
    });
  }

  handleKill(socketId, targetPlayerId) {
    const currentLeader =
      this.gameState.turnOrder[this.gameState.currentTurnIndex];
    if (currentLeader.id !== socketId || !this.gameState.canKill) return;

    const targetPlayer = this.players.get(targetPlayerId);
    if (!targetPlayer || !targetPlayer.alive) return;

    targetPlayer.alive = false;
    this.gameState.deadPlayers.push(targetPlayer);
    this.gameState.canKill = false;

    this.broadcast("playerKilled", {
      killedPlayer: { name: targetPlayer.name, role: targetPlayer.role },
    });

    this.checkWinCondition();
  }

  startGodGuessingPhase() {
    this.gameState.phase = "godGuess";
    this.gameState.godGuesses.clear();

    this.broadcastGameState();
    this.startTimer(GAME_CONFIG.TIMER_GOD_GUESS);

    this.broadcast("phaseChange", {
      phase: "godGuess",
      message: "선행 5개 달성! 악마팀이 신을 지목합니다...",
    });
  }

  handleGodGuess(socketId, targetPlayerId) {
    if (this.gameState.phase !== "godGuess") return;

    const player = this.players.get(socketId);
    if (!player || !player.alive || !["lucifer", "demon"].includes(player.role))
      return;

    const targetPlayer = this.players.get(targetPlayerId);
    if (!targetPlayer || !targetPlayer.alive) return;

    this.gameState.godGuesses.set(socketId, targetPlayerId);

    const aliveDemons = Array.from(this.players.values()).filter(
      (p) => p.alive && ["lucifer", "demon"].includes(p.role)
    );

    if (this.gameState.godGuesses.size === aliveDemons.length) {
      this.processGodGuessResults();
    }
  }

  processGodGuessResults() {
    const voteCount = new Map();

    for (const targetId of this.gameState.godGuesses.values()) {
      voteCount.set(targetId, (voteCount.get(targetId) || 0) + 1);
    }

    let maxVotes = 0;
    let guessedPlayerId = null;

    for (const [playerId, votes] of voteCount.entries()) {
      if (votes > maxVotes) {
        maxVotes = votes;
        guessedPlayerId = playerId;
      }
    }

    const guessedPlayer = this.players.get(guessedPlayerId);
    const isCorrect = guessedPlayer && guessedPlayer.role === "god";

    this.broadcast("godGuessingResults", {
      guessedPlayer: { name: guessedPlayer.name, role: guessedPlayer.role },
      correct: isCorrect,
      votes: maxVotes,
    });

    if (isCorrect) {
      this.endGame("demon", "악마팀이 신을 정확히 지목했습니다!");
    } else {
      this.endGame("angel", "5개의 선행을 달성했습니다!");
    }
  }

  checkWinCondition() {
    if (this.gameState.evilDeeds >= GAME_CONFIG.WIN_CONDITION_EVIL) {
      this.endGame("demon", "5개의 악행을 달성했습니다!");
      return;
    }

    const god = Array.from(this.players.values()).find((p) => p.role === "god");
    if (!god.alive) {
      this.endGame("demon", "신이 제거되었습니다!");
      return;
    }

    if (this.gameState.goodDeeds >= GAME_CONFIG.WIN_CONDITION_GOOD) {
      this.startGodGuessingPhase();
      return;
    }

    this.nextTurn();
  }

  nextTurn() {
    // 현재 턴 완료 표시
    if (this.gameState.turnHistory[this.gameState.currentTurnIndex]) {
      this.gameState.turnHistory[this.gameState.currentTurnIndex].status =
        ROUND_STATUS.COMPLETED;
    }

    this.gameState.currentTurnIndex =
      (this.gameState.currentTurnIndex + 1) % this.gameState.turnOrder.length;
    this.gameState.currentRound++;
    this.gameState.proposedExecutor = null;
    this.gameState.votes.clear();
    this.gameState.currentTurnStatus = ROUND_STATUS.PENDING;

    setTimeout(() => this.startNominationPhase(), 3000);
  }

  endGame(winner, reason) {
    this.gameState.phase = "gameOver";
    this.clearTimer();

    const playerRoles = Array.from(this.players.values()).map((p) => ({
      name: p.name,
      role: p.role,
      alive: p.alive,
    }));

    const gameOverData = {
      winner,
      reason,
      playerRoles,
      gameStats: {
        totalRounds: this.gameState.currentRound,
        goodDeeds: this.gameState.goodDeeds,
        evilDeeds: this.gameState.evilDeeds,
        playersKilled: this.gameState.deadPlayers.length,
      },
      roomCode: this.roomCode,
    };

    this.broadcast("gameOver", gameOverData);
    setTimeout(() => this.cleanup(), 30000);
  }

  startTimer(seconds) {
    this.clearTimer();
    this.gameState.timer = seconds;

    this.gameState.timerInterval = setInterval(() => {
      this.gameState.timer--;
      this.broadcast("timerUpdate", this.gameState.timer);

      if (this.gameState.timer <= 0) {
        this.handleTimeOut();
      }
    }, 1000);
  }

  clearTimer() {
    if (this.gameState.timerInterval) {
      clearInterval(this.gameState.timerInterval);
      this.gameState.timerInterval = null;
    }
  }

  handleTimeOut() {
    this.clearTimer();

    const handlers = {
      nomination: () => this.handleNominationTimeout(),
      voting: () => this.processVoteResults(),
      cardSelection: () => this.handleCardSelectionTimeout(),
      kill: () => this.handleKillTimeout(),
      godGuess: () => this.handleGodGuessTimeout(),
    };

    const handler = handlers[this.gameState.phase];
    if (handler) handler();
  }

  handleNominationTimeout() {
    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.alive
    );
    const currentLeader =
      this.gameState.turnOrder[this.gameState.currentTurnIndex];
    const eligiblePlayers = alivePlayers.filter(
      (p) => p.id !== currentLeader.id
    );
    const randomPlayer =
      eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    this.gameState.proposedExecutor = randomPlayer;
    this.startVotingPhase();
  }

  handleCardSelectionTimeout() {
    const randomIndex = Math.floor(
      Math.random() * this.gameState.cardDeck.length
    );
    const isLeaderTurn = this.gameState.cardDeck.length === 3;
    const currentPlayer = isLeaderTurn
      ? this.gameState.turnOrder[this.gameState.currentTurnIndex]
      : this.gameState.proposedExecutor;

    this.broadcast("chatMessage", {
      playerName: "System",
      message: `⏰ ${currentPlayer.name}이(가) 시간 초과로 랜덤 카드를 제거했습니다.`,
      timestamp: Date.now(),
    });

    this.handleCardSelection(currentPlayer.id, randomIndex);
  }

  handleKillTimeout() {
    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.alive
    );
    const randomPlayer =
      alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    this.handleKill(
      this.gameState.turnOrder[this.gameState.currentTurnIndex].id,
      randomPlayer.id
    );
  }

  handleGodGuessTimeout() {
    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.alive
    );
    const randomPlayer =
      alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

    this.broadcast("chatMessage", {
      playerName: "System",
      message: `⏰ 시간 초과! 랜덤으로 ${randomPlayer.name}을(를) 신으로 지목합니다.`,
      timestamp: Date.now(),
    });

    const isCorrect = randomPlayer.role === "god";

    this.broadcast("godGuessingResults", {
      guessedPlayer: { name: randomPlayer.name, role: randomPlayer.role },
      correct: isCorrect,
      votes: 0,
    });

    if (isCorrect) {
      this.endGame("demon", "악마팀이 신을 정확히 지목했습니다!");
    } else {
      this.endGame("angel", "5개의 선행을 달성했습니다!");
    }
  }

  broadcastPlayerCount() {
    this.broadcast("waitingForPlayers", {
      current: this.players.size,
      max: this.maxPlayers,
    });
  }

  broadcastPlayerList() {
    const playerList = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
    }));

    this.broadcast("playerList", playerList);
  }

  broadcastGameState() {
    const state = {
      phase: this.gameState.phase,
      currentRound: this.gameState.currentRound,
      goodDeeds: this.gameState.goodDeeds,
      evilDeeds: this.gameState.evilDeeds,
      currentTurnIndex: this.gameState.currentTurnIndex,
      currentTurnStatus: this.gameState.currentTurnStatus,
      turnOrder: this.gameState.turnOrder.map((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
      })),
    };

    this.broadcast("gameState", state);
  }

  broadcast(event, data) {
    for (const player of this.players.values()) {
      if (player.socket && player.socket.connected) {
        player.socket.emit(event, data);
      }
    }
  }

  cleanup() {
    this.clearTimer();
  }
}

module.exports = GameRoom;
