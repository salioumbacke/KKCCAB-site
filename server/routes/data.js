
const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const fichier = path.join(__dirname, "../../data/site.json");
const fichierJournal = path.join(__dirname, "../../data/activity-log.json");

// ========================================
// LECTURE ET ENREGISTREMENT DES DONNÉES
// ========================================

function lireDonnees() {
    try {
        if (!fs.existsSync(fichier)) {
            fs.mkdirSync(path.dirname(fichier), { recursive: true });
            fs.writeFileSync(fichier, JSON.stringify({}, null, 2), "utf8");
        }

        const contenu = fs.readFileSync(fichier, "utf8");
        return contenu.trim() ? JSON.parse(contenu) : {};
    } catch (error) {
        console.error("Erreur de lecture de site.json :", error);
        return {};
    }
}

function enregistrerDonnees(donnees) {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });

    fs.writeFileSync(
        fichier,
        JSON.stringify(donnees, null, 2),
        "utf8"
    );
}

// ========================================
// JOURNAL DES ACTIVITÉS
// ========================================

function journaliser(req, action) {
    try {
        fs.mkdirSync(path.dirname(fichierJournal), {
            recursive: true
        });

        let journal = [];

        if (fs.existsSync(fichierJournal)) {
            const contenu = fs.readFileSync(fichierJournal, "utf8");

            if (contenu.trim()) {
                journal = JSON.parse(contenu);
            }
        }

        if (!Array.isArray(journal)) {
            journal = [];
        }

        journal.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            email: req.session?.user?.email || "Compte inconnu",
            action,
            date: new Date().toISOString()
        });

        fs.writeFileSync(
            fichierJournal,
            JSON.stringify(journal, null, 2),
            "utf8"
        );

        return true;
    } catch (error) {
        console.error(
            "Erreur lors de l'enregistrement du journal :",
            error
        );
        return false;
    }
}

// ========================================
// VÉRIFICATION DES AUTORISATIONS
// ========================================

function autoriser(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            message: "Vous devez être connecté."
        });
    }

    const role = req.session.user.role;

    if (!["admin", "editeur"].includes(role)) {
        return res.status(403).json({
            message: "Vous n'avez pas l'autorisation de modifier le site."
        });
    }

    next();
}

// ========================================
// STRUCTURE DES DONNÉES
// ========================================

function assurerContenus(donnees) {
    const d = donnees && typeof donnees === "object" && !Array.isArray(donnees)
        ? donnees
        : {};

    if (!d.guide || typeof d.guide !== "object" || Array.isArray(d.guide)) {
        d.guide = {
            nom: "",
            titre: "",
            texte: "",
            photo: ""
        };
    }

    const listes = [
        "formations",
        "membres",
        "objectifs",
        "activites",
        "galerie",
        "khassidas"
    ];

    listes.forEach(champ => {
        if (!Array.isArray(d[champ])) {
            d[champ] = [];
        }
    });

    return d;
}

// ========================================
// OUTILS DE COMPARAISON
// ========================================

function comparerValeurs(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function valeurTexte(valeur) {
    if (valeur === undefined || valeur === null || valeur === "") {
        return "(vide)";
    }

    if (typeof valeur === "object") {
        try {
            return JSON.stringify(valeur);
        } catch {
            return "[donnée]";
        }
    }

    return String(valeur);
}

function obtenirIdentifiant(element, index) {
    if (!element || typeof element !== "object") {
        return `index-${index}`;
    }

    if (element.id !== undefined && element.id !== null) {
        return `id-${element.id}`;
    }

    if (element._id !== undefined && element._id !== null) {
        return `_id-${element._id}`;
    }

    // Identité de secours pour les éléments sans ID.
    return [
        element.nom || "",
        element.titre || "",
        element.url || element.src || element.chemin || "",
        `index-${index}`
    ].join("|");
}

function obtenirNom(element, index) {
    if (!element || typeof element !== "object") {
        return `Élément ${index + 1}`;
    }

    return (
        element.nom ||
        element.titre ||
        element.libelle ||
        element.name ||
        element.filename ||
        element.url ||
        element.src ||
        element.texte ||
        `Élément ${index + 1}`
    );
}

// ========================================
// COMPARER LES LISTES
// ========================================

function comparerListe(nomListe, anciennesValeurs, nouvellesValeurs) {
    const changements = [];

    const anciennes = Array.isArray(anciennesValeurs)
        ? anciennesValeurs
        : [];

    const nouvelles = Array.isArray(nouvellesValeurs)
        ? nouvellesValeurs
        : [];

    const anciennesMap = new Map();
    const nouvellesMap = new Map();

    anciennes.forEach((element, index) => {
        anciennesMap.set(
            obtenirIdentifiant(element, index),
            { element, index }
        );
    });

    nouvelles.forEach((element, index) => {
        nouvellesMap.set(
            obtenirIdentifiant(element, index),
            { element, index }
        );
    });

    // Ajouts et modifications
    nouvellesMap.forEach((nouvelle, identifiant) => {
        const ancienne = anciennesMap.get(identifiant);
        const nomElement = obtenirNom(nouvelle.element, nouvelle.index);

        if (!ancienne) {
            changements.push(
                `Ajout de ${nomListe} : "${nomElement}"`
            );
            return;
        }

        if (!comparerValeurs(ancienne.element, nouvelle.element)) {
            const champsModifies = new Set([
                ...Object.keys(ancienne.element || {}),
                ...Object.keys(nouvelle.element || {})
            ]);

            const details = [];

            champsModifies.forEach(champ => {
                if (
                    !comparerValeurs(
                        ancienne.element?.[champ],
                        nouvelle.element?.[champ]
                    )
                ) {
                    details.push(champ);
                }
            });

            changements.push(
                `Modification de ${nomListe} "${nomElement}"` +
                (details.length ? ` — champs : ${details.join(", ")}` : "")
            );
        }
    });

    // Suppressions
    anciennesMap.forEach((ancienne, identifiant) => {
        if (!nouvellesMap.has(identifiant)) {
            changements.push(
                `Suppression de ${nomListe} : "${obtenirNom(
                    ancienne.element,
                    ancienne.index
                )}"`
            );
        }
    });

    return changements;
}

// ========================================
// NOMS DES CHAMPS DU SITE
// ========================================

const nomsChamps = {
    presentationTitre: "Titre de présentation",
    presentationTexte1: "Texte 1 de présentation",
    presentationTexte2: "Texte 2 de présentation",
    presentationTexte3: "Texte 3 de présentation",
    presentationImage: "Photo de présentation",
    presentationImageUrl: "Photo de présentation",
    photoPresentation: "Photo de présentation",

    guide: "Informations du guide spirituel",
    guideNom: "Nom du guide",
    guideTitre: "Titre du guide",
    guideFonction: "Fonction du guide",
    guideTexte: "Texte du guide",
    guideTexte1: "Texte 1 du guide",
    guideTexte2: "Texte 2 du guide",
    guidePhoto: "Photo du guide",
    guidePhotoUrl: "Photo du guide",
    guidePhotos: "Photos du guide",
    guideLignee1: "Lignée du guide",
    guideLignee2: "Lignée du guide",
    guideVideoTitre: "Titre de la vidéo du guide",

    formations: "Formations",
    membres: "Membres",
    objectifs: "Objectifs",
    activites: "Activités",
    galerie: "Galerie photos et vidéos",
    khassidas: "Khassidas",

    donWave: "Paiement Wave",
    donOrangeMoney: "Paiement Orange Money",
    donTexte: "Texte des dons",

    contactTelephone: "Téléphone de contact",
    contactEmail: "Email de contact",
    contactAdresse: "Adresse de contact",
    contactWhatsapp: "WhatsApp",

    histoire: "Histoire du Daara",
    mission: "Mission du Daara",
    vision: "Vision du Daara",
    valeurs: "Valeurs du Daara"
};

// ========================================
// IDENTIFIER LES CHANGEMENTS
// ========================================

function identifierChangements(anciennes, nouvelles) {
    const changements = [];

    const listes = [
        ["formations", "formation"],
        ["membres", "membre"],
        ["objectifs", "objectif"],
        ["activites", "activité"],
        ["galerie", "élément de galerie"],
        ["khassidas", "khassida"]
    ];

    const champsExclus = new Set([
        ...listes.map(([champ]) => champ),
        "guide"
    ]);

    // Comparer tous les champs simples et les autres propriétés.
    const tousLesChamps = new Set([
        ...Object.keys(anciennes || {}),
        ...Object.keys(nouvelles || {})
    ]);

    tousLesChamps.forEach(champ => {
        if (champsExclus.has(champ)) return;

        if (!comparerValeurs(anciennes[champ], nouvelles[champ])) {
            changements.push(
                `Modification : ${nomsChamps[champ] || champ}`
            );
        }
    });

    // Comparer les propriétés du guide.
    const ancienGuide = anciennes.guide || {};
    const nouveauGuide = nouvelles.guide || {};

    const champsGuide = new Set([
        ...Object.keys(ancienGuide),
        ...Object.keys(nouveauGuide)
    ]);

    champsGuide.forEach(champ => {
        if (
            !comparerValeurs(
                ancienGuide[champ],
                nouveauGuide[champ]
            )
        ) {
            changements.push(
                `Modification du guide : ${champ}`
            );
        }
    });

    // Comparer toutes les listes.
    listes.forEach(([champ, nomListe]) => {
        changements.push(
            ...comparerListe(
                nomListe,
                anciennes[champ],
                nouvelles[champ]
            )
        );
    });

    return changements;
}

// ========================================
// ROUTE GET : RÉCUPÉRER LE CONTENU
// ========================================

router.get("/", (req, res) => {
    try {
        const donnees = assurerContenus(lireDonnees());
        return res.json(donnees);
    } catch (error) {
        console.error("Erreur de récupération du contenu :", error);

        return res.status(500).json({
            message: "Impossible de récupérer le contenu du site."
        });
    }
});

// ========================================
// ROUTE PUT : MODIFIER LE CONTENU
// ========================================

router.put("/", autoriser, (req, res) => {
    try {
        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                message: "Les données envoyées sont invalides."
            });
        }

        const donneesRecues = req.body;
        const anciennes = assurerContenus(lireDonnees());

        // Conserver les données existantes et appliquer les modifications.
        const nouvelles = assurerContenus({
            ...anciennes,
            ...donneesRecues
        });

        // Vérifier les listes fournies par le client.
        const nomsListes = [
            "formations",
            "membres",
            "objectifs",
            "activites",
            "galerie",
            "khassidas"
        ];

        for (const champ of nomsListes) {
            if (
                Object.prototype.hasOwnProperty.call(donneesRecues, champ) &&
                !Array.isArray(donneesRecues[champ])
            ) {
                return res.status(400).json({
                    message: `Le champ "${champ}" doit être une liste.`
                });
            }
        }

        // Identifier les modifications réelles.
        const changements = identifierChangements(
            anciennes,
            nouvelles
        );

        // Enregistrer les nouvelles données.
        enregistrerDonnees(nouvelles);

        // Ajouter les actions au journal.
        let journalEnregistre = true;

        if (changements.length > 0) {
            const action = changements.length === 1
                ? changements[0]
                : `Modifications : ${changements.join(" ; ")}`;

            journalEnregistre = journaliser(req, action);
        }

        return res.json({
            message: changements.length
                ? (
                    journalEnregistre
                        ? "Les modifications ont été enregistrées et journalisées."
                        : "Les modifications ont été enregistrées, mais le journal n'a pas pu être mis à jour."
                )
                : "Aucune modification détectée.",
            donnees: nouvelles,
            changements
        });

    } catch (error) {
        console.error(
            "Erreur lors de la modification du contenu :",
            error
        );

        return res.status(500).json({
            message: "Une erreur est survenue lors de l'enregistrement."
        });
    }
});

// ========================================
// EXPORTER LE ROUTEUR
// ========================================

module.exports = router;
