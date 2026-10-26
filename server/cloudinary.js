
const path = require("path");
const dotenv = require("dotenv");
const { v2: cloudinary } = require("cloudinary");

// Charger le .env à la racine du projet KKCCAB
dotenv.config({
  path: path.join(__dirname, "../.env")
});

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

console.log("Configuration Cloudinary :", {
  cloudNamePresent: Boolean(cloudName),
  apiKeyPresent: Boolean(apiKey),
  apiSecretPresent: Boolean(apiSecret)
});

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true
});

module.exports = cloudinary;
