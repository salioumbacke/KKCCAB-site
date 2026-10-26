const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const router = express.Router();

const fichier = path.join(__dirname, "../../data/site.json");
const dossierUploads = path.join(__dirname, "../../public/uploads");

fs.mkdirSync(dossierUploads, { recursive: true });

// ==========================================
// FORMATS AUTORISÉS
// ==========================================

const typesAutorises = {
  photo: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ],

  video: [
    "video/mp4",
    "video/webm"
  ],

  audio: [
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/x-wav"
  ]
};

// ==========================================
// LECTURE ET ENREGISTREMENT DES DONNÉES
// ==========================================

function lireDonnees() {
  return JSON.parse(fs.readFileSync(fichier, "utf8"));
}

function enregistrerDonnees(d) {
  fs.writeFileSync(
    fichier,
    JSON.stringify(d, null, 2),
    "utf8"
  );
}

// ==========================================
// TITRE FACULTATIF
// Si aucun titre n'est saisi, utiliser le nom
// du fichier sans son extension.
// ==========================================

function creerTitreMedia(titre, nomOriginal) {
  const titreSaisi = String(titre || "").trim();

  if (titreSaisi) {
    return titreSaisi.slice(0, 200);
  }

  const nomFichier = path
    .parse(nomOriginal || "")
    .name
    .replace(/[_-]+/g, " ")
    .trim();

  return (nomFichier || "Média sans titre").slice(0, 200);
}

// ==========================================
// AUTORISATION
// ==========================================

function autoriser(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({
      erreur:
        "Connecte-toi au back-office avant d'ajouter un média."
    });
  }

  if (!["admin", "editeur"].includes(req.session.user.role)) {
    return res.status(403).json({
      erreur: "Tu n'as pas l'autorisation."
    });
  }

  next();
}

// ==========================================
// STOCKAGE DES FICHIERS
// ==========================================

const stockage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, dossierUploads);
  },

  filename: (_req, file, cb) => {
    cb(
      null,
      crypto.randomUUID() +
        path.extname(file.originalname).toLowerCase()
    );
  }
});

const upload = multer({
  storage: stockage,

  limits: {
    fileSize: 100 * 1024 * 1024
  },

  fileFilter: (req, file, cb) => {
    const type = req.body.type;

    if (!typesAutorises[type]?.includes(file.mimetype)) {
      return cb(
        new Error("Format de fichier non autorisé.")
      );
    }

    cb(null, true);
  }
});

// ==========================================
// LECTURE DES MÉDIAS
// GET /api/medias
// ==========================================

router.get("/", (_req, res) => {
  try {
    const d = lireDonnees();

    res.json({
      galerie: Array.isArray(d.galerie)
        ? d.galerie
        : [],

      khassidas: Array.isArray(d.khassidas)
        ? d.khassidas
        : [],

      guideVideoUrl: d.guideVideoUrl || "",
      guideVideoTitre: d.guideVideoTitre || ""
    });
  } catch (e) {
    console.error("Erreur lecture médias :", e);

    res.status(500).json({
      erreur: "Impossible de lire les médias."
    });
  }
});

// ==========================================
// AJOUT D'UN MÉDIA
// POST /api/medias
// ==========================================

router.post("/", autoriser, (req, res) =>
  upload.single("fichier")(req, res, err => {
    if (err) {
      return res.status(400).json({
        erreur:
          err.code === "LIMIT_FILE_SIZE"
            ? "Fichier trop volumineux. Maximum : 100 Mo."
            : err.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        erreur: "Sélectionne un fichier."
      });
    }

    const cheminFichier = req.file.path;

    try {
      const {
        type,
        titre,
        description,
        sectionId,
        edition
      } = req.body;

      if (!["photo", "video", "audio"].includes(type)) {
        fs.unlinkSync(cheminFichier);

        return res.status(400).json({
          erreur: "Type invalide."
        });
      }

      const d = lireDonnees();

      if (!Array.isArray(d.galerie)) {
        d.galerie = [];
      }

      if (!Array.isArray(d.khassidas)) {
        d.khassidas = [];
      }

      const url = "/uploads/" + req.file.filename;

      // Le titre n'est plus obligatoire.
      // Si le champ est vide, on utilise le nom du fichier.
      const nom = creerTitreMedia(
        titre,
        req.file.originalname
      );

      const descriptionFinale = String(
        description || ""
      ).slice(0, 2000);

      const editionFinale = String(
        edition || ""
      ).trim();

      let activite = null;

      // Rubriques qui ne sont pas des activités.
      const sectionsSpeciales = [
  "galerie",
  "presentation",
  "guide",
  "guide-discours",
  "membres"
];

      if (
        sectionId &&
        !sectionsSpeciales.includes(sectionId)
      ) {
        activite = (d.activites || []).find(
          a => a.id === sectionId
        );

        if (!activite) {
          fs.unlinkSync(cheminFichier);

          return res.status(404).json({
            erreur: "Rubrique d'activité introuvable."
          });
        }
      }

      // ======================================
      // VIDÉO DU DISCOURS DU GUIDE
      // ======================================

      if (sectionId === "guide-discours") {
        if (type !== "video") {
          fs.unlinkSync(cheminFichier);

          return res.status(400).json({
            erreur:
              "Cette rubrique accepte uniquement une vidéo."
          });
        }

        d.guideVideoUrl = url;
        d.guideVideoTitre = nom;
      }

      // ======================================
      // PHOTOS DE PRÉSENTATION ET DU GUIDE
      // ======================================

      else if (
        sectionId === "presentation" ||
        sectionId === "guide"
      ) {
        if (type !== "photo") {
          fs.unlinkSync(cheminFichier);

          return res.status(400).json({
            erreur:
              "Cette rubrique accepte uniquement une photo."
          });
        }

        if (sectionId === "presentation") {
          d.presentationImageUrl = url;
        } else {
          if (!Array.isArray(d.guidePhotos)) {
            d.guidePhotos = [];
          }

          d.guidePhotos.push(url);

          if (!d.guidePhotoUrl) {
            d.guidePhotoUrl = url;
          }
        }
      }

      // ======================================
      // MÉDIAS ASSOCIÉS AUX ACTIVITÉS
      // ======================================

      else if (activite && type === "photo") {
        activite.image = url;
      }

      else if (activite && type === "video") {
        if (!Array.isArray(activite.videos)) {
          activite.videos = [];
        }

        activite.videos.push({
          id: crypto.randomUUID(),
          titre: nom,
          url,
          image: "",
          meta:
            editionFinale ||
            descriptionFinale ||
            "Vidéo du Daara",
          edition: editionFinale,
          sectionId: activite.id
        });
      }

      // ======================================
      // ENREGISTRER LE MÉDIA
      // ======================================

      const media = {
        id: crypto.randomUUID(),
        type,
        titre: nom,
        description: descriptionFinale,
        url,
        dateAjout: new Date().toISOString(),
        sectionId: sectionId || "galerie",
        edition: editionFinale
      };

      if (type === "audio") {
        d.khassidas.push(media);
      } else {
        d.galerie.push(media);
      }

      enregistrerDonnees(d);

      return res.status(201).json({
        message: "Média ajouté avec succès.",
        media,
        presentationImageUrl:
          d.presentationImageUrl || "",
        guideVideoUrl:
          d.guideVideoUrl || "",
        guideVideoTitre:
          d.guideVideoTitre || "",
        activite
      });

    } catch (e) {
      console.error(
        "Erreur enregistrement média :",
        e
      );

      if (fs.existsSync(cheminFichier)) {
        fs.unlinkSync(cheminFichier);
      }

      return res.status(500).json({
        erreur: "Impossible d'enregistrer le média."
      });
    }
  })
);

// ==========================================
// SUPPRESSION D'UN MÉDIA
// DELETE /api/medias/:id
// ==========================================

router.delete("/:id", autoriser, (req, res) => {
  try {
    const d = lireDonnees();

    if (!Array.isArray(d.galerie)) {
      d.galerie = [];
    }

    if (!Array.isArray(d.khassidas)) {
      d.khassidas = [];
    }

    let media = null;

    for (const liste of [d.galerie, d.khassidas]) {
      const index = liste.findIndex(
        x => x.id === req.params.id
      );

      if (index !== -1) {
        media = liste.splice(index, 1)[0];
        break;
      }
    }

    if (!media) {
      return res.status(404).json({
        erreur: "Média introuvable."
      });
    }

    // ======================================
    // RETIRER LES ASSOCIATIONS AUX ACTIVITÉS
    // ======================================

    for (const a of d.activites || []) {
      if (a.image === media.url) {
        a.image = "";
      }

      if (Array.isArray(a.videos)) {
        a.videos = a.videos.filter(
          v => v.url !== media.url
        );
      }
    }

    // ======================================
    // RETIRER LES ASSOCIATIONS AUX PHOTOS
    // ======================================

    if (d.presentationImageUrl === media.url) {
      d.presentationImageUrl =
        "images/presentation.jpg";
    }

    if (Array.isArray(d.guidePhotos)) {
      d.guidePhotos = d.guidePhotos.filter(
        url => url !== media.url
      );
    }

    if (d.guidePhotoUrl === media.url) {
      d.guidePhotoUrl =
        d.guidePhotos[0] || "images/guide-1.jpg";
    }

    // ======================================
    // RETIRER L'ASSOCIATION AVEC LE DISCOURS
    // ======================================

    if (d.guideVideoUrl === media.url) {
      d.guideVideoUrl = "";
      d.guideVideoTitre = "";
    }

    enregistrerDonnees(d);

    // ======================================
    // SUPPRIMER LE FICHIER DU DISQUE
    // ======================================

    if (media.url?.startsWith("/uploads/")) {
      const target = path.join(
        dossierUploads,
        path.basename(media.url)
      );

      if (fs.existsSync(target)) {
        fs.unlinkSync(target);
      }
    }

    return res.json({
      message: "Média supprimé avec succès."
    });

  } catch (e) {
    console.error(
      "Erreur suppression média :",
      e
    );

    return res.status(500).json({
      erreur: "Impossible de supprimer le média."
    });
  }
});

module.exports = router;