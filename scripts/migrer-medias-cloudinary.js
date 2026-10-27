
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { v2: cloudinary } = require("cloudinary");

const RACINE = path.join(__dirname, "..");
const FICHIER_DATA = path.join(RACINE, "data", "site.json");
const DOSSIER_UPLOADS = path.join(RACINE, "public", "uploads");

dotenv.config({ path: path.join(RACINE, ".env") });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

function verifierConfiguration() {
  const config = cloudinary.config();

  if (!config.cloud_name || !config.api_key || !config.api_secret) {
    throw new Error(
      "Configuration Cloudinary incomplète. Vérifie le fichier .env."
    );
  }

  if (!fs.existsSync(FICHIER_DATA)) {
    throw new Error("Fichier data/site.json introuvable.");
  }

  if (!fs.existsSync(DOSSIER_UPLOADS)) {
    throw new Error("Dossier public/uploads introuvable.");
  }
}

function estAncienneUrl(valeur) {
  return (
    typeof valeur === "string" &&
    /^\/uploads\/[^/\\]+$/.test(valeur)
  );
}

function trouverAnciennesUrls(objet, resultat = new Set()) {
  if (typeof objet === "string") {
    if (estAncienneUrl(objet)) resultat.add(objet);
    return resultat;
  }

  if (Array.isArray(objet)) {
    for (const valeur of objet) {
      trouverAnciennesUrls(valeur, resultat);
    }
    return resultat;
  }

  if (objet && typeof objet === "object") {
    for (const valeur of Object.values(objet)) {
      trouverAnciennesUrls(valeur, resultat);
    }
  }

  return resultat;
}

function typeCloudinary(nomFichier) {
  const ext = path.extname(nomFichier).toLowerCase();

  const extensionsImage = [
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"
  ];

  if (extensionsImage.includes(ext)) return "image";

  // Cloudinary traite les vidéos et les audios avec "video".
  return "video";
}

async function envoyerFichier(urlLocale) {
  const nomFichier = path.basename(urlLocale);
  const cheminFichier = path.join(DOSSIER_UPLOADS, nomFichier);

  if (!fs.existsSync(cheminFichier)) {
    console.warn("FICHIER LOCAL INTROUVABLE :", cheminFichier);
    return null;
  }

  const resourceType = typeCloudinary(nomFichier);

  console.log("Transfert :", nomFichier);

  const resultat = await cloudinary.uploader.upload(cheminFichier, {
    folder: "kkccab",
    resource_type: resourceType,
    public_id: path.parse(nomFichier).name,
    overwrite: false
  });

  console.log("OK :", resultat.secure_url);

  return {
    url: resultat.secure_url,
    publicId: resultat.public_id,
    resourceType: resultat.resource_type || resourceType
  };
}

function remplacerUrls(objet, correspondances) {
  if (typeof objet === "string") {
    return correspondances.get(objet)?.url || objet;
  }

  if (Array.isArray(objet)) {
    return objet.map(valeur => remplacerUrls(valeur, correspondances));
  }

  if (!objet || typeof objet !== "object") {
    return objet;
  }

  for (const cle of Object.keys(objet)) {
    const ancienneUrl = objet[cle];

    if (typeof ancienneUrl === "string" && correspondances.has(ancienneUrl)) {
      const resultat = correspondances.get(ancienneUrl);
      objet[cle] = resultat.url;

      // Conserver les identifiants Cloudinary pour les médias
      // qui possèdent un champ "url".
      if (cle === "url" && objet.type) {
        objet.cloudinaryPublicId = resultat.publicId;
        objet.cloudinaryResourceType = resultat.resourceType;
      }
    } else {
      objet[cle] = remplacerUrls(ancienneUrl, correspondances);
    }
  }

  return objet;
}

async function main() {
  verifierConfiguration();

  const donneesOriginales = JSON.parse(
    fs.readFileSync(FICHIER_DATA, "utf8")
  );

  const anciennesUrls = [
    ...trouverAnciennesUrls(donneesOriginales)
  ];

  if (anciennesUrls.length === 0) {
    console.log("Aucune ancienne URL /uploads à migrer.");
    return;
  }

  console.log(`${anciennesUrls.length} ancienne(s) URL trouvée(s).`);

  // Sauvegarde avant toute modification.
  const sauvegarde = FICHIER_DATA + ".backup-" +
    new Date().toISOString().replace(/[:.]/g, "-");

  fs.copyFileSync(FICHIER_DATA, sauvegarde);
  console.log("Sauvegarde créée :", sauvegarde);

  const correspondances = new Map();
  let echecs = 0;

  for (const ancienneUrl of anciennesUrls) {
    try {
      const resultat = await envoyerFichier(ancienneUrl);

      if (resultat) {
        correspondances.set(ancienneUrl, resultat);
      } else {
        echecs++;
      }
    } catch (erreur) {
      echecs++;
      console.error(
        "ÉCHEC DU TRANSFERT :",
        ancienneUrl,
        "-",
        erreur.message
      );
    }
  }

  if (correspondances.size === 0) {
    console.error(
      "Aucun fichier transféré. Le fichier site.json n'a pas été modifié."
    );
    return;
  }

  const donneesModifiees = remplacerUrls(
    donneesOriginales,
    correspondances
  );

  fs.writeFileSync(
    FICHIER_DATA,
    JSON.stringify(donneesModifiees, null, 2),
    "utf8"
  );

  console.log("\nMIGRATION TERMINÉE");
  console.log("URLs migrées :", correspondances.size);
  console.log("Fichiers manquants ou en échec :", echecs);
  console.log("Sauvegarde :", sauvegarde);
  console.log("Les fichiers originaux dans public/uploads sont conservés.");

  if (echecs > 0) {
    console.log(
      "Certains médias restent à traiter. Consulte les erreurs ci-dessus."
    );
  }
}

main().catch(erreur => {
  console.error("ERREUR DE MIGRATION :", erreur.message);
  process.exitCode = 1;
});
