const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const db = new sqlite3.Database("./fantasy.db");

db.serialize(() => {
  db.run(`
  CREATE TABLE IF NOT EXISTS stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER,
    player_id INTEGER,
    runs INTEGER,
    wickets INTEGER,
    catches INTEGER,
    runouts INTEGER
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team1 TEXT,
      team2 TEXT,
      date TEXT
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT
  )
`);

  db.run(`
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    team TEXT,
    role TEXT,
    is_overseas INTEGER
  )
`);

  db.run(`
  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    match_id INTEGER,
    player_id INTEGER,
    role TEXT
  )
`);
});

// Initialize sample data
app.get("/init", (req, res) => {
 // Clear old data
  db.run("DELETE FROM players");
  db.run("DELETE FROM matches");

  const players = [
  // MI
  ["Rohit Sharma", "MI", "batsman", 0],
  ["Jasprit Bumrah", "MI", "bowler", 0],
  ["Hardik Pandya", "MI", "allrounder", 0],
  ["Ishan Kishan", "MI", "wicketkeeper", 0],
  ["Tim David", "MI", "batsman", 1],
  ["Suryakumar Yadav", "MI", "batsman", 0],
  ["Gerald Coetzee", "MI", "bowler", 1],

  // CSK
  ["MS Dhoni", "CSK", "wicketkeeper", 0],
  ["Ruturaj Gaikwad", "CSK", "batsman", 0],
  ["Ravindra Jadeja", "CSK", "allrounder", 0],
  ["Deepak Chahar", "CSK", "bowler", 0],
  ["Pathirana", "CSK", "bowler", 1],
  ["Shivam Dube", "CSK", "allrounder", 0],
  ["Devon Conway", "CSK", "batsman", 1],

  // RCB
  ["Virat Kohli", "RCB", "batsman", 0],
  ["Faf du Plessis", "RCB", "batsman", 1],
  ["Glenn Maxwell", "RCB", "allrounder", 1],
  ["Mohammed Siraj", "RCB", "bowler", 0],
  ["Dinesh Karthik", "RCB", "wicketkeeper", 0],

  // KKR
  ["Shreyas Iyer", "KKR", "batsman", 0],
  ["Andre Russell", "KKR", "allrounder", 1],
  ["Sunil Narine", "KKR", "allrounder", 1],
  ["Varun Chakravarthy", "KKR", "bowler", 0],
  ["Phil Salt", "KKR", "wicketkeeper", 1],

  // SRH
  ["Pat Cummins", "SRH", "bowler", 1],
  ["Abhishek Sharma", "SRH", "allrounder", 0],
  ["Rahul Tripathi", "SRH", "batsman", 0],
  ["Heinrich Klaasen", "SRH", "wicketkeeper", 1],

  // DC
  ["Rishabh Pant", "DC", "wicketkeeper", 0],
  ["David Warner", "DC", "batsman", 1],
  ["Axar Patel", "DC", "allrounder", 0],
  ["Kuldeep Yadav", "DC", "bowler", 0]
];

  players.forEach(p => {
    db.run(
      "INSERT INTO players (name, team, role, is_overseas) VALUES (?, ?, ?, ?)",
      p
    );
  });

  const matches = [
  ["MI", "CSK", "2026-04-01"],
  ["RCB", "KKR", "2026-04-02"],
  ["SRH", "DC", "2026-04-03"]
];

matches.forEach(m => {
  db.run(
    "INSERT INTO matches (team1, team2, date) VALUES (?, ?, ?)",
    m
  );
});

  res.send("Initialized!");
});

// Get matches
app.get("/matches", (req, res) => {
  db.all("SELECT * FROM matches", [], (err, rows) => {
    res.json(rows);
  });
});

// Get players for a match
app.get("/players/:matchId", (req, res) => {
  const matchId = req.params.matchId;

  db.get("SELECT * FROM matches WHERE id = ?", [matchId], (err, match) => {
    if (!match) return res.send("Match not found");

    db.all(
      "SELECT * FROM players WHERE team = ? OR team = ?",
      [match.team1, match.team2],
      (err, players) => {
        res.json(players);
      }
    );
  });
});

app.post("/signup", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    (err, user) => {
      if (user) return res.send("Username already exists");

      db.run(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username, password],
        function () {
          res.send("User created");
        }
      );
    }
  );
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username = ? AND password = ?",
    [username, password],
    (err, user) => {
      if (!user) return res.send("Invalid credentials");

      res.json(user);
    }
  );
});

function validateTeam(players) {
  if (players.length !== 11) return "Select exactly 11 players";

  let teamCount = {};
  let overseas = 0;
  let wicketkeepers = 0;
  let bowlers = 0;

  players.forEach(p => {
    teamCount[p.team] = (teamCount[p.team] || 0) + 1;

    if (p.is_overseas) overseas++;
    if (p.role === "wicketkeeper") wicketkeepers++;
    if (p.role === "bowler") bowlers++;
  });

  if (Object.values(teamCount).some(c => c > 6))
    return "Max 6 players per team";

  if (overseas > 4) return "Max 4 overseas players";

  if (wicketkeepers < 1) return "At least 1 wicketkeeper required";

  if (bowlers < 3) return "Minimum 3 bowlers required";

  return null;
}

app.post("/save-team", (req, res) => {
  const { user_id, match_id, players } = req.body;

  const error = validateTeam(players);
  if (error) return res.send(error);

  // ❗ Check if user already submitted team
  db.get(
    "SELECT * FROM teams WHERE user_id = ? AND match_id = ?",
    [user_id, match_id],
    (err, existing) => {

      if (existing) {
        return res.send("Team already submitted for this match!");
      }

      players.forEach(p => {
        db.run(
          "INSERT INTO teams (user_id, match_id, player_id, role) VALUES (?, ?, ?, ?)",
          [user_id, match_id, p.id, p.selectedRole]
        );
      });

      res.send("Team saved!");
    }
  );
});

function calculatePoints(player) {
  let points = 0;

  points += player.runs || 0;
  points += (player.wickets || 0) * 10;
  points += (player.catches || 0) * 5;
  points += (player.runouts || 0) * 5;

  if (player.runs >= 100) points += 30;
  else if (player.runs >= 50) points += 10;

  if (player.wickets >= 5) points += 30;
  else if (player.wickets >= 3) points += 10;

  return points;
}


app.get("/leaderboard/:matchId", (req, res) => {
  const matchId = req.params.matchId;

  db.all(`
    SELECT u.username, t.role,
           s.runs, s.wickets, s.catches, s.runouts
    FROM teams t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN stats s 
      ON t.player_id = s.player_id 
      AND t.match_id = s.match_id
    WHERE t.match_id = ?
  `, [matchId], (err, rows) => {

    if (err) {
      console.error(err);
      return res.send("Database error");
    }

    let scores = {};

    rows.forEach(r => {
      let pts = calculatePoints(r);

      if (r.role === "captain") pts *= 2;
      if (r.role === "vice") pts *= 1.5;

      scores[r.username] = (scores[r.username] || 0) + pts;
    });

    const leaderboard = Object.entries(scores)
      .map(([user, pts]) => ({ user, pts }))
      .sort((a, b) => b.pts - a.pts);

    res.json(leaderboard);
  });
});

app.get("/check-team/:userId/:matchId", (req, res) => {
  const { userId, matchId } = req.params;

  db.get(
    "SELECT * FROM teams WHERE user_id = ? AND match_id = ?",
    [userId, matchId],
    (err, row) => {
      res.json({ exists: !!row });
    }
  );
});

app.listen(3000, () => console.log("Server running on port 3000"));