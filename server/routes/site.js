
const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    project: "KKCCAB",
    status: "OK",
    message: "Bienvenue sur l'API du site KKCCAB"
  });
});

module.exports = router;
