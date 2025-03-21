const express = require("express");
const passport = require("passport");
const session = require("express-session");
const path = require("path");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

const app = express();

// Set up EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "upload/");
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + "-" + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage });

// Passport.js setup
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      return done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Authentication Middleware without bypass
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
};

// Routes
app.get("/", (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect("/home");
  }
  res.sendFile(path.join(__dirname, "public/html/root.html"));
});

app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    res.redirect("/home");
  }
);

app.get("/home", ensureAuthenticated, (req, res) => {
  console.log("User authenticated:", req.user);
  res.render("home", {
    user: req.user,
  });
});

app.post("/upload", upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded." });
    }

    const results = [];
    for (const file of req.files) {
      // Convert file to Base64
      const fileData = fs.readFileSync(file.path).toString("base64");

      // Prepare payload for Gemini API
      const payload = {
        instances: [
          {
            content: fileData,
            mimeType: file.mimetype, // Pass the MIME type
          },
        ],
      };

      // Send request to Gemini API
      const geminiResponse = await axios.post(
        "https://asia-south1-aiplatform.googleapis.com/v1/projects/pai-chatbot-451105/locations/asia-south1/publishers/google/models/gemini-1.5-pro:generateContent",
        payload,
        {
          headers: {
            Authorization: `${process.env.GEMINI_API_KEY}`, // Use API key
            "Content-Type": "application/json",
          },
        }
      );

      // Collect response for each file
      results.push({
        originalFileName: file.originalname,
        suggestedFileName:
          geminiResponse.data.predictions[0].content || "No name suggested",
      });
    }

    // Return consolidated results to the frontend
    res.status(200).json({ success: true, results });
  } catch (error) {
    console.error(
      "Error processing files:",
      error.response?.data || error.message
    );
    res
      .status(500)
      .json({ success: false, message: "File processing failed." });
  }
});

// Start server
app.listen(3000, () => {
  console.log(`Server running on http://localhost:3000`);
});
