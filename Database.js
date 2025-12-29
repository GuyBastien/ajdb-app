const mysql = require('mysql');

const db = mysql.createConnection(process.env.MYSQL_URL || {
    host: "localhost",
    user: "root",
    password: "",
    database: "Bastien030#"
});

db.connect(err => {
  if (err) {
    console.error('Erreur connexion MySQL:', err);
    return;
  }
  console.log('Connecté à MySQL');
});

module.exports = db;

//Ctrl + Shift + ~ pour ouvrir le terminal intégré dans VS Code
//npm install mysql pour installer le package mysql
//node Application/Database.js pour tester la connexion
//npm install dotenv pour installer le package dotenv
//Créer un fichier .env à la racine du projet pour stocker les variables d'environnement
//Ajouter .env dans le fichier .gitignore pour ne pas versionner les variables sensibles
//Modifier Application/Database.js pour utiliser les variables d'environnement
