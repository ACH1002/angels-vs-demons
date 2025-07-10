const ROLES = {
  god: { name: "신", team: "angel" },
  archangel: { name: "대천사", team: "angel" },
  angel: { name: "천사", team: "angel" },
  lucifer: { name: "루시퍼", team: "demon" },
  demon: { name: "악마", team: "demon" },
};

const GAME_CONFIG = {
  MAX_PLAYERS: 10,
  TIMER_NOMINATION: 600, // 10분 = 600초로 변경
  TIMER_VOTING: 120,
  TIMER_CARD_SELECTION: 120,
  TIMER_KILL: 60,
  TIMER_GOD_GUESS: 120,
  WIN_CONDITION_GOOD: 5,
  WIN_CONDITION_EVIL: 5,
  EVIL_KILL_THRESHOLD: 4,
};

const CARD_DECK = {
  GOOD_CARDS: 10,
  EVIL_CARDS: 20,
  DRAW_COUNT: 3,
};

// 라운드 상태 정의 추가
const ROUND_STATUS = {
  PENDING: "pending", // 대기중
  NOMINATING: "nominating", // 지목중
  VOTING: "voting", // 투표중
  APPROVED: "approved", // 승인됨
  REJECTED: "rejected", // 거절됨
  COMPLETED: "completed", // 완료됨
};

module.exports = {
  ROLES,
  GAME_CONFIG,
  CARD_DECK,
  ROUND_STATUS,
};
