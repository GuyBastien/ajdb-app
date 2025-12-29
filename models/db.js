require('dotenv').config();
const mariadb = require('mariadb');

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  connectionLimit: 10,
  acquireTimeout: 30000 
});

async function query(sql, params) {
  let conn;
  try {
    conn = await pool.getConnection();
    const res = await conn.query(sql, params);
    // Transforme les résultats pour être sûr qu'ils passent en JSON (gestion BigInt)
    return JSON.parse(JSON.stringify(res, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));
  } catch (err) {
    console.error("Erreur SQL :", err.message);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { query, pool };