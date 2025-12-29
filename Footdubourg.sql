CREATE DATABASE IF NOT EXISTS footdubourg;
USE footdubourg;

-- 1. Table EQUIPES
CREATE TABLE `equipes` (
  `ID_Equipe` int NOT NULL AUTO_INCREMENT,
  `nomEquipe` varchar(100) NOT NULL,
  `nombre_joueurs` int DEFAULT '0',
  `ville` varchar(100) DEFAULT NULL,
  `coach` varchar(100) DEFAULT NULL,
  `president` varchar(100) DEFAULT NULL,
  `logo` varchar(255) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ID_Equipe`),
  UNIQUE KEY `nomEquipe` (`nomEquipe`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Table BUTEURS
CREATE TABLE `buteurs` (
  `Id_buteur` int NOT NULL AUTO_INCREMENT,
  `nom` varchar(50) NOT NULL,
  `prenom` varchar(50) NOT NULL,
  `ID_equipe` int DEFAULT NULL,
  `nombre_buts` int DEFAULT '0',
  `passes_decisives` int DEFAULT '0',
  PRIMARY KEY (`Id_buteur`),
  KEY `ID_equipe` (`ID_equipe`),
  CONSTRAINT `buteurs_ibfk_1` FOREIGN KEY (`ID_equipe`) REFERENCES `equipes` (`ID_Equipe`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Table JOUEURS
CREATE TABLE `joueurs` (
  `Id_joueur` int NOT NULL AUTO_INCREMENT,
  `id_buteur` int DEFAULT NULL,
  `nom` varchar(50) NOT NULL,
  `prenom` varchar(50) NOT NULL,
  `age` int DEFAULT NULL,
  `telephone` varchar(20) DEFAULT NULL,
  `reseaux_sociaux` text,
  `maladie_courante` text,
  `ID_Equipe` int DEFAULT NULL,
  `poste` varchar(50) DEFAULT NULL,
  `numero` int DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`Id_joueur`),
  UNIQUE KEY `id_buteur` (`id_buteur`),
  KEY `ID_Equipe` (`ID_Equipe`),
  CONSTRAINT `joueurs_ibfk_1` FOREIGN KEY (`ID_Equipe`) REFERENCES `equipes` (`ID_Equipe`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Table MATCHS
CREATE TABLE `matchs` (
  `Id_Match` int NOT NULL AUTO_INCREMENT,
  `Equipe1` int NOT NULL,
  `Equipe2` int NOT NULL,
  `Arbitre_principal` varchar(100) DEFAULT NULL,
  `Arbitre_de_touche` varchar(100) DEFAULT NULL,
  `Lieu` varchar(100) DEFAULT NULL,
  `Date_heure` datetime DEFAULT NULL,
  `Score_Equipe1` int DEFAULT '0',
  `Score_Equipe2` int DEFAULT '0',
  `statut` varchar(20) DEFAULT 'prévu',
  PRIMARY KEY (`Id_Match`),
  KEY `Equipe1` (`Equipe1`),
  KEY `Equipe2` (`Equipe2`),
  CONSTRAINT `matchs_ibfk_1` FOREIGN KEY (`Equipe1`) REFERENCES `equipes` (`ID_Equipe`) ON DELETE CASCADE,
  CONSTRAINT `matchs_ibfk_2` FOREIGN KEY (`Equipe2`) REFERENCES `equipes` (`ID_Equipe`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Table MATCH_EVENTS
CREATE TABLE `match_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `match_id` int NOT NULL,
  `type` varchar(50) NOT NULL,
  `player_id` int DEFAULT NULL,
  `minute` int DEFAULT NULL,
  `team_id` int DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `match_id` (`match_id`),
  KEY `player_id` (`player_id`),
  KEY `team_id` (`team_id`),
  CONSTRAINT `match_events_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `matchs` (`Id_Match`) ON DELETE CASCADE,
  CONSTRAINT `match_events_ibfk_2` FOREIGN KEY (`player_id`) REFERENCES `joueurs` (`Id_joueur`) ON DELETE SET NULL,
  CONSTRAINT `match_events_ibfk_3` FOREIGN KEY (`team_id`) REFERENCES `equipes` (`ID_Equipe`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Table MATCH_PLAYER_STATS
CREATE TABLE `match_player_stats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `match_id` int NOT NULL,
  `player_id` int NOT NULL,
  `team_id` int DEFAULT NULL,
  `goals` int DEFAULT '0',
  `assists` int DEFAULT '0',
  `yellow_cards` int DEFAULT '0',
  `red_cards` int DEFAULT '0',
  `minutes_played` int DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `match_id` (`match_id`),
  KEY `player_id` (`player_id`),
  CONSTRAINT `match_player_stats_ibfk_1` FOREIGN KEY (`match_id`) REFERENCES `matchs` (`Id_Match`) ON DELETE CASCADE,
  CONSTRAINT `match_player_stats_ibfk_2` FOREIGN KEY (`player_id`) REFERENCES `joueurs` (`Id_joueur`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 7. Table STATS (Classement)
CREATE TABLE `stats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `equipe_id` int NOT NULL,
  `saison` varchar(20) DEFAULT NULL,
  `competition` varchar(50) DEFAULT NULL,
  `matches_played` int DEFAULT '0',
  `wins` int DEFAULT '0',
  `draws` int DEFAULT '0',
  `losses` int DEFAULT '0',
  `goals_for` int DEFAULT '0',
  `goals_against` int DEFAULT '0',
  `points` int DEFAULT '0',
  `yellow_cards` int DEFAULT '0',
  `red_cards` int DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `equipe_id` (`equipe_id`,`saison`,`competition`),
  CONSTRAINT `stats_ibfk_1` FOREIGN KEY (`equipe_id`) REFERENCES `equipes` (`ID_Equipe`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 8. Table UTILISATEURS
CREATE TABLE `utilisateurs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nom_utilisateur` varchar(50) NOT NULL,
  `mot_de_passe` varchar(255) NOT NULL,
  `role` varchar(20) DEFAULT 'user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `nom_utilisateur` (`nom_utilisateur`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE utilisateurs ADD COLUMN role VARCHAR(20) DEFAULT 'user';

-- 1. On donne les droits admin à 'Barca' (qui est déjà dans ton fichier SQL)
UPDATE utilisateurs SET role = 'admin' WHERE nom_utilisateur = 'Barca';

-- 2. On crée le deuxième admin 
INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) 
VALUES ('Admin_Foot', 'admin2@foot.com', 'mot_de_passe_securise', 'admin');

INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe, role) VALUES 
('Admin1', 'admin1@gmail.com', 'pass123', 'admin'),
('Admin2', 'admin2@gmail.com', 'pass456', 'admin');