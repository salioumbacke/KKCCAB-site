
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const router = express.Router();

const dossierDonnees = path.join(__dirname, "../../data");
const fichierMessages = path.join(dossierDonnees, "messages.json");

function initialiserFichier() {
  if (!fs.existsSync(dossierDonnees)) {
    fs.mkdirSync(dossierDonnees, { recursive: true });
  }

  if (!fs.existsSync(fichierMessages)) {
    fs.writeFileSync(fichierMessages, "[]", "utf8");
  }
}

function lireMessages() {
  initialiserFichier();
  const contenu = fs.readFileSync(fichierMessages, "utf8");
  const messages = JSON.parse(contenu || "[]");

  if (!Array.isArray(messages)) {
    throw new Error("Le fichier doit contenir une liste.");
  }

  return messages;
}

function enregistrerMessages(messages) {
  initialiserFichier();

  const temporaire = fichierMessages + ".tmp";
  fs.writeFileSync(temporaire, JSON.stringify(messages, null, 2), "utf8");
  fs.renameSync(temporaire, fichierMessages);
}

function texteValide(valeur, maximum) {
  return typeof valeur === "string" &&
    valeur.trim().length > 0 &&
    valeur.trim().length <= maximum;
}

function verifierAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ erreur: "Connexion obligatoire." });
  }

  if (!["admin", "editeur"].includes(req.session.user.role)) {
    return res.status(403).json({
      erreur: "Tu n'es pas autorisé à consulter ces demandes."
    });
  }

  next();
}

// ENREGISTRER UN CONTACT OU UNE DEMANDE D'ADHÉSION
router.post("/", (req, res) => {
  try {
    const corps = req.body || {};
    const type = corps.type;

    if (!["contact", "adhesion"].includes(type)) {
      return res.status(400).json({ erreur: "Type de demande invalide." });
    }

    const nom = typeof corps.nom === "string" ? corps.nom.trim() : "";
    const telephone = typeof corps.telephone === "string"
      ? corps.telephone.trim()
      : "";
    const sujet = typeof corps.sujet === "string" ? corps.sujet.trim() : "";
    const message = typeof corps.message === "string"
      ? corps.message.trim()
      : "";

    if (!texteValide(nom, 120)) {
      return res.status(400).json({ erreur: "Nom obligatoire." });
    }

    if (!texteValide(telephone, 40)) {
      return res.status(400).json({ erreur: "Téléphone obligatoire." });
    }

   

    if (type === "contact" && !texteValide(sujet, 160)) {
      return res.status(400).json({ erreur: "Objet de la demande obligatoire." });
    }

    const messages = lireMessages();

    const demande = {
      id: crypto.randomUUID(),
      type,
      nom,
      telephone,
      sujet: type === "contact" ? sujet : "Demande d'adhésion au Daara",
      message,
      date: new Date().toISOString()
    };

    messages.unshift(demande);
    enregistrerMessages(messages);

    return res.status(201).json({
      message: "Votre demande a bien été enregistrée.",
      demande
    });
  } catch (erreur) {
    console.error("Erreur enregistrement :", erreur.message);
    return res.status(500).json({
      erreur: "Impossible d'enregistrer votre demande pour le moment."
    });
  }
});

// CONSULTER LES DEMANDES — BACK-OFFICE UNIQUEMENT
router.get("/", verifierAdmin, (req, res) => {
  try {
    const type = req.query.type;

    if (type && !["contact", "adhesion"].includes(type)) {
      return res.status(400).json({ erreur: "Type invalide." });
    }

    const messages = lireMessages();
    const resultat = type
      ? messages.filter(item => item.type === type)
      : messages;

    return res.json({ messages: resultat });
  } catch (erreur) {
    console.error("Erreur lecture :", erreur.message);
    return res.status(500).json({ erreur: "Impossible de lire les demandes." });
  }
});

// SUPPRIMER UNE DEMANDE — BACK-OFFICE UNIQUEMENT
router.delete("/:id", verifierAdmin, (req, res) => {
  try {
    const messages = lireMessages();
    const index = messages.findIndex(item => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ erreur: "Demande introuvable." });
    }

    messages.splice(index, 1);
    enregistrerMessages(messages);

    return res.json({ message: "Demande supprimée." });
  } catch (erreur) {
    console.error("Erreur suppression :", erreur.message);
    return res.status(500).json({ erreur: "Impossible de supprimer la demande." });
  }
});


/* ACCEPTER UNE DEMANDE D'ADHÉSION */
router.patch("/:id/accepter", verifierAdmin, (req, res) => {
  try {
    const messages = lireMessages();
    const demande = messages.find(
      item => item.id === req.params.id && item.type === "adhesion"
    );

    if (!demande) {
      return res.status(404).json({
        erreur: "Demande d'adhésion introuvable."
      });
    }

    demande.statut = "acceptee";
    enregistrerMessages(messages);

    return res.json({
      message: "Demande d'adhésion acceptée.",
      demande
    });
  } catch (erreur) {
    console.error("Erreur d'acceptation :", erreur.message);
    return res.status(500).json({
      erreur: "Impossible d'accepter cette demande."
    });
  }
});


module.exports = router;
