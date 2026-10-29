
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");

const router = express.Router();

const fichier = path.join(__dirname, "../../data/site.json");
const dossierPublic = path.join(__dirname, "../../public");
const typesAutorises = {
    photo: ["image/jpeg", "image/png", "image/webp", "image/gif"],
   video: ["video/mp4", "video/webm", "video/quicktime"],
    audio: [
        "audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg",
        "audio/webm", "audio/x-wav", "audio/aac", "audio/flac",
        "audio/opus", "audio/3gpp", "audio/x-m4a"
    ],
    pdf: ["application/pdf"]
    };
   const extensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/opus": ".opus",
    "audio/3gpp": ".3gp",
    "audio/x-m4a": ".m4a",
    "application/pdf": ".pdf"
};

// ==========================================
// LECTURE ET ENREGISTREMENT
// ==========================================

function lireDonnees() {
    if (!fs.existsSync(fichier)) {
        fs.mkdirSync(path.dirname(fichier), { recursive: true });
        fs.writeFileSync(fichier, "{}", "utf8");
    }

    const contenu = fs.readFileSync(fichier, "utf8");
    return contenu.trim() ? JSON.parse(contenu) : {};
}

function enregistrerDonnees(donnees) {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });

    fs.writeFileSync(
        fichier,
        JSON.stringify(donnees, null, 2),
        "utf8"
    );
}

function assurerListes(d) {
    ["galerie", "khassidas", "activites", "guidePhotos"].forEach(champ => {
        if (!Array.isArray(d[champ])) d[champ] = [];
    });
}

function creerTitreMedia(titre, nomOriginal) {
    const saisi = String(titre || "").trim();

    if (saisi) return saisi.slice(0, 200);

    return (
        path.parse(nomOriginal || "").name.replace(/[_-]+/g, " ").trim()
        || "Média sans titre"
    ).slice(0, 200);
}

function nomSecurise(texte) {
    return String(texte || "media")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70) || "media";
}

// ==========================================
// AUTORISATIONS
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
// UPLOAD TEMPORAIRE
// ==========================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },

    fileFilter: (_req, file, cb) => {
        const autorises = Object.values(typesAutorises).flat();

        if (!autorises.includes(file.mimetype)) {
            return cb(new Error(
                "Format non autorisé : " + file.mimetype
            ));
        }

        cb(null, true);
    }
});

// ==========================================
// CHOISIR LE DOSSIER LOCAL
// ==========================================
// ==========================================
// CHOISIR LE DOSSIER LOCAL
// ==========================================

function obtenirDossier(type, section) {
    // PDF
    if (type === "pdf") {
        return "documents/khassidas";
    }

    if (section === "presentation") {
        return "images/presentation";
    }

    if (section === "guide") {
        return "images/guide";
    }

    if (section === "membres") {
        return "images/membres";
    }

    if (section === "guide-discours") {
        return "videos/guide";
    }

    if (section === "galerie") {
        if (type === "photo") return "images/galerie";
        if (type === "video") return "videos/galerie";
        return "audio/khassidas";
    }

    if (type === "photo") return "images/activites";
    if (type === "video") return "videos/activites";

    return "audio/khassidas";
}

function choisirNomFichier(type, section, titre, original, d, activite) {
    const extension = extensions[original.mimetype] ||
        path.extname(original.originalname).toLowerCase();

    if (section === "presentation") {
        return "presentation" + extension;
    }

    if (section === "guide") {
        const dossier = path.join(dossierPublic, "images", "guide");
        fs.mkdirSync(dossier, { recursive: true });

        let numero = 1;
        while (fs.existsSync(path.join(dossier, `guide${numero}${extension}`))) {
            numero++;
        }

        return `guide${numero}${extension}`;
    }

    if (section === "guide-discours") {
        return "discours" + extension;
    }

    const base = section === "membres"
        ? nomSecurise(titre || path.parse(original.originalname).name)
        : section === "galerie"
            ? nomSecurise(titre || path.parse(original.originalname).name)
            : `activite-${nomSecurise(activite?.id || section)}-${nomSecurise(titre || path.parse(original.originalname).name)}`;

    const dossier = path.join(
        dossierPublic,
        obtenirDossier(type, section)
    );

    fs.mkdirSync(dossier, { recursive: true });

    let nom = `${base}${extension}`;

    if (fs.existsSync(path.join(dossier, nom))) {
        nom = `${base}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}${extension}`;
    }

    return nom;
}

// ==========================================
// LECTURE DES MÉDIAS
// GET /api/medias
// ==========================================

router.get("/", (_req, res) => {
    try {
        const d = lireDonnees();
        assurerListes(d);

        res.json({
            galerie: d.galerie,
            khassidas: d.khassidas,
            guidePhotos: d.guidePhotos || [],
            presentationImageUrl:
                d.presentationImageUrl ||
                "/images/presentation/presentation.jpg",
            guidePhotoUrl:
                d.guidePhotoUrl ||
                "/images/guide/guide1.jpg",
            guideVideoUrl:
                d.guideVideoUrl ||
                "/videos/guide/discours.mp4",
            guideVideoTitre: d.guideVideoTitre || ""
        });
    } catch (erreur) {
        console.error("Erreur lecture médias :", erreur);

        res.status(500).json({
            erreur: "Impossible de lire les médias."
        });
    }
});

// ==========================================
// AJOUT D'UN MÉDIA LOCAL
// POST /api/medias
// ==========================================

router.post("/", autoriser, (req, res) => {
    upload.single("fichier")(req, res, async erreurUpload => {
        if (erreurUpload) {
            return res.status(400).json({
                erreur: erreurUpload.code === "LIMIT_FILE_SIZE"
                    ? "Fichier trop volumineux. Maximum : 100 Mo."
                    : erreurUpload.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                erreur: "Sélectionne un fichier avant de l'envoyer."
            });
        }

        let cheminCree = null;

        try {
            const { type, titre, description, sectionId, edition } = req.body;

            if (!["photo", "video", "audio", "pdf"].includes(type)) {
                return res.status(400).json({
                    erreur: "Type invalide. Choisis photo, vidéo, audio ou PDF."
                });
            }

            if (!typesAutorises[type]?.includes(req.file.mimetype)) {
                return res.status(400).json({
                    erreur: "Le format ne correspond pas au type choisi."
                });
            }

            const d = lireDonnees();
            assurerListes(d);

            const section = String(sectionId || "galerie");

            const sectionsSpeciales = [
                "galerie", "presentation", "guide",
                "guide-discours", "membres"
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

            if (
                section === "guide-discours" &&
                type !== "video"
            ) {
                return res.status(400).json({
                    erreur: "Le discours du guide doit être une vidéo."
                });
            }

            if (
                ["presentation", "guide", "membres"].includes(section) &&
                type !== "photo"
            ) {
                return res.status(400).json({
                    erreur: "Cette rubrique accepte uniquement des photos."
                });
            }

            if (section === "guide-discours" && type !== "video") {
                return res.status(400).json({
                    erreur: "Cette rubrique accepte uniquement des vidéos."
                });
            }

            const dossierRelatif = obtenirDossier(type, section);
            const dossierAbsolu = path.join(dossierPublic, dossierRelatif);

            fs.mkdirSync(dossierAbsolu, { recursive: true });

            const nom = creerTitreMedia(titre, req.file.originalname);

            const nomFichier = choisirNomFichier(
                type, section, nom, req.file, d, activite
            );

            cheminCree = path.join(dossierAbsolu, nomFichier);

            // La présentation remplace son fichier dédié.
            fs.writeFileSync(cheminCree, req.file.buffer);

            const url = "/" + path.posix.join(
                dossierRelatif.replace(/\\/g, "/"),
                nomFichier
            );

            const media = {
                id: crypto.randomUUID(),
                type,
                titre: nom,
                description: String(description || "").slice(0, 2000),
                url,
                dateAjout: new Date().toISOString(),
                sectionId: section,
                edition: String(edition || "").trim()
            };

            if (section === "presentation") {
                d.presentationImageUrl = url;
                d.presentationImage = url;
                d.photoPresentation = url;
            }

            if (section === "guide") {
                d.guidePhotos.push(url);
                d.guidePhotos = [...new Set(d.guidePhotos)];

                if (!d.guidePhotoUrl) d.guidePhotoUrl = url;

                if (d.guide && typeof d.guide === "object") {
                    if (!d.guide.photo) d.guide.photo = url;
                }
            }

            if (section === "guide-discours") {
                d.guideVideoUrl = url;
                d.guideVideoTitre = nom;
            }

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
                    image: "",
                    meta: String(edition || description || "Vidéo du Daara"),
                    edition: String(edition || "").trim(),
                    sectionId: String(activite.id)
                });
            }

            if (type === "audio") {
                d.khassidas.push(media);
            } else {
                d.galerie.push(media);
            }

            enregistrerDonnees(d);

            console.log("Média local enregistré :", url);

            return res.status(201).json({
                message: "Média enregistré localement avec succès.",
                media,
                presentationImageUrl: d.presentationImageUrl || "",
                guideVideoUrl: d.guideVideoUrl || "",
                guideVideoTitre: d.guideVideoTitre || "",
                activite
            });
        } catch (erreur) {
            console.error("Erreur enregistrement média local :", erreur);

            if (cheminCree && fs.existsSync(cheminCree)) {
                try {
                    fs.unlinkSync(cheminCree);
                } catch (e) {
                    console.error("Nettoyage impossible :", e.message);
                }
            }

            return res.status(500).json({
                erreur: "Impossible d'enregistrer le média : " + erreur.message
            });
        }
    });
});

// ==========================================
// SUPPRESSION D'UN MÉDIA
// DELETE /api/medias/:id
// ==========================================

router.delete("/:id", autoriser, (req, res) => {
    try {
        const d = lireDonnees();
        assurerListes(d);

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

        for (const activite of d.activites) {
            if (activite.image === media.url) activite.image = "";

            if (Array.isArray(activite.videos)) {
                activite.videos = activite.videos.filter(
                    video => video.url !== media.url
                );
            }
        }

        if (d.presentationImageUrl === media.url) {
            d.presentationImageUrl =
                "/images/presentation/presentation.jpg";
            d.presentationImage = d.presentationImageUrl;
            d.photoPresentation = d.presentationImageUrl;
        }

        if (Array.isArray(d.guidePhotos)) {
            d.guidePhotos = d.guidePhotos.filter(url => url !== media.url);
        }

        if (d.guidePhotoUrl === media.url) {
            d.guidePhotoUrl =
                d.guidePhotos[0] || "/images/guide/guide1.jpg";
        }

        if (d.guideVideoUrl === media.url) {
            d.guideVideoUrl = "/videos/guide/discours.mp4";
            d.guideVideoTitre = "";
        }

        enregistrerDonnees(d);

        // Supprimer uniquement les fichiers enregistrés dans les dossiers
        // de galerie ou d'activités. Les images fixes du guide, de la
        // présentation et des membres ne sont pas supprimées ici.
        if (typeof media.url === "string" && media.url.startsWith("/")) {
            const relatif = media.url.replace(/^\/+/, "");
            const cible = path.resolve(dossierPublic, relatif);
            const racine = path.resolve(dossierPublic) + path.sep;

            const dossiersSupprimables = [
              path.join(dossierPublic, "images", "guide"),
               path.join(dossierPublic, "images", "galerie"),
               path.join(dossierPublic, "videos", "galerie"),
             path.join(dossierPublic, "images", "activites"),
              path.join(dossierPublic, "videos", "activites"),
             path.join(dossierPublic, "audio", "khassidas"),
             path.join(dossierPublic, "documents", "khassidas")
              ].map(p => path.resolve(p) + path.sep);

            const dansPublic = cible.startsWith(racine);
            const autoriseSuppression = dossiersSupprimables.some(
                dossier => cible.startsWith(dossier)
            );

            if (
                dansPublic &&
                autoriseSuppression &&
                fs.existsSync(cible) &&
                fs.statSync(cible).isFile()
            ) {
                fs.unlinkSync(cible);
            }
        }

        return res.json({
            message: "Média supprimé avec succès."
        });
    } catch (erreur) {
        console.error("Erreur suppression média local :", erreur);

        return res.status(500).json({
            erreur: "Impossible de supprimer le média."
        });
    }
});

module.exports = router;
