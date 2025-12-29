require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const session = require('express-session'); 

// On récupère db ET query proprement depuis ton dossier models
const { db, query } = require('./models/db'); 

const app = express();
const port = process.env.PORT || 3000;




// --- CONFIGURATION SESSION ---
app.use(session({
    secret: 'footdubourg-2025!', // Change ceci pour plus de sécurité
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // Session de 24h
}));

// Middleware
app.use(bodyParser.json({ limit: '5mb' }));
app.use(express.static(__dirname));

// --- MIDDLEWARE DE PROTECTION ADMIN ---
const verifierAdmin = (req, res, next) => {
    if (req.session.user && req.session.user.role === 'admin') {
        next(); // C'est Admin1 ou Admin2, on laisse passer
    } else {
        res.status(403).json({ success: false, message: "Accès interdit : Réservé aux administrateurs." });
    }
};

// Logging
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.path);
  next();
});


/* ------------------ Helpers: buteurs (view/table) detection & fallback table ------------------ */

let _buteursIsView = undefined;
async function isButeursView() {
  if (typeof _buteursIsView !== 'undefined') return _buteursIsView;
  try {
    const rows = await query("SELECT TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buteurs' LIMIT 1");
    _buteursIsView = (rows && rows[0] && rows[0].TABLE_TYPE === 'VIEW') ? true : false;
  } catch (e) {
    _buteursIsView = false;
  }
  return _buteursIsView;
}

// ensure a physical table buteurs_real exists for writes if original buteurs is a VIEW
async function ensureButuersReal() {
  // create table if not exists
  await query(`
    CREATE TABLE IF NOT EXISTS buteurs_real (
      Id_buteur INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      Id_joueur INT NULL,
      nom VARCHAR(100) NULL,
      prenom VARCHAR(100) NULL,
      ID_equipe INT NULL,
      nombre_buts BIGINT DEFAULT 0,
      passes_decisives BIGINT DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

// helper: return which id column exists in given table (prioritise Id_buteur then Id_joueur)
async function getButeursKeyColumn(tableName = 'buteurs') {
  try {
    const cols = await query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? ", [tableName]);
    const names = (cols || []).map(r => r.COLUMN_NAME);
    if (names.includes('Id_buteur')) return 'Id_buteur';
    if (names.includes('Id_joueur')) return 'Id_joueur';
    return null;
  } catch (e) {
    return null;
  }
}

/* ------------------ Utility: minimal players check ------------------ */
async function canStartMatch(e1, e2, minPlayers = 7) {
  try {
    const r1 = await query('SELECT COUNT(*) AS c FROM joueurs WHERE ID_Equipe = ?', [e1]);
    const r2 = await query('SELECT COUNT(*) AS c FROM joueurs WHERE ID_Equipe = ?', [e2]);
    const c1 = (r1 && r1[0] && r1[0].c) || 0;
    const c2 = (r2 && r2[0] && r2[0].c) || 0;
    if (c1 < minPlayers) return { ok: false, message: `Équipe 1 n'a que ${c1} joueur(s) (min ${minPlayers})` };
    if (c2 < minPlayers) return { ok: false, message: `Équipe 2 n'a que ${c2} joueur(s) (min ${minPlayers})` };
    return { ok: true };
  } catch (err) {
    console.warn('canStartMatch check failed:', err.message || err);
    return { ok: true };
  }
}

/* ------------------ Routes ------------------ */

// Home
/* ------------------ AUTHENTIFICATION ------------------ */

// 1. On affiche la connexion en premier
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Page_connexion.html'));
});

// 2. Route pour traiter le formulaire 


app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // On utilise la fonction query (avec Promise) définie plus haut dans ton code
        const rows = await query(
            'SELECT * FROM utilisateurs WHERE nom_utilisateur = ? AND mot_de_passe = ?', 
            [username, password]
        );

        if (rows && rows.length > 0) {
            const user = rows[0];
            req.session.user = {
                id: user.id || user.Id_utilisateur || 1,
                username: user.nom_utilisateur,
                role: user.role || 'admin' 
            };

            res.json({ 
                success: true, 
                role: req.session.user.role,
                redirect: 'Accueil.html' 
            });
        } else {
            res.status(401).json({ success: false, message: "Identifiants incorrects." });
        }
    } catch (err) {
        console.error("ERREUR CRITIQUE LOGIN:", err);
        res.status(500).json({ success: false, message: "Erreur technique : " + err.message });
    }
});


app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 3. On garde l'accès à l'accueil via son nom de fichier
app.get('/Accueil.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'Accueil.html'));
});

app.post('/api/register', async (req, res) => {
    try {
        const { teamName, email, password } = req.body;

        // Vérifier si l'utilisateur existe déjà
        const existing = await query('SELECT * FROM utilisateurs WHERE nom_utilisateur = ? OR email = ?', [teamName, email]);
        if (existing.length > 0) {
            return res.status(400).json({ message: "Le nom d'utilisateur ou l'email est déjà utilisé." });
        }

        // Insérer dans la table utilisateurs
        await query(
            'INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe) VALUES (?, ?, ?)', 
            [teamName, email, password]
        );

        res.json({ success: true, message: "Utilisateur créé avec succès !" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Erreur lors de la création du compte." });
    }
});
/* ------------------ EQUIPES ------------------ */

// GET /api/equipes
app.get('/api/equipes', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM equipes');
    res.json(rows);
  } catch (err) {
    console.error('/api/equipes error', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/equipes
app.post('/api/equipes',verifierAdmin, async (req, res) => {
  try {
    const { nomEquipe, nombre_joueurs, ville, coach, president, logo } = req.body;
    if (!nomEquipe) return res.status(400).json({ message: "Le nom de l'équipe est requis" });

    const r = await query('INSERT INTO equipes (nomEquipe, nombre_joueurs, ville, coach, president) VALUES (?, ?, ?, ?, ?)', [nomEquipe, nombre_joueurs || 0, ville || null, coach || null, president || null]);
    const id = r.insertId;

    // logo handling
    if (logo && typeof logo === 'string' && logo.startsWith('data:')) {
      const matches = logo.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
      if (matches) {
        const ext = matches[2] === 'jpeg' ? 'jpg' : matches[2];
        const buffer = Buffer.from(matches[3], 'base64');
        const imagesDir = path.join(__dirname, 'images', 'teams');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
        const filename = `team_${id}.${ext}`;
        fs.writeFileSync(path.join(imagesDir, filename), buffer);
        const publicPath = `images/teams/${filename}`;
        await query('UPDATE equipes SET logo = ? WHERE ID_Equipe = ?', [publicPath, id]);
      }
    }

    res.json({ message: 'Équipe enregistrée', id });
  } catch (err) {
    console.error('/api/equipes POST error', err);
    if (err && err.code === 'ER_DUP_ENTRY') return res.status(400).json({ message: 'Une équipe avec ce nom existe déjà' });
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ MATCHS ------------------ */

// GET /api/matchs
app.get('/api/matchs', async (req, res) => {
  try {
    const rows = await query(`
      SELECT m.*, e1.nomEquipe AS Equipe1_name, e2.nomEquipe AS Equipe2_name
      FROM matchs m
      LEFT JOIN equipes e1 ON m.Equipe1 = e1.ID_Equipe
      LEFT JOIN equipes e2 ON m.Equipe2 = e2.ID_Equipe
      ORDER BY m.Date_heure DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('/api/matchs error', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/matchs
app.post('/api/matchs',verifierAdmin, async (req, res) => {
  try {
    const { Equipe1, Equipe2, Arbitre_principal, Arbitre_de_touche, Lieu, Date_heure, statut } = req.body;
    if (!Equipe1 || !Equipe2) return res.status(400).json({ message: 'Deux équipes requises' });

    const check = await canStartMatch(Equipe1, Equipe2);
    if (!check.ok) return res.status(400).json({ message: check.message });

    const r = await query('INSERT INTO matchs (Equipe1, Equipe2, Arbitre_principal, Arbitre_de_touche, Lieu, Date_heure, statut) VALUES (?, ?, ?, ?, ?, ?, ?)', [Equipe1, Equipe2, Arbitre_principal || null, Arbitre_de_touche || null, Lieu || null, Date_heure || null, statut || 'à venir']);
    res.json({ message: 'Match créé', id: r.insertId });
  } catch (err) {
    console.error('/api/matchs POST error', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/matchs/:id
// DELETE /api/matchs/:id
app.delete('/api/matchs/:id',verifierAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Récupérer les infos du match AVANT de le supprimer pour savoir s'il était terminé
    const mrows = await query('SELECT * FROM matchs WHERE Id_Match = ?', [id]);
    if (!mrows.length) return res.status(404).json({ message: 'Match introuvable' });
    const match = mrows[0];

    // 2. Si le match était "terminé", on soustrait les points des stats d'équipes
    if (match.statut === 'terminé') {
      const g1 = match.Score_Equipe1 || 0;
      const g2 = match.Score_Equipe2 || 0;
      const t1 = match.Equipe1;
      const t2 = match.Equipe2;

      let t1_w = 0, t1_d = 0, t1_l = 0, t2_w = 0, t2_d = 0, t2_l = 0;
      if (g1 > g2) { t1_w = 1; t2_l = 1; }
      else if (g1 === g2) { t1_d = 1; t2_d = 1; }
      else { t2_w = 1; t1_l = 1; }

      const pts1 = (t1_w * 3) + t1_d;
      const pts2 = (t2_w * 3) + t2_d;

      // Soustraction Équipe 1
      await query(`
        UPDATE stats SET 
          matches_played = matches_played - 1, wins = wins - ?, draws = draws - ?, 
          losses = losses - ?, goals_for = goals_for - ?, goals_against = goals_against - ?, 
          points = points - ? 
        WHERE equipe_id = ? AND saison = (SELECT YEAR(?))`, 
        [t1_w, t1_d, t1_l, g1, g2, pts1, t1, match.Date_heure]);

      // Soustraction Équipe 2
      await query(`
        UPDATE stats SET 
          matches_played = matches_played - 1, wins = wins - ?, draws = draws - ?, 
          losses = losses - ?, goals_for = goals_for - ?, goals_against = goals_against - ?, 
          points = points - ? 
        WHERE equipe_id = ? AND saison = (SELECT YEAR(?))`, 
        [t2_w, t2_d, t2_l, g2, g1, pts2, t2, match.Date_heure]);
    }

    // 3. ICI ON NETTOIE TOUT
    // Supprimer les buts et cartons liés à ce match dans match_events
    await query('DELETE FROM match_events WHERE match_id = ?', [id]);
    
    // Supprimer le match lui-même
    await query('DELETE FROM matchs WHERE Id_Match = ?', [id]);

    // Note : Après avoir supprimé un match, il est conseillé de cliquer sur 
    // le bouton "Recalculer" dans ton interface pour remettre à jour la table des buteurs.
    
    res.json({ message: 'Match supprimé et statistiques déduites avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur lors de la suppression" });
  }
});




/* ------------------ MATCH DETAILS ------------------ */

// GET /api/matchs/:id
app.get('/api/matchs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query(`
      SELECT m.*, e1.nomEquipe AS Equipe1_name, e2.nomEquipe AS Equipe2_name
      FROM matchs m
      LEFT JOIN equipes e1 ON m.Equipe1 = e1.ID_Equipe
      LEFT JOIN equipes e2 ON m.Equipe2 = e2.ID_Equipe
      WHERE m.Id_Match = ?
    `, [id]);
    if (!rows.length) return res.status(404).json({ message: 'Match introuvable' });
    res.json(rows[0]);
  } catch (err) {
    console.error('/api/matchs/:id error', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/matchs/:id/players
app.get('/api/matchs/:id/players', async (req, res) => {
  try {
    const { id } = req.params;
    const m = await query('SELECT Equipe1, Equipe2 FROM matchs WHERE Id_Match = ?', [id]);
    if (!m.length) return res.json([]);
    const { Equipe1, Equipe2 } = m[0];
    const players = await query('SELECT * FROM joueurs WHERE ID_Equipe IN (?, ?) ORDER BY nom', [Equipe1, Equipe2]);
    res.json(players);
  } catch (err) {
    console.error('/api/matchs/:id/players error', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/equipes/:id/joueurs fallback
app.get('/api/equipes/:id/joueurs', async (req, res) => {
  try {
    const { id } = req.params;
    let players = [];
    if (/^\d+$/.test(String(id))) players = await query('SELECT * FROM joueurs WHERE ID_Equipe = ? ORDER BY nom', [id]);
    if (!players.length) {
      const rows = await query('SELECT ID_Equipe FROM equipes WHERE nomEquipe = ? LIMIT 1', [id]);
      if (rows && rows.length) players = await query('SELECT * FROM joueurs WHERE ID_Equipe = ? ORDER BY nom', [rows[0].ID_Equipe]);
    }
    res.json(players);
  } catch (err) {
    console.error('/api/equipes/:id/joueurs error', err);
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ JOUEURS ------------------ */

// GET /api/joueurs
app.get('/api/joueurs', async (req, res) => {
  try {
    const rows = await query(`SELECT j.*, e.nomEquipe AS team_name FROM joueurs j LEFT JOIN equipes e ON j.ID_Equipe = e.ID_Equipe ORDER BY j.nom, j.prenom`);
    res.json(rows);
  } catch (err) {
    console.error('/api/joueurs error', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/joueurs
app.post('/api/joueurs',verifierAdmin, async (req, res) => {
  try {
    const { nom, prenom, age, telephone, reseaux_sociaux, maladie_courante, ID_Equipe, poste, numero, photo } = req.body;
    if (!nom || !prenom) return res.status(400).json({ message: 'Nom et prénom requis' });

    const r = await query('INSERT INTO joueurs (nom, prenom, age, telephone, reseaux_sociaux, maladie_courante, ID_Equipe, poste, numero) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [nom, prenom, age || null, telephone || null, reseaux_sociaux || null, maladie_courante || null, ID_Equipe || null, poste || null, numero || null]);
    const id = r.insertId;

    if (photo && typeof photo === 'string' && photo.startsWith('data:')) {
      const matches = photo.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);
      if (matches) {
        const ext = matches[2] === 'jpeg' ? 'jpg' : matches[2];
        const buffer = Buffer.from(matches[3], 'base64');
        const imagesDir = path.join(__dirname, 'images', 'players');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
        const filename = `player_${id}.${ext}`;
        fs.writeFileSync(path.join(imagesDir, filename), buffer);
        const colCheck = await query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'joueurs' AND COLUMN_NAME = 'photo'");
        if (!colCheck.length) await query("ALTER TABLE joueurs ADD COLUMN photo VARCHAR(255) NULL");
        await query('UPDATE joueurs SET photo = ? WHERE Id_joueur = ?', [`images/players/${filename}`, id]);
      }
    }

    res.json({ message: 'Joueur enregistré', id });
  } catch (err) {
    console.error('/api/joueurs POST error', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/joueurs/:id
app.delete('/api/joueurs/:id',verifierAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query('SELECT photo FROM joueurs WHERE Id_joueur = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'Joueur introuvable' });
    const photo = rows[0].photo;
    await query('DELETE FROM joueurs WHERE Id_joueur = ?', [id]);
    if (photo) {
      try { if (fs.existsSync(path.join(__dirname, photo))) fs.unlinkSync(path.join(__dirname, photo)); } catch(e){ console.warn('photo removal failed', e); }
    }
    res.json({ message: 'Joueur supprimé' });
  } catch (err) {
    console.error('/api/joueurs DELETE error', err);
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ BUTEURS / STATS / RECALCUL ------------------ */

// GET /api/stats
app.get('/api/stats', async (req, res) => {
  try {
    const { saison } = req.query;
    const q = saison ? 'SELECT s.*, e.nomEquipe FROM stats s LEFT JOIN equipes e ON s.equipe_id = e.ID_Equipe WHERE s.saison = ? ORDER BY s.points DESC, (s.goals_for - s.goals_against) DESC' :
                      'SELECT s.*, e.nomEquipe FROM stats s LEFT JOIN equipes e ON s.equipe_id = e.ID_Equipe ORDER BY s.points DESC, (s.goals_for - s.goals_against) DESC';
    const rows = saison ? await query(q, [saison]) : await query(q);
    res.json(rows);
  } catch (err) {
    console.error('/api/stats error', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/buteurs (read)
// If buteurs_real exists (used for writes when original is view) prefer it for reads if it has data
app.get('/api/buteurs', async (req, res) => {
  try {
    // prefer buteurs_real if it exists and has rows
    const tb = await query("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'buteurs_real' LIMIT 1");
    if (tb && tb.length) {
      const c = await query('SELECT COUNT(*) AS c FROM buteurs_real');
      if (c && c[0] && c[0].c > 0) {
        const rows = await query(`SELECT Id_buteur, CONCAT(nom,' ',prenom) AS player_name, ID_equipe AS team_id, nombre_buts AS buts, passes_decisives AS passes FROM buteurs_real ORDER BY nombre_buts DESC, passes_decisives DESC`);
        return res.json(rows);
      }
    }
    // fallback to original buteurs (view or table)
    const rows = await query(`
      SELECT 
        b.Id_buteur,
        CONCAT(b.nom, ' ', b.prenom) AS player_name,
        e.nomEquipe AS team_name,
        b.nombre_buts AS buts,
        b.passes_decisives AS passes
      FROM buteurs b
      LEFT JOIN equipes e ON b.ID_equipe = e.ID_Equipe
      ORDER BY b.nombre_buts DESC, b.passes_decisives DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('/api/buteurs error', err);
    // if buteurs is a view and SELECT fails, return empty array rather than 500 to keep UI usable
    res.status(500).json({ message: err.message });
  }
});

// POST /api/recalculate
app.post('/api/recalculate',verifierAdmin, async (req, res) => {
  try {
    const isView = await isButeursView();
    if (isView) {
      // use buteurs_real for storage
      await ensureButuersReal();
      await query('TRUNCATE TABLE buteurs_real');
    } else {
      // if base table, clear it
      await query('DELETE FROM buteurs');
    }

    const scorers = await query(`
      SELECT j.Id_joueur, j.nom, j.prenom, j.ID_Equipe,
        SUM(CASE WHEN me.type = 'goal' THEN 1 ELSE 0 END) AS buts,
        SUM(CASE WHEN me.type = 'assist' THEN 1 ELSE 0 END) AS passes
      FROM match_events me
      JOIN joueurs j ON me.player_id = j.Id_joueur
      GROUP BY me.player_id
    `);

    for (const s of scorers) {
      if ((s.buts||0) > 0 || (s.passes||0) > 0) {
        if (isView) {
          await query('INSERT INTO buteurs_real (Id_joueur, nom, prenom, ID_equipe, nombre_buts, passes_decisives) VALUES (?, ?, ?, ?, ?, ?)', [s.Id_joueur || null, s.nom, s.prenom, s.ID_Equipe, s.buts || 0, s.passes || 0]);
        } else {
          await query('INSERT INTO buteurs (Id_joueur, nom, prenom, ID_equipe, nombre_buts, passes_decisives) VALUES (?, ?, ?, ?, ?, ?)', [s.Id_joueur || null, s.nom, s.prenom, s.ID_Equipe, s.buts || 0, s.passes || 0]);
        }
      }
    }

    // recompute league stats (same as before)
    const season = (new Date()).getFullYear().toString();
    await query('DELETE FROM stats WHERE saison = ?', [season]);

    const matches = await query('SELECT * FROM matchs WHERE statut = "terminé"');
    const statsMap = {};

    for (const m of matches) {
      const t1 = m.Equipe1; const t2 = m.Equipe2; const g1 = m.Score_Equipe1 || 0; const g2 = m.Score_Equipe2 || 0;
      if (!statsMap[t1]) statsMap[t1] = { matches_played:0, wins:0, draws:0, losses:0, goals_for:0, goals_against:0, points:0, yellow_cards:0, red_cards:0 };
      if (!statsMap[t2]) statsMap[t2] = { matches_played:0, wins:0, draws:0, losses:0, goals_for:0, goals_against:0, points:0, yellow_cards:0, red_cards:0 };
      statsMap[t1].matches_played += 1; statsMap[t1].goals_for += g1; statsMap[t1].goals_against += g2;
      statsMap[t2].matches_played += 1; statsMap[t2].goals_for += g2; statsMap[t2].goals_against += g1;
      if (g1 > g2) { statsMap[t1].wins +=1; statsMap[t1].points +=3; statsMap[t2].losses +=1; }
      else if (g1 === g2) { statsMap[t1].draws +=1; statsMap[t1].points +=1; statsMap[t2].draws +=1; statsMap[t2].points +=1; }
      else { statsMap[t2].wins +=1; statsMap[t2].points +=3; statsMap[t1].losses +=1; }

      const yrows = await query('SELECT team_id, COUNT(*) AS y FROM match_events WHERE match_id = ? AND type = "yellow" GROUP BY team_id', [m.Id_Match]);
      const rrows = await query('SELECT team_id, COUNT(*) AS r FROM match_events WHERE match_id = ? AND type = "red" GROUP BY team_id', [m.Id_Match]);
      yrows.forEach(r => { if (!statsMap[r.team_id]) statsMap[r.team_id] = { matches_played:0, wins:0, draws:0, losses:0, goals_for:0, goals_against:0, points:0, yellow_cards:0, red_cards:0 }; statsMap[r.team_id].yellow_cards += r.y; });
      rrows.forEach(r => { if (!statsMap[r.team_id]) statsMap[r.team_id] = { matches_played:0, wins:0, draws:0, losses:0, goals_for:0, goals_against:0, points:0, yellow_cards:0, red_cards:0 }; statsMap[r.team_id].red_cards += r.r; });
    }

    for (const teamIdStr of Object.keys(statsMap)) {
      const teamId = parseInt(teamIdStr,10);
      const s = statsMap[teamId];
      await query(`
        INSERT INTO stats (equipe_id, saison, competition, matches_played, wins, draws, losses, goals_for, goals_against, points, yellow_cards, red_cards)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          matches_played = VALUES(matches_played), wins = VALUES(wins), draws = VALUES(draws), losses = VALUES(losses),
          goals_for = VALUES(goals_for), goals_against = VALUES(goals_against), points = VALUES(points),
          yellow_cards = VALUES(yellow_cards), red_cards = VALUES(red_cards)
      `, [teamId, season, 'championnat', s.matches_played, s.wins, s.draws, s.losses, s.goals_for, s.goals_against, s.points, s.yellow_cards, s.red_cards]);
    }

    res.json({ message: 'Recalcul terminé' });
  } catch (err) {
    console.error('/api/recalculate error', err);
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ MATCH EVENTS & FINALISATION ------------------ */

// GET /api/matchs/:id/events
app.get('/api/matchs/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query(`
      SELECT me.*, CONCAT(p.nom, ' ', p.prenom) AS player_name, t.nomEquipe AS team_name
      FROM match_events me
      LEFT JOIN joueurs p ON me.player_id = p.Id_joueur
      LEFT JOIN equipes t ON me.team_id = t.ID_Equipe
      WHERE me.match_id = ? ORDER BY me.minute ASC, me.created_at ASC
    `, [id]);
    res.json(rows);
  } catch (err) {
    console.error('/api/matchs/:id/events error', err);
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/matchs/:id/finish
app.put('/api/matchs/:id/finish',verifierAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { score1, score2, saison, competition } = req.body;
    const mrows = await query('SELECT * FROM matchs WHERE Id_Match = ?', [id]);
    if (!mrows.length) return res.status(404).json({ message: 'Match introuvable' });
    const match = mrows[0];

    const goalRows = await query('SELECT team_id, COUNT(*) AS g FROM match_events WHERE match_id = ? AND type = "goal" GROUP BY team_id', [id]);
    const goalsMap = {};
    goalRows.forEach(r=> { goalsMap[r.team_id] = r.g; });

    const g1 = (typeof score1 === 'number' ? score1 : (goalsMap[match.Equipe1] || 0));
    const g2 = (typeof score2 === 'number' ? score2 : (goalsMap[match.Equipe2] || 0));

    await query('UPDATE matchs SET Score_Equipe1 = ?, Score_Equipe2 = ?, statut = ? WHERE Id_Match = ?', [g1, g2, 'terminé', id]);

    const season = saison || (new Date().getFullYear()).toString();
    const comp = competition || 'championnat';

    const yellowRows = await query('SELECT team_id, COUNT(*) AS y FROM match_events WHERE match_id = ? AND type = "yellow" GROUP BY team_id', [id]);
    const redRows = await query('SELECT team_id, COUNT(*) AS r FROM match_events WHERE match_id = ? AND type = "red" GROUP BY team_id', [id]);
    const yellows = {}; yellowRows.forEach(r=> { yellows[r.team_id] = r.y; });
    const reds = {}; redRows.forEach(r=> { reds[r.team_id] = r.r; });

    async function upsertTeamStats(teamId, playedInc, winInc, drawInc, lossInc, gfInc, gaInc, ptsInc, yellowInc, redInc) {
      await query(`
        INSERT INTO stats (equipe_id, saison, competition, matches_played, wins, draws, losses, goals_for, goals_against, points, yellow_cards, red_cards)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          matches_played = matches_played + VALUES(matches_played),
          wins = wins + VALUES(wins),
          draws = draws + VALUES(draws),
          losses = losses + VALUES(losses),
          goals_for = goals_for + VALUES(goals_for),
          goals_against = goals_against + VALUES(goals_against),
          points = points + VALUES(points),
          yellow_cards = yellow_cards + VALUES(yellow_cards),
          red_cards = red_cards + VALUES(red_cards)
      `, [teamId, season, comp, playedInc, winInc, drawInc, lossInc, gfInc, gaInc, ptsInc, yellowInc, redInc]);
    }

    const t1 = match.Equipe1; const t2 = match.Equipe2;
    let t1_win = 0, t1_draw = 0, t1_loss = 0, t2_win = 0, t2_draw = 0, t2_loss = 0;
    if (g1 > g2) { t1_win=1; t2_loss=1; }
    else if (g1 === g2) { t1_draw=1; t2_draw=1; }
    else { t2_win=1; t1_loss=1; }

    const y1 = yellows[t1] || 0; const y2 = yellows[t2] || 0;
    const r1 = reds[t1] || 0; const r2 = reds[t2] || 0;

    await upsertTeamStats(t1, 1, t1_win, t1_draw, t1_loss, g1, g2, (t1_win*3 + t1_draw), y1, r1);
    await upsertTeamStats(t2, 1, t2_win, t2_draw, t2_loss, g2, g1, (t2_win*3 + t2_draw), y2, r2);

    // Update buteurs (safe: if original buteurs is view, write to buteurs_real)
    const scorers = await query('SELECT player_id, COUNT(*) AS g FROM match_events WHERE match_id = ? AND type = "goal" AND player_id IS NOT NULL GROUP BY player_id', [id]);
    const isView = await isButeursView();
    if (isView) await ensureButuersReal();
    const targetTable = isView ? 'buteurs_real' : 'buteurs';
    const keyCol = await getButeursKeyColumn(targetTable); // Id_buteur or Id_joueur or null

    for (const s of scorers) {
      const pl = await query('SELECT nom, prenom, ID_Equipe, Id_joueur FROM joueurs WHERE Id_joueur = ?', [s.player_id]);
      if (!pl.length) continue;
      const p = pl[0];

      // try to find existing by Id_joueur or nom/prenom/ID_equipe
      let exists = [];
      if (keyCol === 'Id_buteur') {
        exists = await query('SELECT Id_buteur FROM ' + targetTable + ' WHERE nom = ? AND prenom = ? AND ID_equipe = ? LIMIT 1', [p.nom, p.prenom, p.ID_Equipe]);
        if (exists.length) await query(`UPDATE ${targetTable} SET nombre_buts = COALESCE(nombre_buts,0) + ? WHERE Id_buteur = ?`, [s.g, exists[0].Id_buteur]);
        else await query(`INSERT INTO ${targetTable} (nom, prenom, ID_equipe, nombre_buts) VALUES (?, ?, ?, ?)`, [p.nom, p.prenom, p.ID_Equipe, s.g]);
      } else {
        // prefer Id_joueur
        exists = await query('SELECT Id_joueur FROM ' + targetTable + ' WHERE Id_joueur = ? LIMIT 1', [p.Id_joueur]);
        if (exists.length) {
          await query(`UPDATE ${targetTable} SET nombre_buts = COALESCE(nombre_buts,0) + ? WHERE Id_joueur = ?`, [s.g, p.Id_joueur]);
        } else {
          await query(`INSERT INTO ${targetTable} (Id_joueur, nom, prenom, ID_equipe, nombre_buts) VALUES (?, ?, ?, ?, ?)`, [p.Id_joueur || null, p.nom, p.prenom, p.ID_Equipe, s.g]);
        }
      }
    }

    // Update assists similarly
    const assistants = await query('SELECT player_id, COUNT(*) AS a FROM match_events WHERE match_id = ? AND type = "assist" AND player_id IS NOT NULL GROUP BY player_id', [id]);
    for (const a of assistants) {
      const pl = await query('SELECT nom, prenom, ID_Equipe, Id_joueur FROM joueurs WHERE Id_joueur = ?', [a.player_id]);
      if (!pl.length) continue;
      const p = pl[0];
      const keyCol2 = await getButeursKeyColumn(targetTable);
      if (keyCol2 === 'Id_buteur') {
        const exists = await query('SELECT Id_buteur FROM ' + targetTable + ' WHERE nom = ? AND prenom = ? AND ID_equipe = ? LIMIT 1', [p.nom, p.prenom, p.ID_Equipe]);
        if (exists.length) await query(`UPDATE ${targetTable} SET passes_decisives = COALESCE(passes_decisives,0) + ? WHERE Id_buteur = ?`, [a.a, exists[0].Id_buteur]);
        else await query(`INSERT INTO ${targetTable} (nom, prenom, ID_equipe, passes_decisives) VALUES (?, ?, ?, ?)`, [p.nom, p.prenom, p.ID_Equipe, a.a]);
      } else {
        const exists = await query('SELECT Id_joueur FROM ' + targetTable + ' WHERE Id_joueur = ? LIMIT 1', [p.Id_joueur]);
        if (exists.length) await query(`UPDATE ${targetTable} SET passes_decisives = COALESCE(passes_decisives,0) + ? WHERE Id_joueur = ?`, [a.a, p.Id_joueur]);
        else await query(`INSERT INTO ${targetTable} (Id_joueur, nom, prenom, ID_equipe, passes_decisives) VALUES (?, ?, ?, ?, ?)`, [p.Id_joueur || null, p.nom, p.prenom, p.ID_Equipe, a.a]);
      }
    }

    res.json({ message: 'Match finalisé', score: { [t1]: g1, [t2]: g2 } });
  } catch (err) {
    console.error('/api/matchs/:id/finish error', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/matchs/:id/events
app.post('/api/matchs/:id/events',verifierAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, player, minute, team } = req.body;

    // 1. Vérifications de base
    const matchRows = await query('SELECT statut, Equipe1, Equipe2 FROM matchs WHERE Id_Match = ?', [id]);
    if (!matchRows.length) return res.status(404).json({ message: 'Match introuvable' });
    
    const match = matchRows[0];
    if (match.statut === 'terminé') {
      return res.status(403).json({ message: 'Ce match est terminé, modifications impossibles.' });
    }
    if (!type || !team) return res.status(400).json({ message: 'Type et équipe requis' });

    // 2. Enregistrement de l'événement (LA SEULE SOURCE DE VÉRITÉ)
    // On n'incrémente plus la table buteurs ici pour éviter le double comptage
    await query(
      'INSERT INTO match_events (match_id, type, player_id, minute, team_id) VALUES (?, ?, ?, ?, ?)', 
      [id, type, player || null, minute || null, team]
    );

    // 3. Mise à jour du score du match UNIQUEMENT si c'est un but
    if (type === 'goal') {
      const teamId = parseInt(team, 10);
      if (teamId === match.Equipe1) {
        await query('UPDATE matchs SET Score_Equipe1 = Score_Equipe1 + 1 WHERE Id_Match = ?', [id]);
      } else if (teamId === match.Equipe2) {
        await query('UPDATE matchs SET Score_Equipe2 = Score_Equipe2 + 1 WHERE Id_Match = ?', [id]);
      }
    }

    res.json({ message: 'Événement enregistré avec succès' });
  } catch (err) {
    console.error('/api/matchs/:id/events error', err);
    res.status(500).json({ message: err.message });
  }
});


// GET /api/matchs/:id/stats (summary counts)
app.get('/api/matchs/:id/stats', async (req, res) => {
  try {
    const { id } = req.params;
    const m = await query('SELECT Id_Match FROM matchs WHERE Id_Match = ?', [id]);
    if (!m.length) return res.status(404).json({ message: 'Match introuvable' });

    const goals = await query('SELECT team_id, COUNT(*) AS goals FROM match_events WHERE match_id = ? AND type = "goal" GROUP BY team_id', [id]);
    const yellow = await query('SELECT team_id, COUNT(*) AS yellows FROM match_events WHERE match_id = ? AND type = "yellow" GROUP BY team_id', [id]);
    const red = await query('SELECT team_id, COUNT(*) AS reds FROM match_events WHERE match_id = ? AND type = "red" GROUP BY team_id', [id]);
    const assists = await query('SELECT player_id, COUNT(*) AS assists FROM match_events WHERE match_id = ? AND type = "assist" GROUP BY player_id', [id]);

    res.json({ goals, yellow, red, assists });
  } catch (err) {
    console.error('/api/matchs/:id/stats error', err);
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/matchs/events/:eventId
app.delete('/api/matchs/events/:eventId',verifierAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;
    await query('DELETE FROM match_events WHERE id = ?', [eventId]);
    res.json({ message: 'Événement supprimé' });
  } catch (err) {
    console.error('/api/matchs/events DELETE error', err);
    res.status(500).json({ message: err.message });
  }
});


/* ------------------ SUMMARY endpoint (aggregated match payload) ------------------ */

app.get('/api/matchs/:id/summary', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await query(`
      SELECT m.*, e1.nomEquipe AS Equipe1_name, e1.logo AS Equipe1_logo,
                   e2.nomEquipe AS Equipe2_name, e2.logo AS Equipe2_logo
      FROM matchs m
      LEFT JOIN equipes e1 ON m.Equipe1 = e1.ID_Equipe
      LEFT JOIN equipes e2 ON m.Equipe2 = e2.ID_Equipe
      WHERE m.Id_Match = ?
    `, [id]);
    if (!rows.length) return res.status(404).json({ message: 'Match introuvable' });
    const match = rows[0];

    const evRows = await query(`SELECT COALESCE(me.team_id,0) AS team_id, me.type, COUNT(*) AS cnt FROM match_events me WHERE me.match_id = ? GROUP BY me.team_id, me.type`, [id]);
    const byTypeTeam = {};
    evRows.forEach(r => {
      byTypeTeam[r.type] = byTypeTeam[r.type] || {};
      byTypeTeam[r.type][r.team_id] = (byTypeTeam[r.type][r.team_id] || 0) + r.cnt;
    });
    const getCount = (type, teamId) => (byTypeTeam[type] && byTypeTeam[type][teamId]) ? byTypeTeam[type][teamId] : 0;
    const t1 = match.Equipe1, t2 = match.Equipe2;
    const score1 = (typeof match.Score_Equipe1 === 'number' && match.Score_Equipe1 !== null) ? match.Score_Equipe1 : getCount('goal', t1);
    const score2 = (typeof match.Score_Equipe2 === 'number' && match.Score_Equipe2 !== null) ? match.Score_Equipe2 : getCount('goal', t2);

    const payload = {
      match: {
        id: match.Id_Match,
        date: match.Date_heure,
        lieu: match.Lieu || null,
        teamLeft: { id: t1, name: match.Equipe1_name || null, logo: match.Equipe1_logo || null, score: score1 },
        teamRight: { id: t2, name: match.Equipe2_name || null, logo: match.Equipe2_logo || null, score: score2 }
      },
      donuts: {
        possession: null,
        duels: ((getCount('duel_won', t1) || getCount('duel_won', t2)) ? [ Math.round((getCount('duel_won', t1)/(((getCount('duel_won', t1)||0)+(getCount('duel_won', t2)||0))||1))*100), Math.round((getCount('duel_won', t2)/(((getCount('duel_won', t1)||0)+(getCount('duel_won', t2)||0))||1))*100) ] : null),
        aerials: ((getCount('aerial_won', t1) || getCount('aerial_won', t2)) ? [ Math.round((getCount('aerial_won', t1)/(((getCount('aerial_won', t1)||0)+(getCount('aerial_won', t2)||0))||1))*100), Math.round((getCount('aerial_won', t2)/(((getCount('aerial_won', t1)||0)+(getCount('aerial_won', t2)||0))||1))*100) ] : null)
      },
      stats: {
        passes: [ getCount('pass', t1) || 0, getCount('pass', t2) || 0 ],
        pass_success: [ getCount('pass_success', t1) || 0, getCount('pass_success', t2) || 0 ],
        shots: [ getCount('shot', t1) || 0, getCount('shot', t2) || 0 ],
        shots_on_target: [ getCount('shot_on_target', t1) || 0, getCount('shot_on_target', t2) || 0 ],
        crosses: [ getCount('cross', t1) || 0, getCount('cross', t2) || 0 ],
        dribbles: [ getCount('dribble', t1) || 0, getCount('dribble', t2) || 0 ],
        fouls: [ getCount('foul', t1) || 0, getCount('foul', t2) || 0 ],
        yellows: [ getCount('yellow', t1) || 0, getCount('yellow', t2) || 0 ],
        reds: [ getCount('red', t1) || 0, getCount('red', t2) || 0 ],
        assists: [ getCount('assist', t1) || 0, getCount('assist', t2) || 0 ]
      },
      aggregated_events: byTypeTeam
    };

    if ((payload.stats.pass_success[0] || payload.stats.pass_success[1]) && (payload.stats.passes[0] || payload.stats.passes[1])) {
      payload.stats.pass_pct = [
        payload.stats.passes[0] ? Math.round((payload.stats.pass_success[0] / payload.stats.passes[0]) * 100) : 0,
        payload.stats.passes[1] ? Math.round((payload.stats.pass_success[1] / payload.stats.passes[1]) * 100) : 0
      ];
    } else payload.stats.pass_pct = null;

    res.json(payload);
  } catch (err) {
    console.error('/api/matchs/:id/summary error', err);
    res.status(500).json({ message: err.message });
  }
});

/* ------------------ CLASSEMENT ------------------ */

app.get('/api/classement', async (req, res) => {
  try {
    const rows = await query(`
      SELECT e.ID_Equipe, e.nomEquipe, e.logo,
        SUM(CASE WHEN (m.Equipe1 = e.ID_Equipe AND m.Date_heure <= NOW()) THEN m.Score_Equipe1
                 WHEN (m.Equipe2 = e.ID_Equipe AND m.Date_heure <= NOW()) THEN m.Score_Equipe2 ELSE 0 END) AS goals_for,
        SUM(CASE WHEN (m.Equipe1 = e.ID_Equipe AND m.Date_heure <= NOW()) THEN m.Score_Equipe2
                 WHEN (m.Equipe2 = e.ID_Equipe AND m.Date_heure <= NOW()) THEN m.Score_Equipe1 ELSE 0 END) AS goals_against,
        SUM(CASE WHEN (m.Equipe1 = e.ID_Equipe OR m.Equipe2 = e.ID_Equipe) AND m.Date_heure <= NOW() THEN 1 ELSE 0 END) AS played,
        SUM(CASE WHEN ((m.Equipe1 = e.ID_Equipe AND m.Score_Equipe1 > m.Score_Equipe2) OR (m.Equipe2 = e.ID_Equipe AND m.Score_Equipe2 > m.Score_Equipe1)) AND m.Date_heure <= NOW() THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN (m.Equipe1 = e.ID_Equipe OR m.Equipe2 = e.ID_Equipe) AND m.Date_heure <= NOW() AND m.Score_Equipe1 = m.Score_Equipe2 THEN 1 ELSE 0 END) AS draws,
        SUM(CASE WHEN ((m.Equipe1 = e.ID_Equipe AND m.Score_Equipe1 < m.Score_Equipe2) OR (m.Equipe2 = e.ID_Equipe AND m.Score_Equipe2 < m.Score_Equipe1)) AND m.Date_heure <= NOW() THEN 1 ELSE 0 END) AS losses
      FROM equipes e
      LEFT JOIN matchs m ON (m.Equipe1 = e.ID_Equipe OR m.Equipe2 = e.ID_Equipe)
      GROUP BY e.ID_Equipe
      ORDER BY (wins*3 + draws) DESC, (goals_for - goals_against) DESC, goals_for DESC
    `);

    for (const t of rows) {
      t.goals_for = t.goals_for || 0; t.goals_against = t.goals_against || 0;
      t.played = t.played || 0; t.wins = t.wins || 0; t.draws = t.draws || 0; t.losses = t.losses || 0;
      t.points = (t.wins * 3) + (t.draws || 0);
      t.gd = t.goals_for - t.goals_against;

      const matches = await query(`
        SELECT m.Score_Equipe1, m.Score_Equipe2, m.Equipe1, m.Equipe2, m.Date_heure
        FROM matchs m
        WHERE (m.Equipe1 = ? OR m.Equipe2 = ?) AND m.Date_heure <= NOW()
        ORDER BY m.Date_heure DESC
        LIMIT 5
      `, [t.ID_Equipe, t.ID_Equipe]);

      t.form = matches.map(m => {
        const teamIsHome = (m.Equipe1 === t.ID_Equipe);
        const teamScore = teamIsHome ? m.Score_Equipe1 : m.Score_Equipe2;
        const oppScore = teamIsHome ? m.Score_Equipe2 : m.Score_Equipe1;
        if (teamScore > oppScore) return 'W';
        if (teamScore === oppScore) return 'D';
        return 'L';
      }).join('');
    }

    rows.sort((a,b) => {
      if (b.points !== a.points) return b.points - a.points;
      if ((b.gd) !== (a.gd)) return b.gd - a.gd;
      if ((b.goals_for) !== (a.goals_for)) return b.goals_for - a.goals_for;
      return a.nomEquipe.localeCompare(b.nomEquipe);
    });

    res.json(rows);
  } catch (err) {
    console.error('/api/classement error', err);
    res.status(500).json({ message: err.message });
  }
});

// --- CODE D'AUTO-CRÉATION DES TABLES ---
const sqlPath = path.join(__dirname, 'Footdubourg.sql');

if (fs.existsSync(sqlPath)) {
    const sqlFile = fs.readFileSync(sqlPath, 'utf8');
    const queries = sqlFile.split(';')
        .map(q => q.trim())
        .filter(q => q !== "" && !q.startsWith('USE') && !q.startsWith('CREATE DATABASE'));

    // On utilise la connexion 'db' déjà établie dans ton fichier Database.js
    queries.forEach(q => {
        db.query(q, (dbErr) => {
            if (dbErr && dbErr.code !== 'ER_TABLE_EXISTS_ERROR') {
                // On ne loggue que les vraies erreurs, pas celles des tables déjà créées
                console.log("Info création table:", dbErr.message);
            }
        });
    });
    console.log("Vérification/Migration SQL terminée.");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});
