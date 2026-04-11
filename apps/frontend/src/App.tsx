import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Team = "NONE" | "RED" | "BLUE";
type Role = "SPYMASTER" | "OPERATOR";
type GameStatus = "ACTIVE" | "FINISHED";
type SessionStatus = "LOBBY" | "ACTIVE" | "TERMINATED";
type TurnPhase = "HINT" | "GUESS" | "COMPLETE";
type Identity = "NONE" | "RED" | "BLUE" | "NEUTRAL" | "KILLER";

type Player = {
  username: string;
  team: Team;
  role: Role;
  isHost: boolean;
};

type Card = {
  word: string;
  identity: Identity;
  isRevealed: boolean;
};

type Grid = {
  cards: Card[];
};

type Game = {
  activeTeam: Team;
  status: GameStatus;
  grid: Grid;
  turns: Array<{
    phase: TurnPhase;
    hint?: {
      word?: string;
      count?: number;
    } | null;
  }>;
};

type SessionData = {
  roomCode: string;
  status: SessionStatus;
  players: Player[];
  game: Game | null;
};

type Notification = {
  winner: Team;
  reason: string;
};

type WireMessage = {
  eventType: string;
  payload: unknown;
};

type HintState = {
  hintWord: string;
  hintCount: number;
  by: string;
} | null;

type NoticeTone = "info" | "success" | "warning";

type Notice = {
  id: number;
  message: string;
  tone: NoticeTone;
};

type TeamSummary = {
  spymasters: number;
  operators: number;
};

const WS_URL =
  typeof window === "undefined"
    ? "ws://127.0.0.1:3000/ws"
    : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`;

const normalizeRoomCode = (value: string): string => value.trim().toUpperCase();
const SESSION_STORAGE_KEY = "codenames.session";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isSessionData = (value: unknown): value is SessionData =>
  isRecord(value) && typeof value.roomCode === "string" && Array.isArray(value.players);

const hasSessionData = (
  value: unknown,
): value is { sessionData: SessionData; roomCode?: string } =>
  isRecord(value) && isSessionData(value.sessionData);

const emptyTeamSummary = (): TeamSummary => ({
  spymasters: 0,
  operators: 0,
});

const buildTeamSummary = (players: Player[], team: Team): TeamSummary =>
  players.reduce((summary, player) => {
    if (player.team !== team) {
      return summary;
    }

    if (player.role === "SPYMASTER") {
      summary.spymasters += 1;
    } else {
      summary.operators += 1;
    }

    return summary;
  }, emptyTeamSummary());

function App() {
  const [socketState, setSocketState] = useState<"connecting" | "connected" | "disconnected">(
    "connecting",
  );
  const [username, setUsername] = useState("");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<Team>("RED");
  const [selectedRole, setSelectedRole] = useState<Role>("OPERATOR");
  const [hintWordInput, setHintWordInput] = useState("ocean");
  const [hintCountInput, setHintCountInput] = useState(2);
  const [showNotices, setShowNotices] = useState(false);
  const [session, setSession] = useState<SessionData | null>(null);
  const [result, setResult] = useState<Notification | null>(null);
  const [lastHint, setLastHint] = useState<HintState>(null);
  const [notices, setNotices] = useState<Notice[]>([]);

  const socketRef = useRef<WebSocket | null>(null);
  const noticeIdRef = useRef(0);

  const currentPlayer = useMemo(() => {
    if (!session || username.trim().length === 0) {
      return null;
    }

    return (
      session.players.find(
        (player) => player.username.toLowerCase() === username.trim().toLowerCase(),
      ) ?? null
    );
  }, [session, username]);

  const currentRoomCode = session?.roomCode ?? normalizeRoomCode(roomCodeInput);
  const isHost = currentPlayer?.isHost === true;
  const isInLobby = session?.status === "LOBBY";
  const isInGame = session?.status === "ACTIVE" && !!session.game;
  const currentTurn = session?.game?.turns.at(-1) ?? null;
  const turnPhase = currentTurn?.phase ?? "HINT";
  const canSeeIdentities = currentPlayer?.role === "SPYMASTER";
  const isCurrentTeamTurn =
    !!session?.game &&
    currentPlayer !== null &&
    currentPlayer.team === session.game.activeTeam;

  const redSummary = useMemo(
    () => buildTeamSummary(session?.players ?? [], "RED"),
    [session?.players],
  );
  const blueSummary = useMemo(
    () => buildTeamSummary(session?.players ?? [], "BLUE"),
    [session?.players],
  );

  const lobbyReady =
    isInLobby &&
    redSummary.spymasters === 1 &&
    blueSummary.spymasters === 1 &&
    redSummary.operators >= 1 &&
    blueSummary.operators >= 1;

  const canSubmitHint =
    isInGame &&
    currentPlayer?.role === "SPYMASTER" &&
    isCurrentTeamTurn &&
    turnPhase === "HINT";

  const canGuess =
    isInGame &&
    currentPlayer?.role === "OPERATOR" &&
    isCurrentTeamTurn &&
    turnPhase === "GUESS";

  const addNotice = (message: string, tone: NoticeTone = "info"): void => {
    noticeIdRef.current += 1;
    setNotices((current) => [{ id: noticeIdRef.current, message, tone }, ...current].slice(0, 6));
  };

  const resetToHome = (): void => {
    setSession(null);
    setLastHint(null);
    setResult(null);
    setRoomCodeInput("");
    setSelectedTeam("RED");
    setSelectedRole("OPERATOR");

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  };

  const sendAction = (action: string, payload: Record<string, unknown>): void => {
    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      addNotice("You are offline right now. Reconnect before sending actions.", "warning");
      return;
    }

    socket.send(JSON.stringify({ action, ...payload }));
  };

  const applySessionData = (payload: unknown): void => {
    if (!isSessionData(payload)) {
      return;
    }

    setSession(payload);

    const activeTurn = payload.game?.turns.at(-1);
    const turnHint = activeTurn?.hint;

    if (turnHint && typeof turnHint.word === "string" && typeof turnHint.count === "number") {
      const activePlayer =
        payload.players.find((player) => player.team === payload.game?.activeTeam && player.role === "SPYMASTER") ??
        null;

      setLastHint({
        hintWord: turnHint.word,
        hintCount: turnHint.count,
        by: activePlayer?.username ?? "Spymaster",
      });
    } else if (payload.status !== "ACTIVE") {
      setLastHint(null);
    }

    if (payload.status === "TERMINATED") {
      setSession(null);
      setLastHint(null);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const saved = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as {
        username?: string;
        roomCode?: string;
        selectedTeam?: Team;
        selectedRole?: Role;
      };

      if (typeof parsed.username === "string") {
        setUsername(parsed.username);
      }

      if (typeof parsed.roomCode === "string") {
        setRoomCodeInput(normalizeRoomCode(parsed.roomCode));
      }

      if (parsed.selectedTeam === "RED" || parsed.selectedTeam === "BLUE") {
        setSelectedTeam(parsed.selectedTeam);
      }

      if (parsed.selectedRole === "SPYMASTER" || parsed.selectedRole === "OPERATOR") {
        setSelectedRole(parsed.selectedRole);
      }
    } catch {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const normalizedRoomCode = normalizeRoomCode(roomCodeInput);

    if (username.trim().length === 0 && normalizedRoomCode.length === 0) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        username: username.trim(),
        roomCode: normalizedRoomCode,
        selectedTeam,
        selectedRole,
      }),
    );
  }, [roomCodeInput, selectedRole, selectedTeam, username]);

  const handleSocketMessage = (wire: WireMessage): void => {
    switch (wire.eventType) {
      case "actionResult":
        if (hasSessionData(wire.payload)) {
          applySessionData(wire.payload.sessionData);

          if (typeof wire.payload.roomCode === "string") {
            setRoomCodeInput(normalizeRoomCode(wire.payload.roomCode));
          }

          const sessionData = wire.payload.sessionData;
          const isCreator = sessionData.players.some(
            (player) =>
              player.username.toLowerCase() === username.trim().toLowerCase() && player.isHost,
          );

          addNotice(
            isCreator
              ? `Room ${sessionData.roomCode} is ready. Share the code and start assigning teams.`
              : `You joined room ${sessionData.roomCode}. Pick a team and role to continue.`,
            "success",
          );
        }
        return;
      case "sessionInitialized":
        addNotice("A new room is live.", "success");
        applySessionData(wire.payload);
        return;
      case "playerJoined":
        if (isSessionData(wire.payload)) {
          const latestPlayer = wire.payload.players.at(-1);
          addNotice(
            latestPlayer ? `${latestPlayer.username} joined the room.` : "A player joined the room.",
            "info",
          );
        }
        applySessionData(wire.payload);
        return;
      case "playerRoleSelected":
        addNotice("Team and role assignments were updated.", "info");
        applySessionData(wire.payload);
        return;
      case "gameInitialized":
        addNotice("The game has started. Spymasters can review the board now.", "success");
        applySessionData(wire.payload);
        return;
      case "sessionUpdated":
        applySessionData(wire.payload);
        return;
      case "hintSubmitted":
        if (isRecord(wire.payload)) {
          const hintWord = wire.payload.hintWord;
          const hintCount = wire.payload.hintCount;
          const by = wire.payload.username;

          if (
            typeof hintWord === "string" &&
            typeof hintCount === "number" &&
            typeof by === "string"
          ) {
            setLastHint({ hintWord, hintCount, by });
            addNotice(`${by} submitted the clue "${hintWord}" for ${hintCount}.`, "info");
          }
        }
        return;
      case "gameFinished":
        if (isRecord(wire.payload)) {
          const winner = wire.payload.winner;
          const reason = wire.payload.reason;

          if ((winner === "RED" || winner === "BLUE") && typeof reason === "string") {
            setResult({ winner, reason });
            addNotice(`${winner} team wins. ${reason}`, "success");
          }
        }
        return;
      case "sessionTerminated":
        addNotice("This room has ended. You can start or join a new one anytime.", "info");
        setSession(null);
        setLastHint(null);
        setRoomCodeInput("");
        return;
      case "error":
        if (isRecord(wire.payload) && typeof wire.payload.message === "string") {
          addNotice(wire.payload.message, "warning");
        }
        return;
      default:
        return;
    }
  };

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setSocketState("connected");
      addNotice("Connected. You can create or join a room now.", "success");
    };

    socket.onmessage = (event) => {
      try {
        const wire = JSON.parse(event.data) as WireMessage;
        handleSocketMessage(wire);
      } catch {
        addNotice("We received an unreadable server message.", "warning");
      }
    };

    socket.onclose = () => {
      setSocketState("disconnected");
      addNotice("Connection lost. Refresh or reconnect the app to continue.", "warning");
    };

    socket.onerror = () => {
      addNotice("There was a connection problem.", "warning");
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (socketState !== "connected" || session !== null) {
      return;
    }

    const normalizedRoomCode = normalizeRoomCode(roomCodeInput);

    if (username.trim().length === 0 || normalizedRoomCode.length === 0) {
      return;
    }

    sendAction("resumeSession", {
      roomCode: normalizedRoomCode,
      username: username.trim(),
    });
  }, [roomCodeInput, session, socketState, username]);

  return (
    <div className="appShell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="masthead">
        <div className="masthead-copy">
          <div className="topline">
            <p className="kicker">Codenames Online</p>
            <div className="identityStrip">
              <span className="identityChip">{username.trim() || "No name"}</span>
              <span className="identityChip">{currentPlayer?.team ?? "No team"}</span>
              <span className="identityChip">{currentPlayer?.role ?? "No role"}</span>
            </div>
          </div>
        </div>

        <div className="statusRail">
          <div className={`socketBadge socket-${socketState}`}>{socketState}</div>
          <div className="statusCard">
            <span className="statusLabel">Current room</span>
            <strong>{currentRoomCode || "Not joined"}</strong>
          </div>
          <div className="statusCard">
            <span className="statusLabel">Identity</span>
            <strong>{username.trim() || "Unnamed agent"}</strong>
          </div>
          {notices.length > 0 && (
            <button
              className="ghostAction statusToggle"
              onClick={() => setShowNotices((current) => !current)}
            >
              {showNotices ? "Hide updates" : `Show updates (${notices.length})`}
            </button>
          )}
        </div>
      </header>

      {!session && (
        <section className="homeGrid">
          <article className="panel heroPanel">
            <div className="sectionHeading">
              <p>Start here</p>
              <h2>Create a room or join with a code.</h2>
            </div>

            <div className="fieldCluster">
              <label>
                Temporary username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Choose a name for this session"
                />
              </label>

              <label>
                Room code
                <input
                  value={roomCodeInput}
                  onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
                  placeholder="ABCDEF"
                />
              </label>
            </div>

            <div className="buttonStrip">
              <button
                className="primaryAction"
                onClick={() => sendAction("initializeSession", { username })}
                disabled={socketState !== "connected" || username.trim().length === 0}
              >
                Create Session
              </button>

              <button
                className="secondaryAction"
                onClick={() =>
                  sendAction("joinSession", {
                    roomCode: normalizeRoomCode(roomCodeInput),
                    username,
                  })
                }
                disabled={
                  socketState !== "connected" ||
                  username.trim().length === 0 ||
                  normalizeRoomCode(roomCodeInput).length === 0
                }
              >
                Join Existing Room
              </button>
            </div>
          </article>
        </section>
      )}

      {isInLobby && session && (
        <section className="panel lobbyPanel">
          <div className="lobbyTopline">
            <div className="sectionHeading">
              <p>Lobby</p>
              <h2>Room {session.roomCode}</h2>
            </div>

            <div className={`readinessBadge ${lobbyReady ? "ready" : "waiting"}`}>
              {lobbyReady ? "Ready to launch" : "Waiting on role coverage"}
            </div>
          </div>

          <div className="lobbyGrid">
            <div className="teamColumn team-red">
              <div className="teamHeader">
                <span className="teamPill">Red Team</span>
                <strong>
                  {redSummary.spymasters}/1 spymaster · {redSummary.operators}+ operators
                </strong>
              </div>

              <ul className="roster">
                {session.players
                  .filter((player) => player.team === "RED")
                  .map((player) => (
                    <li key={player.username}>
                      <strong>{player.username}</strong>
                      <span>{player.role}</span>
                      <span>{player.isHost ? "Host" : "Player"}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="teamColumn team-blue">
              <div className="teamHeader">
                <span className="teamPill">Blue Team</span>
                <strong>
                  {blueSummary.spymasters}/1 spymaster · {blueSummary.operators}+ operators
                </strong>
              </div>

              <ul className="roster">
                {session.players
                  .filter((player) => player.team === "BLUE")
                  .map((player) => (
                    <li key={player.username}>
                      <strong>{player.username}</strong>
                      <span>{player.role}</span>
                      <span>{player.isHost ? "Host" : "Player"}</span>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="lobbyControlPanel">
              <div className="sectionHeading compact">
                <p>Your assignment</p>
                <h3>{currentPlayer ? currentPlayer.username : "Choose your seat"}</h3>
              </div>

              <label>
                Team
                <select
                  value={selectedTeam}
                  onChange={(event) => setSelectedTeam(event.target.value as Team)}
                >
                  <option value="RED">RED</option>
                  <option value="BLUE">BLUE</option>
                </select>
              </label>

              <label>
                Role
                <select
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value as Role)}
                >
                  <option value="SPYMASTER">SPYMASTER</option>
                  <option value="OPERATOR">OPERATOR</option>
                </select>
              </label>

              <button
                className="primaryAction"
                onClick={() =>
                  sendAction("selectPlayerRole", {
                    roomCode: session.roomCode,
                    username,
                    team: selectedTeam,
                    role: selectedRole,
                  })
                }
                disabled={socketState !== "connected"}
              >
                Confirm Assignment
              </button>

              <button
                className="launchAction"
                onClick={() =>
                  sendAction("initializeGame", {
                    roomCode: session.roomCode,
                    hostUsername: username,
                  })
                }
                disabled={socketState !== "connected" || !isHost || !lobbyReady}
              >
                {isHost ? "Launch Game" : "Waiting for host"}
              </button>
            </div>
          </div>
        </section>
      )}

      {isInGame && session && session.game && (
        <section className="gameLayout">
          <aside className="panel commandPanel">
            <div className="sectionHeading compact">
              <p>Turn status</p>
              <h2>{session.game.activeTeam} team is up</h2>
            </div>

            <div className="statusStack">
              <div className="statusBlock">
                <span className="statusLabel">Your role</span>
                <strong>{currentPlayer?.role ?? "Unassigned"}</strong>
              </div>
              <div className="statusBlock">
                <span className="statusLabel">Turn phase</span>
                <strong>{turnPhase}</strong>
              </div>
              <div className="statusBlock">
                <span className="statusLabel">Visibility</span>
                <strong>{canSeeIdentities ? "Full board view" : "Revealed cards only"}</strong>
              </div>
            </div>

            <div className="hintPanel">
              <div className="sectionHeading compact">
                <p>Latest clue</p>
                <h3>{lastHint ? lastHint.hintWord : "Waiting for a hint"}</h3>
              </div>
              <p className="hintMeta">
                {lastHint
                  ? `${lastHint.by} linked ${lastHint.hintCount} word${lastHint.hintCount === 1 ? "" : "s"}`
                  : "The active Spymaster must submit a one-word clue and a count."}
              </p>
            </div>

            <div className="controlCard">
              <div className="sectionHeading compact">
                <p>Next action</p>
                <h3>{canSubmitHint ? "Submit a clue" : canGuess ? "Choose a card" : "Wait for your turn"}</h3>
              </div>

              <label>
                Hint word
                <input
                  value={hintWordInput}
                  onChange={(event) => setHintWordInput(event.target.value)}
                />
              </label>

              <label>
                Hint count
                <input
                  type="number"
                  min={0}
                  value={hintCountInput}
                  onChange={(event) => setHintCountInput(Number(event.target.value))}
                />
              </label>

              <div className="buttonStack">
                <button
                  className="primaryAction"
                  onClick={() =>
                    sendAction("submitHint", {
                      roomCode: session.roomCode,
                      username,
                      hintWord: hintWordInput,
                      hintCount: hintCountInput,
                    })
                  }
                  disabled={!canSubmitHint}
                >
                  Submit Hint
                </button>

                <button
                  className="secondaryAction"
                  onClick={() => sendAction("endTurn", { roomCode: session.roomCode, username })}
                  disabled={!canGuess}
                >
                  End Turn
                </button>

                <button
                  className="dangerAction"
                  onClick={() =>
                    sendAction("terminateSession", {
                      roomCode: session.roomCode,
                      hostUsername: username,
                    })
                  }
                  disabled={!isHost}
                >
                  Terminate Session
                </button>
              </div>
            </div>
          </aside>

          <section className="panel boardPanel">
            <div className="sectionHeading boardHeading">
              <p>Word grid</p>
              <h2>Choose carefully. One wrong reveal flips the entire round.</h2>
            </div>

            <div className="board">
              {session.game.grid.cards.map((card, index) => {
                const visibleIdentity = card.isRevealed || canSeeIdentities;
                const identityLabel = visibleIdentity ? card.identity : "";
                const cardClass = [
                  "tile",
                  card.isRevealed ? "is-revealed" : "",
                  visibleIdentity ? `identity-${card.identity.toLowerCase()}` : "identity-hidden",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <button
                    key={`${card.word}-${index}`}
                    className={cardClass}
                    onClick={() =>
                      sendAction("selectWord", {
                        roomCode: session.roomCode,
                        username,
                        cardIndex: index,
                      })
                    }
                    disabled={!canGuess || card.isRevealed}
                  >
                    <span className="tileWord">{card.word}</span>
                    <span className="tileMeta">{identityLabel || "Hidden identity"}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </section>
      )}

      {result && (
        <section className="panel resultPanel">
          <div className="sectionHeading">
            <p>Match complete</p>
            <h2>{result.winner} team wins the session.</h2>
          </div>
          <p className="resultReason">{result.reason}</p>
          <button className="primaryAction" onClick={resetToHome}>
            Return to Home
          </button>
        </section>
      )}

      {notices.length > 0 && showNotices && (
        <aside className="panel noticesPanel">
          <div className="sectionHeading compact">
            <p>Important updates</p>
            <h3>Only game-critical messages show up here.</h3>
          </div>
          <ul className="noticeList">
            {notices.map((notice) => (
              <li key={notice.id} className={`noticeItem notice-${notice.tone}`}>
                {notice.message}
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}

export default App;
