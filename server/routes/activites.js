const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const fichier = path.join(__dirname, "../../data/site.json");
const fichierJournal = path.join(__dirname, "../../data/activity-log.json");

const activitesOriginales = [
  {
    "id": "activite-seances-khassida",
    "titre": "Séances de Khassida",
    "description": "Chaque semaine, le Kourel se réunit pour des séances collectives de récitation des Khassida, dans une ambiance de fraternité et de dévotion.",
    "date": "",
    "frequence": "Hebdomadaire",
    "lieu": "Dakar",
    "image": "images/activites/seances-khassida.jpg",
    "icone": "fa-music",
    "videos": [
      {
        "titre": "Récitation collective — Séance du vendredi",
        "url": "videos/seance-vendredi.mp4",
        "image": "images/videos/seance-vendredi.jpg",
        "meta": "Vidéo locale • 2025"
      },
      {
        "titre": "Zikr collectif — Soirée spirituelle",
        "url": "videos/zikr-collectif.mp4",
        "image": "images/videos/zikr-collectif.jpg",
        "meta": "Vidéo locale • 2025"
      },
      {
        "titre": "Étude des Khassida — Session pédagogique",
        "url": "videos/etude-khassida.mp4",
        "image": "images/videos/etude-khassida.jpg",
        "meta": "Vidéo locale • 2024"
      }
    ]
  },
  {
    "id": "activite-magal-touba",
    "titre": "Magal de Touba",
    "description": "Participation au grand Magal de Touba, pèlerinage annuel commémorant le départ en exil de Cheikh Ahmadou Bamba.",
    "date": "",
    "frequence": "Annuel",
    "lieu": "Touba",
    "image": "images/activites/magal-touba.jpg",
    "icone": "fa-mosque",
    "videos": [
      {
        "titre": "Magal 2024 — Prestation du Kourel",
        "url": "videos/magal-2024.mp4",
        "image": "images/videos/magal-2024.jpg",
        "meta": "Vidéo locale • 2024"
      },
      {
        "titre": "Discours du Guide — Magal 2025",
        "url": "videos/discours-magal-2025.mp4",
        "image": "images/videos/discours-magal-2025.jpg",
        "meta": "Vidéo locale • 2025"
      },
      {
        "titre": "Magal 2023 — Moments forts",
        "url": "videos/magal-2023.mp4",
        "image": "images/videos/magal-2023.jpg",
        "meta": "Vidéo locale • 2023"
      }
    ]
  },
  {
    "id": "activite-siar-annuel",
    "titre": "Siar annuel",
    "description": "Le Daara organise son grand Siar (ziarra) sur les champs de Serigne Mahamadane à Diatt Mbay (Ngaye).",
    "date": "",
    "frequence": "Annuel",
    "lieu": "Diatt Mbay",
    "image": "images/activites/siar-annuel.jpg",
    "icone": "fa-leaf",
    "videos": [
      {
        "titre": "Siar 2023 — Édition 1",
        "url": "videos/siar-2023.mp4",
        "image": "images/videos/siar-2023.jpg",
        "meta": "Vidéo locale • 2023"
      },
      {
        "titre": "Siar 2024 — Édition 2 (Diatt Mbay)",
        "url": "videos/siar-2024.mp4",
        "image": "images/videos/siar-2024.jpg",
        "meta": "Vidéo locale • 2024"
      },
      {
        "titre": "Sur les champs de Ngaye — Reportage",
        "url": "videos/siar-ngaye.mp4",
        "image": "images/videos/siar-ngaye.jpg",
        "meta": "Vidéo locale • 2024"
      }
    ]
  },
  {
    "id": "activite-journee-khassida",
    "titre": "Journée Khassida",
    "description": "Une journée entière dédiée à la récitation des Khassida au cœur de Dakar. Ouvert à tous les mourides.",
    "date": "",
    "frequence": "Annuel",
    "lieu": "Dakar",
    "image": "images/activites/journee-khassida.jpg",
    "icone": "fa-book-open",
    "videos": [
      {
        "titre": "Journée Khassida 2023 — Édition 1",
        "url": "videos/journee-2023.mp4",
        "image": "images/videos/journee-2023.jpg",
        "meta": "Vidéo locale • 2023"
      },
      {
        "titre": "Journée Khassida 2024 — Édition 2",
        "url": "videos/journee-2024.mp4",
        "image": "images/videos/journee-2024.jpg",
        "meta": "Vidéo locale • 2024"
      },
      {
        "titre": "Prestation Dakar — Récitation publique",
        "url": "videos/journee-dakar.mp4",
        "image": "images/videos/journee-dakar.jpg",
        "meta": "Vidéo locale • 2024"
      }
    ]
  }
];
function lireDonnees() { return JSON.parse(fs.readFileSync(fichier, "utf8")); }
function enregistrerDonnees(donnees) { fs.writeFileSync(fichier, JSON.stringify(donnees, null, 2), "utf8"); }
function exigerConnexion(req, res, next) {
  if (!req.session || !req.session.user) return res.status(401).json({ erreur: "Connexion administrateur requise." });
  next();
}
function exigerRole(req, res, next) {
  if (!["admin", "editeur"].includes(req.session.user.role)) return res.status(403).json({ erreur: "Tu n'es pas autorisé à gérer les activités." });
  next();
}
function journaliser(req, action) {
  let journal = [];
  try { journal = JSON.parse(fs.readFileSync(fichierJournal, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  journal.push({ id: Date.now().toString(), email: req.session.user.email, action, date: new Date().toISOString() });
  fs.writeFileSync(fichierJournal, JSON.stringify(journal, null, 2), "utf8");
}
function assurerActivitesOriginales(donnees) {
  if (!Array.isArray(donnees.activites)) donnees.activites = [];
  // Restaurer les activités de base si la liste est vide (évite une section publique vide après une ancienne initialisation incomplète).
  let modifie = false;
  if (donnees.activites.length === 0) {
    donnees.activites = JSON.parse(JSON.stringify(activitesOriginales));
    modifie = true;
  } else if (donnees.activitesInitialisees !== true) {
    for (const originale of activitesOriginales) {
      if (!donnees.activites.some(a => a.id === originale.id)) {
        donnees.activites.unshift(JSON.parse(JSON.stringify(originale)));
        modifie = true;
      }
    }
  }
  donnees.activitesInitialisees = true;
  if (modifie) enregistrerDonnees(donnees);
  return donnees.activites;
}
function valider(req, res, next) {
  const { titre, description } = req.body || {};
  if (typeof titre !== "string" || !titre.trim() || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ erreur: "Le titre et la description sont obligatoires." });
  }
  next();
}
router.get("/", (req, res) => {
  try { res.json(assurerActivitesOriginales(lireDonnees())); }
  catch (error) { console.error("Lecture activités :", error.message); res.status(500).json({ erreur: "Lecture impossible." }); }
});
router.post("/", exigerConnexion, exigerRole, valider, (req, res) => {
  try {
    const donnees = lireDonnees();
    if (!Array.isArray(donnees.activites)) donnees.activites = [];
    const b = req.body;
    const activite = { id: Date.now().toString(), titre: b.titre.trim(), description: b.description.trim(), date: typeof b.date === "string" ? b.date : "", frequence: typeof b.frequence === "string" ? b.frequence.trim() : "", lieu: typeof b.lieu === "string" ? b.lieu.trim() : "", image: typeof b.image === "string" ? b.image.trim() : "", icone: typeof b.icone === "string" ? b.icone.trim() : "fa-calendar", videos: Array.isArray(b.videos) ? b.videos : [] };
    donnees.activites.push(activite); enregistrerDonnees(donnees);
    try { journaliser(req, "Ajout d'une activité : " + activite.titre); } catch (e) { console.error("Journal :", e.message); }
    res.status(201).json({ message: "Activité enregistrée.", activites: donnees.activites, activite });
  } catch (error) { console.error("Erreur activité :", error.message); res.status(500).json({ erreur: "Enregistrement impossible." }); }
});
router.put("/:id", exigerConnexion, exigerRole, valider, (req, res) => {
  try {
    const donnees = lireDonnees();
    const i = (donnees.activites || []).findIndex(a => a.id === req.params.id);
    if (i < 0) return res.status(404).json({ erreur: "Activité introuvable." });
    const b = req.body, old = donnees.activites[i];
    donnees.activites[i] = { ...old, titre: b.titre.trim(), description: b.description.trim(), date: typeof b.date === "string" ? b.date : "", frequence: typeof b.frequence === "string" ? b.frequence.trim() : "", lieu: typeof b.lieu === "string" ? b.lieu.trim() : "", image: typeof b.image === "string" ? b.image.trim() : "", icone: typeof b.icone === "string" ? b.icone.trim() : (old.icone || "fa-calendar"), videos: Array.isArray(b.videos) ? b.videos : (old.videos || []) };
    enregistrerDonnees(donnees);
    try { journaliser(req, "Modification d'une activité : " + donnees.activites[i].titre); } catch (e) { console.error("Journal :", e.message); }
    res.json({ message: "Activité modifiée.", activites: donnees.activites });
  } catch (error) { console.error("Modification activité :", error.message); res.status(500).json({ erreur: "Modification impossible." }); }
});
router.delete("/:id", exigerConnexion, exigerRole, (req, res) => {
  try {
    const donnees = lireDonnees();
    const i = (donnees.activites || []).findIndex(a => a.id === req.params.id);
    if (i < 0) return res.status(404).json({ erreur: "Activité introuvable." });
    const [supprimee] = donnees.activites.splice(i, 1);
    enregistrerDonnees(donnees);
    try { journaliser(req, "Suppression d'une activité : " + supprimee.titre); } catch (e) { console.error("Journal :", e.message); }
    res.json({ message: "Activité supprimée.", activites: donnees.activites });
  } catch (error) { console.error("Suppression activité :", error.message); res.status(500).json({ erreur: "Suppression impossible." }); }
});
module.exports = router;
