
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const cloudinary = require("../cloudinary");

const router = express.Router();
const fichier = path.join(__dirname, "../../data/site.json");

// ==========================================
// FORMATS AUTORISÉS
// ==========================================

const typesAutorises = {
  photo: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  video: ["video/mp4", "video/webm"],
  audio: [
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/x-wav",
    "audio/aac",
    "audio/flac",
    "audio/opus",
    "audio/3gpp",
    "audio/x-m4a"
  ]
};

// ==========================================
// LECTURE ET ENREGISTREMENT
// ==========================================

function lireDonnees() {
  return JSON.parse(fs.readFileSync(fichier, "utf8"));
}

function enregistrerDonnees(d) {
  fs.writeFileSync(fichier, JSON.stringify(d, null, 2), "utf8");
}

// ==========================================
// OUTILS
// ==========================================

function creerTitreMedia(titre, nomOriginal) {
  const titreSaisi = String(titre || "").trim();

  if (titreSaisi) return titreSaisi.slice(0, 200);

  const nomFichier = path
    .parse(nomOriginal || "")
    .name.replace(/[_-]+/g, " ")
    .trim();

  return (nomFichier || "Média sans titre").slice(0, 200);
}

function obtenirResourceType(type) {
  // Cloudinary traite les vidéos et les fichiers audio
  // avec resource_type "video".
  return type === "photo" ? "image" : "video";
}

function verifierConfigurationCloudinary() {
  const config = cloudinary.config();

  const manquants = [];

  if (!config.cloud_name) manquants.push("CLOUDINARY_CLOUD_NAME");
  if (!config.api_key) manquants.push("CLOUDINARY_API_KEY");
  if (!config.api_secret) manquants.push("CLOUDINARY_API_SECRET");

  if (manquants.length) {
    throw new Error(
      "Variables Cloudinary manquantes : " + manquants.join(", ")
    );
  }
}

// ==========================================
// AUTORISATION
// ==========================================

function autoriser(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({
      erreur: "Connecte-toi au back-office avant de gérer les médias."
    });
  }

  if (!["admin", "editeur"].includes(req.session.user.role)) {
    return res.status(403).json({
      erreur: "Tu n'as pas l'autorisation de gérer les médias."
    });
  }

  next();
}

// ==========================================
// UPLOAD TEMPORAIRE EN MÉMOIRE
// ==========================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const formats = Object.values(typesAutorises).flat();

    if (!formats.includes(file.mimetype)) {
      return cb(
        new Error("Format de fichier non autorisé : " + file.mimetype)
      );
    }

    cb(null, true);
  }
});

// ==========================================
// ENVOI VERS CLOUDINARY
// ==========================================

function envoyerVersCloudinary(file, type) {
  return new Promise((resolve, reject) => {
    try {
      verifierConfigurationCloudinary();

      const resourceType = obtenirResourceType(type);

      const options = {
        resource_type: resourceType,
        folder: "kkccab",
        public_id: crypto.randomUUID(),
        overwrite: false
      };

      const stream = cloudinary.uploader.upload_stream(
        options,
        (erreur, resultat) => {
          if (erreur) {
            return reject(erreur);
          }

          if (!resultat || !resultat.secure_url || !resultat.public_id) {
            return reject(
              new Error("Cloudinary n'a pas retourné les informations du fichier.")
            );
          }

          resolve({
            secure_url: resultat.secure_url,
            public_id: resultat.public_id,
            resource_type: resultat.resource_type || resourceType
          });
        }
      );

      stream.on("error", reject);
      stream.end(file.buffer);
    } catch (erreur) {
      reject(erreur);
    }
  });
}

// ==========================================
// LECTURE DES MÉDIAS
// GET /api/medias
// ==========================================

router.get("/", (_req, res) => {
  try {
    const d = lireDonnees();

    return res.json({
      galerie: Array.isArray(d.galerie) ? d.galerie : [],
      khassidas: Array.isArray(d.khassidas) ? d.khassidas : [],
      guideVideoUrl: d.guideVideoUrl || "",
      guideVideoTitre: d.guideVideoTitre || ""
    });
  } catch (erreur) {
    console.error("Erreur lecture médias :", erreur);

    return res.status(500).json({
      erreur: "Impossible de lire les médias."
    });
  }
});

// ==========================================
// AJOUT D'UN MÉDIA
// POST /api/medias
// ==========================================

router.post("/", autoriser, (req, res) => {
  upload.single("fichier")(req, res, async (erreurUpload) => {
    if (erreurUpload) {
      console.error("Erreur réception du fichier :", erreurUpload.message);

      return res.status(400).json({
        erreur:
          erreurUpload.code === "LIMIT_FILE_SIZE"
            ? "Fichier trop volumineux. Maximum : 100 Mo."
            : erreurUpload.message
      });
    }

    if (!req.file) {
      return res.status(400).json({
        erreur: "Sélectionne un fichier avant de l'envoyer."
      });
    }

    let resultatCloudinary = null;
    let resourceType = null;

    try {
      const { type, titre, description, sectionId, edition } = req.body;

      if (!["photo", "video", "audio"].includes(type)) {
        return res.status(400).json({
          erreur: "Type invalide. Choisis photo, vidéo ou audio."
        });
      }

      if (!typesAutorises[type]?.includes(req.file.mimetype)) {
        return res.status(400).json({
          erreur:
            "Le format du fichier ne correspond pas au type sélectionné. " +
            "Format reçu : " + req.file.mimetype
        });
      }

      resourceType = obtenirResourceType(type);

      const d = lireDonnees();

      if (!Array.isArray(d.galerie)) d.galerie = [];
      if (!Array.isArray(d.khassidas)) d.khassidas = [];
      if (!Array.isArray(d.activites)) d.activites = [];
      if (!Array.isArray(d.guidePhotos)) d.guidePhotos = [];

      const section = String(sectionId || "galerie");

      const sectionsSpeciales = [
        "galerie",
        "presentation",
        "guide",
        "guide-discours",
        "membres"
      ];

      let activite = null;

      if (!sectionsSpeciales.includes(section)) {
        activite = d.activites.find(
          a => String(a.id) === section
        );

        if (!activite) {
          return res.status(404).json({
            erreur: "Rubrique d'activité introuvable."
          });
        }
      }

      if (section === "guide-discours" && type !== "video") {
        return res.status(400).json({
          erreur: "Cette rubrique accepte uniquement une vidéo."
        });
      }

      if (
        ["presentation", "guide"].includes(section) &&
        type !== "photo"
      ) {
        return res.status(400).json({
          erreur: "Cette rubrique accepte uniquement une photo."
        });
      }

      // Envoyer le fichier à Cloudinary.
      console.log("Envoi Cloudinary :", {
        type,
        mimetype: req.file.mimetype,
        taille: req.file.size,
        section
      });

      resultatCloudinary = await envoyerVersCloudinary(req.file, type);

      const url = resultatCloudinary.secure_url;
      const publicId = resultatCloudinary.public_id;

      const nom = creerTitreMedia(titre, req.file.originalname);
      const descriptionFinale = String(description || "").slice(0, 2000);
      const editionFinale = String(edition || "").trim();

      const media = {
        id: crypto.randomUUID(),
        type,
        titre: nom,
        description: descriptionFinale,
        url,
        cloudinaryPublicId: publicId,
        cloudinaryResourceType: resultatCloudinary.resource_type,
        dateAjout: new Date().toISOString(),
        sectionId: section,
        edition: editionFinale
      };

      // Image de présentation.
      if (section === "presentation") {
        d.presentationImageUrl = url;
      }

      // Photos du guide.
      if (section === "guide") {
        d.guidePhotos.push(url);

        if (!d.guidePhotoUrl) {
          d.guidePhotoUrl = url;
        }
      }

      // Vidéo du discours du guide.
      if (section === "guide-discours") {
        d.guideVideoUrl = url;
        d.guideVideoTitre = nom;
      }

      // Médias liés aux activités.
      if (activite && type === "photo") {
        activite.image = url;
      }

      if (activite && type === "video") {
        if (!Array.isArray(activite.videos)) {
          activite.videos = [];
        }

        activite.videos.push({
          id: media.id,
          titre: nom,
          url,
          cloudinaryPublicId: publicId,
          cloudinaryResourceType: resultatCloudinary.resource_type,
          image: "",
          meta: editionFinale || descriptionFinale || "Vidéo du Daara",
          edition: editionFinale,
          sectionId: String(activite.id)
        });
      }

      // Les audios sont stockés dans les khassidas.
      // Les photos et vidéos sont stockées dans la galerie.
      if (type === "audio") {
        d.khassidas.push(media);
      } else {
        d.galerie.push(media);
      }

      enregistrerDonnees(d);

      console.log("Média enregistré :", {
        id: media.id,
        url: media.url,
        publicId: media.cloudinaryPublicId
      });

      return res.status(201).json({
        message: "Média ajouté avec succès.",
        media,
        presentationImageUrl: d.presentationImageUrl || "",
        guideVideoUrl: d.guideVideoUrl || "",
        guideVideoTitre: d.guideVideoTitre || "",
        activite
      });
    } catch (erreur) {
      // Erreur détaillée dans le terminal, sans exposer de secret.
      console.error("ERREUR ENREGISTREMENT MÉDIA :", {
        message: erreur.message,
        http_code: erreur.http_code,
        name: erreur.name,
        error: erreur.error?.message
      });

      // Si Cloudinary a reçu le fichier mais que l'enregistrement
      // des données a échoué, tenter de supprimer le fichier envoyé.
      if (resultatCloudinary?.public_id) {
        try {
          await cloudinary.uploader.destroy(
            resultatCloudinary.public_id,
            {
              resource_type:
                resultatCloudinary.resource_type || resourceType || "image"
            }
          );
        } catch (erreurSuppression) {
          console.error(
            "Erreur nettoyage Cloudinary :",
            erreurSuppression.message
          );
        }
      }

      let message = "Impossible d'enregistrer le média.";

      if (
        erreur.message?.includes("Variables Cloudinary manquantes")
      ) {
        message = erreur.message;
      } else if (
        erreur.http_code === 401 ||
        erreur.http_code === 403
      ) {
        message =
          "Cloudinary refuse l'accès. Vérifie le nom du cloud, la clé API et le secret dans le fichier .env.";
      } else if (erreur.message) {
        message += " Détail : " + erreur.message;
      }

      return res.status(500).json({
        erreur: message
      });
    }
  });
});

// ==========================================
// SUPPRESSION D'UN MÉDIA
// DELETE /api/medias/:id
// ==========================================

router.delete("/:id", autoriser, async (req, res) => {
  try {
    const d = lireDonnees();

    if (!Array.isArray(d.galerie)) d.galerie = [];
    if (!Array.isArray(d.khassidas)) d.khassidas = [];
    if (!Array.isArray(d.activites)) d.activites = [];

    let media = null;

    for (const liste of [d.galerie, d.khassidas]) {
      const index = liste.findIndex(
        x => String(x.id) === String(req.params.id)
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

    // Retirer les associations aux activités.
    for (const activite of d.activites) {
      if (activite.image === media.url) {
        activite.image = "";
      }

      if (Array.isArray(activite.videos)) {
        activite.videos = activite.videos.filter(
          video => video.url !== media.url
        );
      }
    }

    // Retirer l'association à la présentation.
    if (d.presentationImageUrl === media.url) {
      d.presentationImageUrl = "images/presentation.jpg";
    }

    // Retirer les associations aux photos du guide.
    if (Array.isArray(d.guidePhotos)) {
      d.guidePhotos = d.guidePhotos.filter(
        url => url !== media.url
      );
    }

    if (d.guidePhotoUrl === media.url) {
      d.guidePhotoUrl =
        d.guidePhotos[0] || "images/guide-1.jpg";
    }

    // Retirer l'association au discours du guide.
    if (d.guideVideoUrl === media.url) {
      d.guideVideoUrl = "";
      d.guideVideoTitre = "";
    }

    // Enregistrer les modifications avant de supprimer le fichier.
    enregistrerDonnees(d);

    // Supprimer le fichier Cloudinary, si c'est un nouveau média.
    if (media.cloudinaryPublicId) {
      try {
        const typeCloudinary =
          media.cloudinaryResourceType ||
          obtenirResourceType(media.type);

        const resultatSuppression = await cloudinary.uploader.destroy(
          media.cloudinaryPublicId,
          { resource_type: typeCloudinary }
        );

        if (resultatSuppression.result !== "ok" &&
            resultatSuppression.result !== "not found") {
          console.error(
            "Cloudinary n'a pas confirmé la suppression :",
            resultatSuppression
          );
        }
      } catch (erreurCloudinary) {
        console.error(
          "Erreur suppression Cloudinary :",
          erreurCloudinary.message
        );
      }
    } else if (media.url?.startsWith("/uploads/")) {
      // Compatibilité avec les anciens fichiers locaux.
      const dossierUploads = path.join(
        __dirname,
        "../../public/uploads"
      );

      const cible = path.join(
        dossierUploads,
        path.basename(media.url)
      );

      if (fs.existsSync(cible)) {
        fs.unlinkSync(cible);
      }
    }

    return res.json({
      message: "Média supprimé avec succès."
    });
  } catch (erreur) {
    console.error("Erreur suppression média :", erreur);

    return res.status(500).json({
      erreur: "Impossible de supprimer le média."
    });
  }
});

module.exports = router;
