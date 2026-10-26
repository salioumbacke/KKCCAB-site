
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const fichier = path.join(__dirname, "../data/users.json");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function demander(question) {
  return new Promise(resolve => {
    rl.question(question, reponse => resolve(reponse.trim()));
  });
}

async function main() {
  try {
    const contenu = fs.readFileSync(fichier, "utf8");
    const utilisateurs = JSON.parse(contenu);

    if (!Array.isArray(utilisateurs)) {
      throw new Error("Le fichier users.json doit contenir un tableau.");
    }

    if (utilisateurs.length > 0) {
      console.log("Un compte existe déjà. Aucun compte ajouté.");
      return;
    }

    const nom = await demander("Nom de l'administrateur : ");
    const email = (
      await demander("Ton adresse e-mail : ")
    ).toLowerCase();

    const motDePasse = await demander(
      "Choisis un mot de passe (12 caractères minimum) : "
    );

    if (!nom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Nom ou adresse e-mail invalide.");
    }

    if (motDePasse.length < 12) {
      throw new Error("Le mot de passe doit avoir au moins 12 caractères.");
    }

    const motDePasseHash = await bcrypt.hash(motDePasse, 12);

    utilisateurs.push({
      id: "admin-" + Date.now(),
      nom,
      email,
      motDePasseHash,
      role: "admin"
    });

    fs.writeFileSync(
      fichier,
      JSON.stringify(utilisateurs, null, 2),
      "utf8"
    );

    console.log("\nCompte administrateur créé avec succès !");
    console.log("E-mail :", email);
  } catch (erreur) {
    console.error("\nErreur :", erreur.message);
  } finally {
    rl.close();
  }
}

main();
