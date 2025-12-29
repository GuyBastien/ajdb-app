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
// Promisifier les requêtes correctement
const util = require('util');
const query = util.promisify(db.query).bind(db);

db.connect(err => {
  if (err) {
    console.error('Erreur connexion MySQL:', err);
    return;
  }
  console.log('Connecté à la base Railway !');
});

// Exporte à la fois la connexion et la fonction query promise
module.exports = { db, query };
