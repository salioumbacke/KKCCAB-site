const express = require("express");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const fichierUtilisateurs = path.join(__dirname, "../../data/users.json");
const fichierJournal = path.join(__dirname, "../../data/activity-log.json");

function lireUtilisateurs() {
  return JSON.parse(fs.readFileSync(fichierUtilisateurs, "utf8"));
}


function estSuperAdmin(req) {
  return Boolean(
    req.session &&
    req.session.user &&
    req.session.user.id &&
    req.session.user.id === process.env.SUPER_ADMIN_ID
  );
}


function verifierSuperAdmin(req, res, next) {
  if (!estSuperAdmin(req)) {
    return res.status(403).json({
      erreur: "Action réservée à l'administrateur principal."
    });
  }

  next();
}



function enregistrerActivite(email, action) {
  let journal = [];

  try {
    journal = JSON.parse(fs.readFileSync(fichierJournal, "utf8"));
  } catch (erreur) {
    if (erreur.code !== "ENOENT") {
      throw erreur;
    }
  }

  journal.push({
    id: Date.now().toString(),
    email,
    action,
    date: new Date().toISOString()
  });

  fs.writeFileSync(
    fichierJournal,
    JSON.stringify(journal, null, 2),
    "utf8"
  );
}

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const motDePasse = String(req.body.motDePasse || "");

    if (!email || !motDePasse) {
      return res.status(400).json({
        erreur: "E-mail et mot de passe obligatoires."
      });
    }

    const utilisateurs = lireUtilisateurs();

    const utilisateur = utilisateurs.find(
      u => u.email.toLowerCase() === email
    );

    
    if (utilisateur && utilisateur.suspendu === true) {
      return res.status(403).json({
        erreur: "Ce compte est suspendu. Contacte l'administrateur."
      });
    }


    if (
      !utilisateur ||
      !(await bcrypt.compare(
        motDePasse,
        utilisateur.motDePasseHash
      ))
    ) {
      return res.status(401).json({
        erreur: "E-mail ou mot de passe incorrect."
      });
    }

    req.session.regenerate(err => {
      if (err) {
        return res.status(500).json({
          erreur: "Impossible de démarrer la session."
        });
      }

      req.session.user = {
        id: utilisateur.id,
        nom: utilisateur.nom,
        email: utilisateur.email,
        role: utilisateur.role
      };

      req.session.save(err => {
        if (err) {
          return res.status(500).json({
            erreur: "Impossible d'enregistrer la session."
          });
        }

        try {
          enregistrerActivite(email, "Connexion");
        } catch (erreurJournal) {
          console.error("Erreur du journal :", erreurJournal.message);
        }

        return res.json({
          message: "Connexion réussie."
        });
      });
    });
  } catch (erreur) {
    console.error("Erreur de connexion :", erreur.message);

    return res.status(500).json({
      erreur: "Erreur interne lors de la connexion."
    });
  }
});


router.get("/comptes", verifierSuperAdmin, (req, res) => {
  try {
    const utilisateurs = lireUtilisateurs();

    const comptes = utilisateurs.map(utilisateur => ({
      id: utilisateur.id,
      nom: utilisateur.nom,
      email: utilisateur.email,
      role: utilisateur.role,
      suspendu: utilisateur.suspendu === true
    }));

    return res.json(comptes);
  } catch (erreur) {
    console.error("Erreur de lecture des comptes :", erreur.message);

    return res.status(500).json({
      erreur: "Impossible de charger les comptes."
    });
  }
});

module.exports = router;