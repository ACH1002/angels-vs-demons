// 게임 상태 관리
let socket;
let gameState = {
  myRole: null,
  players: [],
  selectedPlayer: null,
  selectedCard: null,
  phase: "waiting",
};

let revealedDemonsList = [];
let currentRoomCode = "";
let currentPlayerName = "";

// 채팅 자동 스크롤 관리
let isAutoScrollEnabled = true;
let scrollLocked = false;
let lastScrollTop = 0;
let unreadMessageCount = 0;
let forceScrollToBottom = true; // 강제 스크롤 플래그

const ROLE_INFO = {
  god: {
    name: "신",
    team: "angel",
    description: "천사팀의 핵심. 정체를 숨기고 팀을 승리로 이끌어야 합니다.",
  },
  archangel: {
    name: "대천사",
    team: "angel",
    description: "신의 정체를 알고 있습니다. 신을 보호해야 합니다.",
  },
  angel: {
    name: "천사",
    team: "angel",
    description: "선량한 천사. 악마들을 찾아내야 합니다.",
  },
  lucifer: {
    name: "루시퍼",
    team: "demon",
    description: "악마팀의 리더. 다른 악마들과 함께 신을 찾아 제거해야 합니다.",
  },
  demon: {
    name: "악마",
    team: "demon",
    description: "루시퍼와 함께 천사들을 속이고 신을 찾아내야 합니다.",
  },
};

// 화면 전환 함수들
function showMainMenu() {
  hideAllScreens();
  document.getElementById("mainMenu").classList.remove("hidden");
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function createRoomScreen() {
  hideAllScreens();
  document.getElementById("createRoomArea").classList.remove("hidden");
}

function joinRoomScreen() {
  hideAllScreens();
  document.getElementById("joinRoomArea").classList.remove("hidden");
  refreshRoomList();
}

function showWaitingArea() {
  hideAllScreens();
  document.getElementById("waitingArea").classList.remove("hidden");
}

// 게임 시작 시 채팅 영역 초기화
function showGameArea() {
  hideAllScreens();
  document.getElementById("gameArea").style.display = "block";

  // 채팅 영역 초기화
  const chatMessages = document.getElementById("chatMessages");
  chatMessages.innerHTML = "";

  // 채팅 자동 스크롤 상태 초기화
  isAutoScrollEnabled = true;
  scrollLocked = false;
  unreadMessageCount = 0;
  forceScrollToBottom = true;
  hideNewMessageNotification();

  // 턴 순서 표시 영역 초기화
  const turnOrderDisplay = document.getElementById("turnOrderDisplay");
  if (turnOrderDisplay) {
    turnOrderDisplay.innerHTML = "";
  }

  // 채팅 스크롤 이벤트 리스너 설정
  setupChatScrollListener();

  // 환영 메시지 추가 (약간의 지연을 두고 순차적으로 추가)
  setTimeout(() => {
    addChatMessage(
      "🎮 게임이 시작되었습니다! 채팅을 통해 소통하세요.",
      "system"
    );
  }, 300);

  setTimeout(() => {
    addChatMessage("⏰ 제한 시간이 10분으로 설정되었습니다.", "system");
  }, 600);
}

function showGameResult() {
  hideAllScreens();
  document.getElementById("gameResultArea").classList.remove("hidden");
}

function hideAllScreens() {
  const screens = [
    "mainMenu",
    "createRoomArea",
    "joinRoomArea",
    "waitingArea",
    "gameResultArea",
  ];
  screens.forEach((screen) => {
    document.getElementById(screen).classList.add("hidden");
  });
  document.getElementById("gameArea").style.display = "none";
}

// 방 관련 함수들
function createRoom() {
  const hostName = document.getElementById("hostName").value.trim();
  if (!hostName) {
    alert("방장 이름을 입력해주세요.");
    return;
  }
  currentPlayerName = hostName;
  socket = io();
  setupSocketEvents();
  socket.emit("createRoom", { playerName: hostName });
}

function joinRoomByCode() {
  const playerName = document.getElementById("playerName").value.trim();
  const roomCode = document
    .getElementById("roomCodeInput")
    .value.trim()
    .toUpperCase();

  if (!playerName) {
    alert("플레이어 이름을 입력해주세요.");
    return;
  }
  if (!roomCode || roomCode.length !== 6) {
    alert("6자리 방 코드를 입력해주세요.");
    return;
  }

  currentPlayerName = playerName;
  socket = io();
  setupSocketEvents();
  socket.emit("joinRoom", { roomCode, playerName });
}

function refreshRoomList() {
  if (!socket) {
    socket = io();
    setupSocketEvents();
  }
  socket.emit("getRoomList");
}

function joinRoomFromList(roomCode) {
  const playerName = document.getElementById("playerName").value.trim();
  if (!playerName) {
    alert("플레이어 이름을 입력해주세요.");
    return;
  }
  currentPlayerName = playerName;
  socket.emit("joinRoom", { roomCode, playerName });
}

function leaveRoom() {
  showMainMenu();
}

function createNewRoom() {
  socket.emit("createRoom", { playerName: currentPlayerName });
}

// 소켓 이벤트 설정
function setupSocketEvents() {
  // 방 관련 이벤트들
  socket.on("roomCreated", handleRoomCreated);
  socket.on("roomCreateFailed", (message) => alert(message));
  socket.on("joinSuccess", handleJoinSuccess);
  socket.on("joinFailed", (message) => alert(message));
  socket.on("roomList", handleRoomList);
  socket.on("waitingForPlayers", handleWaitingForPlayers);

  // 게임 이벤트들
  socket.on("playerList", (players) => {
    gameState.players = players;
    updatePlayersGrid();
  });
  socket.on("roleAssigned", handleRoleAssigned);
  socket.on("gameState", updateGameInfo);
  socket.on("phaseChange", handlePhaseChange);
  socket.on("voteResults", handleVoteResults);
  socket.on("turnOrderUpdate", handleTurnOrderUpdate);
  socket.on("cardRevealed", handleCardRevealed);
  socket.on("demonRevealed", handleDemonRevealed);
  socket.on("playerKilled", handlePlayerKilled);
  socket.on("godGuessingResults", handleGodGuessingResults);
  socket.on("gameOver", displayGameResult);
  socket.on("timerUpdate", updateTimerDisplay);
  socket.on("chatMessage", handleChatMessage);
}

// 이벤트 핸들러들
function handleRoomCreated(data) {
  currentRoomCode = data.roomCode;
  document.getElementById("roomCode").textContent = data.roomCode;
  document.getElementById("hostInfo").textContent = `방장: ${data.hostName}`;
  showWaitingArea();
}

function handleJoinSuccess(data) {
  currentRoomCode = data.roomCode;
  document.getElementById("roomCode").textContent = data.roomCode;
  document.getElementById("hostInfo").textContent = `방장: ${data.hostName}`;
  showWaitingArea();
}

function handleRoomList(rooms) {
  const roomList = document.getElementById("roomList");
  if (rooms.length === 0) {
    roomList.innerHTML =
      '<div style="text-align: center; opacity: 0.7;">참가 가능한 방이 없습니다.</div>';
    return;
  }

  roomList.innerHTML = "";
  rooms.forEach((room) => {
    const roomItem = document.createElement("div");
    roomItem.className = "room-item";
    roomItem.onclick = () => joinRoomFromList(room.roomCode);
    roomItem.innerHTML = `
      <div class="room-info">
        <div class="room-code">${room.roomCode}</div>
        <div class="room-host">방장: ${room.hostName}</div>
      </div>
      <div class="room-players">${room.playerCount}/${room.maxPlayers}</div>
    `;
    roomList.appendChild(roomItem);
  });
}

function handleWaitingForPlayers(data) {
  document.getElementById(
    "playerCount"
  ).textContent = `${data.current}/${data.max} 명`;
}

function handleRoleAssigned(roleInfo) {
  gameState.myRole = roleInfo.role;
  revealedDemonsList = [];
  setupRoleDisplay(roleInfo);
  showGameArea();
}

function handleTurnOrderUpdate(data) {
  updateTurnOrderDisplay(
    data.turnOrder,
    data.currentTurnIndex,
    data.currentRound
  );
}

// 새로운 함수: 턴 순서 표시 업데이트
function updateTurnOrderDisplay(turnOrder, currentTurnIndex, currentRound) {
  const container = document.getElementById("turnOrderDisplay");
  if (!container) return;

  container.innerHTML = "";

  turnOrder.forEach((turnInfo, index) => {
    const turnCard = document.createElement("div");
    turnCard.className = `turn-card ${turnInfo.status}`;

    if (turnInfo.isCurrent) {
      turnCard.classList.add("current");
    }

    // 상태에 따른 한국어 메시지
    const statusMessages = {
      pending: "대기 중",
      nominating: "집행자 지목 중",
      voting: "투표 진행 중",
      approved: "승인됨",
      rejected: "거절됨",
      completed: "완료됨",
    };

    let cardContent = `
      <div class="status-icon ${turnInfo.status}"></div>
      <div class="turn-number">${index + 1}번째 순서</div>
      <div class="turn-leader">${turnInfo.player.name}</div>
      <div class="turn-status">${
        statusMessages[turnInfo.status] || turnInfo.status
      }</div>
    `;

    // 지목된 집행자 정보 추가
    if (turnInfo.proposedExecutor) {
      cardContent += `<div class="turn-executor">집행자: ${turnInfo.proposedExecutor.name}</div>`;
    }

    // 투표 결과 정보 추가
    if (turnInfo.voteResult) {
      const { approved, approveVotes, totalVotes } = turnInfo.voteResult;
      const resultText = approved ? "승인" : "거절";
      cardContent += `<div class="turn-vote-result">${resultText} (${approveVotes}/${totalVotes})</div>`;
    }

    turnCard.innerHTML = cardContent;
    container.appendChild(turnCard);
  });

  // 현재 차례인 카드로 스크롤
  setTimeout(() => {
    const currentCard = container.querySelector(".turn-card.current");
    if (currentCard) {
      currentCard.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, 100);
}

function handlePhaseChange(data) {
  gameState.phase = data.phase;
  document.getElementById("gameStatus").textContent = data.message;
  hideActionArea();

  // 페이즈 변경 시 시스템 메시지 추가
  switch (data.phase) {
    case "nomination":
      if (data.currentLeader.id === socket.id) {
        showNominationUI();
        addSystemMessage("🎯 당신의 차례입니다! 집행자를 지목하세요.");
      } else {
        addSystemMessage(
          `👤 ${data.currentLeader.name}이(가) 집행자를 지목하는 중...`
        );
      }
      break;

    case "voting":
      showVotingUI(data.proposedExecutor.name);
      addSystemMessage(
        `🗳️ ${data.proposedExecutor.name}을(를) 집행자로 승인할지 투표하세요!`
      );
      break;

    case "cardSelection":
      if (data.isMyTurn) {
        showCardSelectionUI("제거할 카드를 선택하세요", data.cards);
        addSystemMessage("🃏 제거할 카드를 선택하세요.");
      } else {
        addSystemMessage(`🃏 ${data.message}`);
      }
      break;

    case "kill":
      if (data.currentLeader.id === socket.id) {
        showKillUI();
        addSystemMessage("⚔️ 제거할 플레이어를 선택하세요.");
      } else {
        addSystemMessage(
          `⚔️ ${data.currentLeader.name}이(가) 플레이어를 제거하는 중...`
        );
      }
      break;

    case "godGuess":
      showGodGuessingUI(data);
      if (gameState.myRole === "lucifer" || gameState.myRole === "demon") {
        addSystemMessage("🔮 신이라고 생각하는 플레이어를 지목하세요!");
      } else {
        addSystemMessage("🔮 악마팀이 신을 찾고 있습니다...");
      }
      break;
  }
}

function handleVoteResults(results) {
  const message = `투표 결과: 찬성 ${results.approveVotes}표, 반대 ${
    results.totalVotes - results.approveVotes
  }표`;
  addChatMessage(message, "system");
  if (results.approved) {
    addChatMessage("✅ 과반수 찬성! 집행자로 선정되었습니다.", "system");
  } else {
    addChatMessage("❌ 과반수 반대! 다음 순번으로 넘어갑니다.", "system");
  }
}

function handleCardRevealed(data) {
  document.getElementById("goodDeeds").textContent = data.goodDeeds;
  document.getElementById("evilDeeds").textContent = data.evilDeeds;

  const cardType = data.card === "good" ? "선행" : "악행";
  const icon = data.card === "good" ? "✨" : "💀";
  addChatMessage(`${icon} ${cardType} 카드가 적립되었습니다!`, "system");

  updateCourtroomDisplay(data.goodDeeds, data.evilDeeds);
}

function handleDemonRevealed(data) {
  revealedDemonsList.push({ name: data.name, playerId: data.playerId });
  updateRevealedInfoCumulative();
  addChatMessage(
    `🔍 ${data.revealedCount}번째 악마의 정체가 공개되었습니다: ${data.name}`,
    "system"
  );
}

function handlePlayerKilled(data) {
  addChatMessage(
    `💀 ${data.killedPlayer.name}이(가) 제거되었습니다!`,
    "system"
  );
  addChatMessage(
    `🎭 정체: ${ROLE_INFO[data.killedPlayer.role].name}`,
    "system"
  );
}

function handleGodGuessingResults(data) {
  if (data.correct) {
    addChatMessage(
      `🎯 악마팀이 신을 정확히 찾아냈습니다! ${data.guessedPlayer.name}이(가) 신이었습니다!`,
      "system"
    );
  } else {
    addChatMessage(
      `❌ 악마팀이 신을 잘못 지목했습니다. ${data.guessedPlayer.name}은(는) 신이 아니었습니다!`,
      "system"
    );
  }
}

function handleChatMessage(data) {
  addChatMessage(`${data.playerName}: ${data.message}`, "player");

  // 메시지 받을 때마다 추가 스크롤 보장
  setTimeout(() => {
    forceChatScrollToBottom();
  }, 150);
}

function addSystemMessage(message) {
  addChatMessage(message, "system");
}

function addPlayerMessage(playerName, message) {
  addChatMessage(`${playerName}: ${message}`, "player");
}

// 채팅 스크롤 이벤트 리스너 설정
function setupChatScrollListener() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) {
    console.warn(
      "setupChatScrollListener: chatMessages 요소를 찾을 수 없습니다."
    );
    // 100ms 후 다시 시도
    setTimeout(setupChatScrollListener, 100);
    return;
  }

  console.log("채팅 스크롤 리스너 설정됨");

  // 스크롤 이벤트 리스너 제거 (중복 방지)
  chatMessages.removeEventListener("scroll", onChatScroll);

  // 새로운 스크롤 이벤트 리스너 추가
  chatMessages.addEventListener("scroll", onChatScroll);

  // 초기 스크롤 위치 설정
  lastScrollTop = chatMessages.scrollTop;

  // 초기에 강제로 맨 아래로 스크롤
  setTimeout(() => {
    forceChatScrollToBottom();
  }, 100);
}

// 채팅 스크롤 이벤트 핸들러
function onChatScroll() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages || scrollLocked) return;

  const currentScrollTop = chatMessages.scrollTop;
  const scrollHeight = chatMessages.scrollHeight;
  const clientHeight = chatMessages.clientHeight;
  const scrollBottom = scrollHeight - clientHeight - currentScrollTop;

  // 디버그 로그 (필요시 주석 해제)
  // console.log('스크롤 정보:', { currentScrollTop, scrollHeight, clientHeight, scrollBottom });

  // 사용자가 맨 아래 근처에 있으면 자동 스크롤 활성화
  // 15px 정도의 여유를 둠 (스크롤바 감도 개선)
  if (scrollBottom <= 15) {
    if (!isAutoScrollEnabled) {
      isAutoScrollEnabled = true;
      forceScrollToBottom = true;
      hideNewMessageNotification();
      // console.log('자동 스크롤 활성화됨');
    }
  } else {
    // 사용자가 위로 스크롤하면 자동 스크롤 비활성화
    if (currentScrollTop < lastScrollTop && isAutoScrollEnabled) {
      isAutoScrollEnabled = false;
      forceScrollToBottom = false;
      // console.log('자동 스크롤 비활성화됨');
    }
  }

  lastScrollTop = currentScrollTop;
}

// 개선된 채팅 메시지 추가 함수
function addChatMessage(message, type = "player") {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) {
    console.error("addChatMessage: chatMessages 요소를 찾을 수 없습니다.");
    return;
  }

  console.log("메시지 추가:", message, "type:", type);

  const messageDiv = document.createElement("div");

  // 기존 스타일링 코드
  messageDiv.className = `chat-message ${type}`;
  messageDiv.style.marginBottom = "5px";
  messageDiv.style.padding = "5px";
  messageDiv.style.borderRadius = "5px";
  messageDiv.style.opacity = "0";
  messageDiv.style.transform = "translateY(10px)";
  messageDiv.style.animation = "slideInMessage 0.3s ease forwards";

  // 타임스탬프 추가
  const timestamp = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (type === "system") {
    messageDiv.style.color = "#ffd700";
    messageDiv.style.fontWeight = "bold";
    messageDiv.style.background = "rgba(255, 215, 0, 0.1)";
    messageDiv.style.borderLeft = "3px solid #ffd700";
    messageDiv.style.paddingLeft = "8px";
    messageDiv.innerHTML =
      `<span class="chat-timestamp">[${timestamp}]</span> ${message}`.replace(
        /\n/g,
        "<br>"
      );
  } else {
    messageDiv.style.color = "#ffffff";
    messageDiv.style.background = "rgba(255, 255, 255, 0.05)";
    messageDiv.style.borderLeft = "3px solid #667eea";
    messageDiv.style.paddingLeft = "8px";
    messageDiv.innerHTML =
      `<span class="chat-timestamp">[${timestamp}]</span> ${message}`.replace(
        /\n/g,
        "<br>"
      );
  }

  // DOM에 추가하기 전 스크롤 정보 기록
  const beforeAdd = {
    scrollTop: chatMessages.scrollTop,
    scrollHeight: chatMessages.scrollHeight,
    clientHeight: chatMessages.clientHeight,
  };

  chatMessages.appendChild(messageDiv);
  console.log(
    "메시지 DOM에 추가됨. 전체 메시지 수:",
    chatMessages.children.length
  );

  // DOM에 추가한 후 스크롤 정보 기록
  const afterAdd = {
    scrollTop: chatMessages.scrollTop,
    scrollHeight: chatMessages.scrollHeight,
    clientHeight: chatMessages.clientHeight,
  };

  console.log("메시지 추가 전후 스크롤 정보:", { beforeAdd, afterAdd });

  // 메시지가 너무 많으면 오래된 메시지 제거 (성능 최적화)
  const maxMessages = 100;
  while (chatMessages.children.length > maxMessages) {
    chatMessages.removeChild(chatMessages.firstChild);
  }

  // 강력한 자동 스크롤 처리 - 여러 방법 동시 적용
  if (forceScrollToBottom || isAutoScrollEnabled) {
    console.log(
      "자동 스크롤 시작. forceScrollToBottom:",
      forceScrollToBottom,
      "isAutoScrollEnabled:",
      isAutoScrollEnabled
    );

    // 즉시 스크롤 시도
    forceChatScrollToBottom();

    // DOM 업데이트를 기다린 후 다시 스크롤
    setTimeout(() => {
      forceChatScrollToBottom();
    }, 0);

    // 애니메이션 완료 후 한 번 더
    setTimeout(() => {
      forceChatScrollToBottom();
    }, 350); // 애니메이션이 300ms이므로 그 이후
  } else {
    console.log("자동 스크롤 비활성화됨. 알림 표시.");
    // 읽지 않은 메시지 카운트 증가
    unreadMessageCount++;
    showNewMessageNotification();
  }
}

// 강력한 스크롤 함수 - HTML 구조에 맞게 수정
function forceChatScrollToBottom() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) {
    console.warn("chatMessages 요소를 찾을 수 없습니다.");
    return;
  }

  // 현재 스크롤 정보 로깅
  console.log("스크롤 전:", {
    scrollTop: chatMessages.scrollTop,
    scrollHeight: chatMessages.scrollHeight,
    clientHeight: chatMessages.clientHeight,
    offsetHeight: chatMessages.offsetHeight,
  });

  const scrollToBottomNow = () => {
    const maxScroll = Math.max(
      0,
      chatMessages.scrollHeight - chatMessages.clientHeight
    );
    chatMessages.scrollTop = maxScroll;
    console.log("스크롤 설정:", maxScroll, "현재:", chatMessages.scrollTop);
  };

  // 방법 1: 즉시 스크롤 (동기)
  scrollToBottomNow();

  // 방법 2: DOM 업데이트 후 스크롤 (비동기)
  Promise.resolve().then(() => {
    scrollToBottomNow();
  });

  // 방법 3: requestAnimationFrame으로 렌더링 후 스크롤
  requestAnimationFrame(() => {
    scrollToBottomNow();

    // 방법 4: 한 번 더 확인
    requestAnimationFrame(() => {
      scrollToBottomNow();
    });
  });

  // 방법 5: 여러 단계의 지연 후 스크롤 (확실히 하기 위해)
  [0, 10, 50, 100, 200, 500].forEach((delay) => {
    setTimeout(() => {
      scrollToBottomNow();
    }, delay);
  });

  // 방법 6: scrollTo 메서드도 함께 사용
  setTimeout(() => {
    try {
      chatMessages.scrollTo({
        top: chatMessages.scrollHeight,
        behavior: "auto",
      });
      console.log("scrollTo 실행됨");
    } catch (e) {
      console.warn("scrollTo 실패:", e);
      scrollToBottomNow();
    }
  }, 20);

  // 방법 7: MutationObserver로 DOM 변경 후 스크롤 보장
  if (window.chatMutationObserver) {
    window.chatMutationObserver.disconnect();
  }

  window.chatMutationObserver = new MutationObserver((mutations) => {
    console.log("DOM 변경 감지됨:", mutations.length);
    scrollToBottomNow();
  });

  window.chatMutationObserver.observe(chatMessages, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // 3초 후 observer 해제 (성능상)
  setTimeout(() => {
    if (window.chatMutationObserver) {
      window.chatMutationObserver.disconnect();
    }
  }, 3000);

  // 방법 8: IntersectionObserver로 스크롤 상태 확인
  if (window.chatIntersectionObserver) {
    window.chatIntersectionObserver.disconnect();
  }

  // 마지막 메시지가 보이는지 확인
  const lastMessage = chatMessages.lastElementChild;
  if (lastMessage) {
    window.chatIntersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            console.log("마지막 메시지가 보이지 않음. 다시 스크롤 시도");
            setTimeout(scrollToBottomNow, 100);
          }
        });
      },
      {
        root: chatMessages,
        threshold: 0.1,
      }
    );

    window.chatIntersectionObserver.observe(lastMessage);

    setTimeout(() => {
      if (window.chatIntersectionObserver) {
        window.chatIntersectionObserver.disconnect();
      }
    }, 2000);
  }

  // 로그로 확인
  setTimeout(() => {
    const isAtBottom =
      chatMessages.scrollTop >=
      chatMessages.scrollHeight - chatMessages.clientHeight - 5;
    console.log("스크롤 후:", {
      scrollTop: chatMessages.scrollTop,
      scrollHeight: chatMessages.scrollHeight,
      clientHeight: chatMessages.clientHeight,
      isAtBottom: isAtBottom,
    });

    if (!isAtBottom) {
      console.warn("스크롤이 완전히 되지 않았습니다. 강제 스크롤 재시도");
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }, 600);
}

// 즉시 스크롤 함수 (여러 방법 동시 적용)
function scrollChatToBottomImmediate() {
  forceChatScrollToBottom();
}

// 부드러운 스크롤 함수
function scrollChatToBottom() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  scrollLocked = true;

  chatMessages.scrollTo({
    top: chatMessages.scrollHeight,
    behavior: "smooth",
  });

  setTimeout(() => {
    scrollLocked = false;
  }, 500);
}

// 새 메시지 알림 표시
function showNewMessageNotification() {
  let notification = document.getElementById("newMessageNotification");

  if (!notification) {
    notification = document.createElement("button");
    notification.id = "newMessageNotification";
    notification.onclick = scrollToBottom;

    // chatMessages의 부모인 chat-area에 추가
    const chatArea = document.querySelector(".chat-area");
    if (chatArea) {
      chatArea.style.position = "relative";
      chatArea.appendChild(notification);
    } else {
      console.warn("chat-area 요소를 찾을 수 없습니다.");
      return;
    }
  }

  notification.textContent =
    unreadMessageCount > 99 ? "99+" : unreadMessageCount.toString();
  notification.style.display = "block";
  console.log("새 메시지 알림 표시:", unreadMessageCount);
}

// 새 메시지 알림 숨기기
function hideNewMessageNotification() {
  const notification = document.getElementById("newMessageNotification");
  if (notification) {
    notification.style.display = "none";
  }
  unreadMessageCount = 0;
}

// 스크롤을 맨 아래로 이동하는 함수
function scrollToBottom() {
  isAutoScrollEnabled = true;
  forceScrollToBottom = true;
  hideNewMessageNotification();
  forceChatScrollToBottom();

  // 추가 확인을 위해 한 번 더
  setTimeout(() => {
    forceChatScrollToBottom();
  }, 100);
}

// UI 업데이트 함수들
function setupRoleDisplay(roleInfo) {
  const role = ROLE_INFO[roleInfo.role];
  document.getElementById("roleName").textContent = role.name;
  document.getElementById("roleDescription").textContent = role.description;

  const roleCard = document.getElementById("roleInfo");
  roleCard.className =
    role.team === "angel" ? "role-card role-angel" : "role-card role-demon";

  if (roleInfo.knownAllies.length > 0) {
    document.getElementById("knownAllies").classList.remove("hidden");
    const alliesText = roleInfo.knownAllies
      .map((ally) => `${ally.name} (${ROLE_INFO[ally.role].name})`)
      .join("<br>");
    document.getElementById("alliesList").innerHTML = alliesText;
  }
}

// 기존 updateGameInfo 함수 수정 (턴 정보도 함께 업데이트)
function updateGameInfo(state) {
  document.getElementById("currentRound").textContent = state.currentRound;
  document.getElementById("goodDeeds").textContent = state.goodDeeds;
  document.getElementById("evilDeeds").textContent = state.evilDeeds;

  // 현재 상태 메시지 업데이트
  const statusMessages = {
    pending: "다음 대표자를 기다리는 중...",
    nominating: "집행자를 지목하는 중...",
    voting: "집행자 승인 투표 중...",
    approved: "집행자가 승인되었습니다!",
    rejected: "집행자가 거절되었습니다.",
  };

  if (state.currentTurnStatus && statusMessages[state.currentTurnStatus]) {
    const gameStatus = document.getElementById("gameStatus");
    if (gameStatus) {
      gameStatus.textContent = statusMessages[state.currentTurnStatus];
    }
  }
}

function getTurnStatusInfo(status) {
  const statusInfo = {
    pending: {
      color: "#6c757d",
      icon: "⏳",
      message: "대기 중",
    },
    nominating: {
      color: "#17a2b8",
      icon: "👤",
      message: "집행자 지목 중",
    },
    voting: {
      color: "#ffc107",
      icon: "🗳️",
      message: "투표 진행 중",
    },
    approved: {
      color: "#28a745",
      icon: "✅",
      message: "승인됨",
    },
    rejected: {
      color: "#dc3545",
      icon: "❌",
      message: "거절됨",
    },
    completed: {
      color: "#6c757d",
      icon: "✔️",
      message: "완료됨",
    },
  };

  return statusInfo[status] || statusInfo.pending;
}

function updateTimerDisplay(timeLeft) {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timerElement = document.getElementById("timer");

  // 시간 형식화 (MM:SS)
  const timeString = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
  timerElement.textContent = timeString;

  // 시간에 따른 색상 변경 및 경고
  if (timeLeft <= 30) {
    // 30초 이하: 빨간색 + 깜빡임
    timerElement.style.color = "#ff4757";
    timerElement.style.animation = "timerUrgent 1s infinite";

    // 10초 이하일 때 추가 경고
    if (timeLeft <= 10 && timeLeft > 0) {
      if (timeLeft % 1 === 0) {
        // 매 초마다
        addChatMessage(`⚠️ ${timeLeft}초 남았습니다!`, "system");
      }
    }
  } else if (timeLeft <= 120) {
    // 2분 이하: 주황색
    timerElement.style.color = "#ffa502";
    timerElement.style.animation = "none";
  } else if (timeLeft <= 300) {
    // 5분 이하: 노란색
    timerElement.style.color = "#ffd700";
    timerElement.style.animation = "none";
  } else {
    // 5분 이상: 기본 금색
    timerElement.style.color = "#ffd700";
    timerElement.style.animation = "none";
  }

  // 타이머 타입에 따른 배경 메시지
  const timerMessages = {
    600: "집행자 지목 시간", // 10분
    120: "투표 또는 카드 선택 시간", // 2분
    60: "플레이어 제거 시간", // 1분
  };

  // 타이머가 시작될 때 (처음 시간이 설정될 때) 메시지 표시
  const initialTime = getInitialTimerTime(timeLeft);
  if (initialTime && timerMessages[initialTime]) {
    // 이전 시간과 다르면 새로운 페이즈 시작
    if (
      !timerElement.dataset.lastInitialTime ||
      timerElement.dataset.lastInitialTime !== initialTime.toString()
    ) {
      timerElement.dataset.lastInitialTime = initialTime.toString();

      setTimeout(() => {
        addChatMessage(
          `⏰ ${timerMessages[initialTime]} (${Math.floor(
            initialTime / 60
          )}분)`,
          "system"
        );
      }, 100);
    }
  }
}

// 헬퍼 함수: 초기 타이머 시간 추정
function getInitialTimerTime(currentTime) {
  // 현재 시간이 특정 범위에 있으면 해당 초기 시간으로 추정
  if (currentTime >= 590 && currentTime <= 600) return 600; // 10분
  if (currentTime >= 115 && currentTime <= 120) return 120; // 2분
  if (currentTime >= 55 && currentTime <= 60) return 60; // 1분
  return null;
}

function updateCourtroomDisplay(goodDeeds, evilDeeds) {
  const courtroom = document.getElementById("courtroomCards");
  courtroom.innerHTML = "";

  for (let i = 0; i < goodDeeds; i++) {
    const card = document.createElement("div");
    card.className = "card card-good";
    card.innerHTML = "✨";
    courtroom.appendChild(card);
  }

  for (let i = 0; i < evilDeeds; i++) {
    const card = document.createElement("div");
    card.className = "card card-evil";
    card.innerHTML = "💀";
    courtroom.appendChild(card);
  }
}

function updateRevealedInfoCumulative() {
  const revealedInfoDiv = document.getElementById("revealedInfo");

  if (revealedDemonsList.length === 0) {
    revealedInfoDiv.innerHTML = "<div>아직 공개된 정보가 없습니다.</div>";
    return;
  }

  let htmlContent = "<h4>공개된 악마들:</h4>";
  revealedDemonsList.forEach((demon, index) => {
    htmlContent += `
      <div style="background: rgba(255, 71, 87, 0.2); padding: 8px; margin: 5px 0; border-radius: 5px; border-left: 4px solid #ff4757;">
        ${index + 1}번째: ${demon.name}
      </div>
    `;
  });
  revealedInfoDiv.innerHTML = htmlContent;
}

// 액션 UI 함수들
function showNominationUI() {
  showActionArea();
  document.getElementById("actionTitle").textContent = "집행자 지목";
  document.getElementById("actionDescription").textContent =
    "집행자로 지목할 플레이어를 선택하세요.";
  updatePlayersGrid();
  showActionButton("지목하기");
}

function showVotingUI(executorName) {
  showActionArea();
  document.getElementById("actionTitle").textContent = "집행자 승인 투표";
  document.getElementById(
    "actionDescription"
  ).textContent = `${executorName}을(를) 집행자로 승인하시겠습니까?`;
  hidePlayersGrid();
  hideActionButton();
  showVoteButtons();
}

function showCardSelectionUI(description, cards) {
  showActionArea();
  document.getElementById("actionTitle").textContent = "카드 선택";
  document.getElementById("actionDescription").textContent = description;
  hidePlayersGrid();
  hideVoteButtons();
  showCardSelection(cards);
  showActionButton("카드 제거");
}

function showKillUI() {
  showActionArea();
  document.getElementById("actionTitle").textContent = "플레이어 제거";
  document.getElementById("actionDescription").textContent =
    "제거할 플레이어를 선택하세요.";
  updatePlayersGrid();
  showActionButton("제거하기");
}

function showGodGuessingUI(data) {
  const myRole = gameState.myRole;
  const isDemon = myRole === "lucifer" || myRole === "demon";

  if (isDemon) {
    showActionArea();
    document.getElementById("actionTitle").textContent = "신 지목";
    document.getElementById("actionDescription").textContent =
      "신이라고 생각하는 플레이어를 선택하세요. (악마팀만 투표 가능)";
    updatePlayersGrid();
    showActionButton("신 지목하기");
  } else {
    addChatMessage("🔮 악마팀이 신을 찾고 있습니다...", "system");
  }
}

function showActionArea() {
  document.getElementById("actionArea").classList.remove("hidden");
}

function hideActionArea() {
  document.getElementById("actionArea").classList.add("hidden");
  document.getElementById("playersGrid").innerHTML = "";

  const cardSelection = document.getElementById("cardSelection");
  cardSelection.classList.add("hidden");
  cardSelection.innerHTML = "";

  document.getElementById("actionButton").classList.add("hidden");
  document.getElementById("approveButton").classList.add("hidden");
  document.getElementById("rejectButton").classList.add("hidden");

  gameState.selectedPlayer = null;
  gameState.selectedCard = null;
}

function updatePlayersGrid() {
  const grid = document.getElementById("playersGrid");
  grid.innerHTML = "";

  gameState.players.forEach((player) => {
    const playerCard = document.createElement("div");
    playerCard.className = "player-card";
    if (!player.alive) playerCard.classList.add("dead");

    const isMyself = player.id === socket.id;
    const isNominationPhase = gameState.phase === "nomination";

    if (isMyself && isNominationPhase) {
      playerCard.style.opacity = "0.5";
      playerCard.style.pointerEvents = "none";
      playerCard.style.background = "rgba(128, 128, 128, 0.3)";
      playerCard.innerHTML = `
        <div style="font-weight: bold;">${player.name}</div>
        <div style="font-size: 0.8em; opacity: 0.7;">본인 (선택 불가)</div>
      `;
    } else {
      playerCard.onclick = () => selectPlayer(player.id);
      playerCard.innerHTML = `
        <div style="font-weight: bold;">${player.name}</div>
        <div style="font-size: 0.8em; opacity: 0.7;">${
          player.alive ? "생존" : "사망"
        }</div>
      `;
    }

    grid.appendChild(playerCard);
  });
}

function hidePlayersGrid() {
  document.getElementById("playersGrid").innerHTML = "";
}

function showCardSelection(cards) {
  const cardSelection = document.getElementById("cardSelection");
  cardSelection.classList.remove("hidden");
  cardSelection.innerHTML = "";

  cards.forEach((cardType, index) => {
    const card = document.createElement("div");
    card.className = `card card-${cardType}`;
    card.onclick = () => selectCard(index);
    card.innerHTML = cardType === "good" ? "✨" : "💀";
    cardSelection.appendChild(card);
  });
}

function selectPlayer(playerId) {
  document.querySelectorAll(".player-card").forEach((card) => {
    card.classList.remove("selected");
  });

  event.target.closest(".player-card").classList.add("selected");
  gameState.selectedPlayer = playerId;
  document.getElementById("actionButton").disabled = false;
}

function selectCard(cardIndex) {
  document.querySelectorAll(".card").forEach((card) => {
    card.style.border = card.classList.contains("card-good")
      ? "2px solid #ffd700"
      : "2px solid #ff4757";
  });

  event.target.style.border = "4px solid #00ff00";
  gameState.selectedCard = cardIndex;
  document.getElementById("actionButton").disabled = false;
}

function showActionButton(text) {
  const btn = document.getElementById("actionButton");
  btn.classList.remove("hidden");
  btn.textContent = text;
  btn.disabled = true;
}

function hideActionButton() {
  document.getElementById("actionButton").classList.add("hidden");
}

function showVoteButtons() {
  document.getElementById("approveButton").classList.remove("hidden");
  document.getElementById("rejectButton").classList.remove("hidden");
}

function hideVoteButtons() {
  document.getElementById("approveButton").classList.add("hidden");
  document.getElementById("rejectButton").classList.add("hidden");
}

// 액션 실행 함수들
function performAction() {
  switch (gameState.phase) {
    case "nomination":
      if (gameState.selectedPlayer) {
        socket.emit("nominate", gameState.selectedPlayer);
        hideActionArea();
      }
      break;
    case "cardSelection":
      if (gameState.selectedCard !== null) {
        socket.emit("selectCard", gameState.selectedCard);
        hideActionArea();
      }
      break;
    case "kill":
      if (gameState.selectedPlayer) {
        socket.emit("kill", gameState.selectedPlayer);
        hideActionArea();
      }
      break;
    case "godGuess":
      if (gameState.selectedPlayer) {
        socket.emit("guessGod", gameState.selectedPlayer);
        hideActionArea();
      }
      break;
  }
}

function vote(approve) {
  socket.emit("vote", approve);
  hideVoteButtons();
  const voteText = approve ? "찬성" : "반대";

  // 투표 결과를 즉시 표시하고 스크롤
  addSystemMessage(`✅ 당신이 ${voteText}표를 던졌습니다.`);
}

// 게임 결과 표시
function displayGameResult(data) {
  const winner = data.winner === "angel" ? "천사팀" : "악마팀";
  const winnerIcon = data.winner === "angel" ? "✨" : "💀";

  const announcement = document.getElementById("winnerAnnouncement");
  announcement.textContent = `${winnerIcon} ${winner} 승리! ${winnerIcon}`;
  announcement.className = `winner-announcement winner-${data.winner}`;

  document.getElementById("resultReason").textContent = data.reason;

  document.getElementById("statRounds").textContent =
    data.gameStats.totalRounds;
  document.getElementById("statGoodDeeds").textContent =
    data.gameStats.goodDeeds;
  document.getElementById("statEvilDeeds").textContent =
    data.gameStats.evilDeeds;
  document.getElementById("statKilled").textContent =
    data.gameStats.playersKilled;

  const rolesList = document.getElementById("playerRolesList");
  rolesList.innerHTML = "";

  data.playerRoles.forEach((player) => {
    const roleItem = document.createElement("div");
    const roleInfo = ROLE_INFO[player.role];
    roleItem.className = `role-item ${roleInfo.team} ${
      player.alive ? "" : "dead"
    }`;
    roleItem.innerHTML = `
      <div>
        <div class="player-name">${player.name}</div>
        <div class="player-status">${player.alive ? "생존" : "사망"}</div>
      </div>
      <div class="player-role">${roleInfo.name}</div>
    `;
    rolesList.appendChild(roleItem);
  });

  showGameResult();
}

// 채팅 함수들
function sendMessage() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();

  if (message && socket) {
    socket.emit("chatMessage", message);
    input.value = "";

    // 메시지 전송 시 자동 스크롤 보장
    isAutoScrollEnabled = true;
    forceScrollToBottom = true;
    setTimeout(() => {
      forceChatScrollToBottom();
    }, 50);
  }
}

// 이벤트 리스너 등록
function setupEventListeners() {
  // 엔터 키 이벤트
  document
    .getElementById("chatInput")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault(); // 기본 동작 방지
        sendMessage();
      }
    });

  document
    .getElementById("roomCodeInput")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") joinRoomByCode();
    });

  document
    .getElementById("hostName")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") createRoom();
    });

  document
    .getElementById("playerName")
    .addEventListener("keypress", function (e) {
      if (e.key === "Enter") joinRoomByCode();
    });

  // 방 코드 자동 대문자 변환
  document
    .getElementById("roomCodeInput")
    .addEventListener("input", function (e) {
      e.target.value = e.target.value.toUpperCase();
    });
}

// 페이지 로드 시 초기화 - 더 확실한 방법
window.addEventListener("load", function () {
  console.log("Window load 이벤트 발생");
  showMainMenu();
  setupEventListeners();
});

// DOM이 준비되면 바로 초기화
document.addEventListener("DOMContentLoaded", function () {
  console.log("DOMContentLoaded 이벤트 발생");
  showMainMenu();
  setupEventListeners();
});

// 추가 안전장치: 일정 시간 후 다시 시도
setTimeout(() => {
  console.log("Timeout 백업 초기화 실행");
  if (document.readyState === "complete") {
    setupEventListeners();
  }
}, 1000);
