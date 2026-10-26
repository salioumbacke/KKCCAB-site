
require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const path = require("path");

const messagesRoutes = require("./routes/messages");
const mediasRoutes = require("./routes/medias");
const journalRoutes = require("./routes/journal");
const activitesRoutes = require("./routes/activites");
const dataRoutes = require("./routes/data");
const siteRoutes = require("./routes/site");
const authRoutes = require("./routes/auth");

const app = express();
const PORT = process.env.PORT || 3000;

// Sécurité et lecture des données
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Gestion des sessions
app.use(
  session({
    name: "kkccab.sid",
    secret: process.env.SESSION_SECRET || "kkccab-secret-local",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

// Fichiers publics du site
app.use(express.static(path.join(__dirname, "../public")));

// Vérification du serveur
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    project: "KKCCAB",
    message: "Le serveur fonctionne correctement."
  });
});

// Vérification de la route des activités
console.log(
  "ROUTE ACTIVITES CHARGEE :",
  typeof activitesRoutes
);

// Routes de l'API
app.use("/api/auth", authRoutes);
app.use("/api/site", siteRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/activites", activitesRoutes);
app.use("/api/journal", journalRoutes);
app.use("/api/medias", mediasRoutes);
app.use("/api/messages", messagesRoutes);

// Route temporaire de test
app.get("/api/test-activites", (req, res) => {
  res.json({
    ok: true,
    message: "La route de test fonctionne."
  });
});

// Connexion à l'administration
app.get("/admin/login", (req, res) => {
  res.sendFile(
    path.join(__dirname, "../admin/login.html")
  );
});

// Protection de la page d'administration
app.get("/admin", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/admin/login");
  }

  res.sendFile(
    path.join(__dirname, "../admin/index.html")
  );
});

// Gestion des routes inexistantes
app.use((req, res) => {
  res.status(404).json({
    erreur: "Route introuvable.",
    chemin: req.originalUrl
  });
});

// Gestion des erreurs du serveur
app.use((err, req, res, next) => {
  console.error("Erreur serveur :", err);

  res.status(500).json({
    erreur: "Une erreur interne est survenue."
  });
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(
    `KKCCAB est lancé sur http://localhost:${PORT}`
  );
});
