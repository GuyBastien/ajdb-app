require('dotenv').config();
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  connectionLimit: 10,        // Augmenté à 10
  connectTimeout: 20000,      // 20 secondes pour laisser le temps à Railway
  acquireTimeout: 20000,
  idleTimeout: 30000          // Ferme les connexions inutilisées après 30s
});

async function query(sql, params) {
  let conn;
  try {
    conn = await pool.getConnection();
    const res = await conn.query(sql, params);
    return res;
  } catch (err) {
    console.error("Erreur SQL détaillée :", err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { pool, query };