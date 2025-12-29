require('dotenv').config();
const mysql = require('mysql');

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

// Promisifier les requêtes
const util = require('util');
db.query = util.promisify(db.query);

db.connect(err => {
  if (err) {
    console.error('Erreur connexion MySQL:', err);
    return;
  }
  console.log('Connecté à la base Railway !');
});

module.exports = db;
