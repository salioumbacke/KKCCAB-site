
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const fichier = path.join(__dirname, "../../data/activity-log.json");

function exigerAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      erreur: "Connexion administrateur requise."
    });
  }

  next();
}

router.get("/", exigerAdmin, (req, res) => {
  try {
    if (!fs.existsSync(fichier)) {
      return res.json([]);
    }

    const journal = JSON.parse(fs.readFileSync(fichier, "utf8"));

    if (!Array.isArray(journal)) {
      return res.status(500).json({
        erreur: "Format du journal invalide."
      });
    }

    res.json(journal.slice().reverse());
  } catch (error) {
    console.error("Erreur journal :", error.message);
    res.status(500).json({
      erreur: "Lecture du journal impossible."
    });
  }
});

module.exports = router;
