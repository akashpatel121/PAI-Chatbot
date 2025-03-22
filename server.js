const express = require("express");
const passport = require("passport");
const session = require("express-session");
const path = require("path");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { GoogleGenerativeAI } = require("@google/generative-ai");
const multer = require("multer");
const fs = require("fs");
const { google } = require("googleapis");
const axios = require("axios"); // Added missing axios import
require("dotenv").config();

const app = express();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Validate essential API key
if (!process.env.GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY is not defined in .env file");
  process.exit(1);
}

// Set up EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.json()); // Added to parse JSON body
app.use(express.urlencoded({ extended: true })); // Added to parse URL-encoded body
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret-key", // Added fallback
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: process.env.NODE_ENV === "production", // Use secure cookies in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);
app.use(passport.initialize());
app.use(passport.session());

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);

// Initialize Drive API client
const drive = google.drive({ version: "v3", auth: oauth2Client });

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create upload directory if it doesn't exist
    if (!fs.existsSync("upload/")) {
      fs.mkdirSync("upload/");
    }
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

// Passport.js setup with Drive scope
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ["profile", "email", "https://www.googleapis.com/auth/drive.file"], // Drive scope
    },
    (accessToken, refreshToken, profile, done) => {
      // Store tokens with the profile
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
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

// Authentication Middleware
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
};

// Function to get a Drive client for the authenticated user
function getUserDriveClient(req) {
  if (!req.user || !req.user.accessToken) {
    throw new Error("User not authenticated or missing access token");
  }

  const userOauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );

  userOauth2Client.setCredentials({
    access_token: req.user.accessToken,
    refresh_token: req.user.refreshToken,
  });

  return google.drive({ version: "v3", auth: userOauth2Client });
}

// Convert file to generative part
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

// Function to create "PAI Chatbot" folder in Google Drive if it doesn't exist
async function getOrCreatePaiChatbotFolder(driveClient) {
  try {
    const response = await driveClient.files.list({
      q: "name='PAI Chatbot' and mimeType='application/vnd.google-apps.folder' and trashed=false",
      fields: "files(id)",
    });

    if (response.data.files.length > 0) {
      return response.data.files[0].id; // Folder already exists
    }

    // Create folder if not found
    const folderMetadata = {
      name: "PAI Chatbot",
      mimeType: "application/vnd.google-apps.folder",
    };

    const folder = await driveClient.files.create({
      resource: folderMetadata,
      fields: "id",
    });

    console.log("Created folder with ID:", folder.data.id);
    return folder.data.id;
  } catch (error) {
    console.error("Error creating/retrieving PAI Chatbot folder:", error);
    throw error; // Propagate the error to handle it at the route level
  }
}

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
    scope: ["profile", "email", "https://www.googleapis.com/auth/drive.file"],
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
  console.log("User authenticated:", req.user.displayName);
  res.render("home", {
    user: req.user,
  });
});

// Chat endpoint with improved error handling
app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    // Validate input
    if (!userMessage || typeof userMessage !== "string") {
      return res.status(400).json({ error: "Invalid message format" });
    }

    // Using the GoogleGenerativeAI library instead of direct API calls
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
      const result = await model.generateContent(userMessage);
      const response = await result.response;
      const text = response.text();

      return res.json({ reply: text });
    } catch (genAiError) {
      console.error("GoogleGenerativeAI library error:", genAiError);

      // Fallback to direct API call if library fails
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          contents: [
            {
              parts: [{ text: userMessage }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 800,
            topP: 0.8,
            topK: 40,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      // Extract text from response
      let replyText = "No response generated";
      if (
        response.data &&
        response.data.candidates &&
        response.data.candidates[0] &&
        response.data.candidates[0].content &&
        response.data.candidates[0].content.parts &&
        response.data.candidates[0].content.parts[0]
      ) {
        replyText = response.data.candidates[0].content.parts[0].text;
      }

      return res.json({ reply: replyText });
    }
  } catch (error) {
    // Detailed error logging
    console.error("Error in /chat endpoint:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error message:", error.message);
    }

    // Provide specific error messages based on error type
    if (error.response?.status === 400) {
      return res.status(400).json({ error: "Bad request to Gemini API" });
    } else if (
      error.response?.status === 401 ||
      error.response?.status === 403
    ) {
      return res.status(500).json({
        error: "Authentication failed with Gemini API. Check your API key.",
      });
    } else if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return res.status(503).json({ error: "Gemini API service unavailable" });
    }

    res.status(500).json({ error: "Error communicating with AI service" });
  }
});

// List available models endpoint
app.get("/list-models", async (req, res) => {
  try {
    const response = await axios.get(
      `https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`
    );

    res.json({ models: response.data });
  } catch (error) {
    console.error("List Models Error:", error.response?.data || error.message);
    res.status(500).json({
      status: "Failed to list models",
      error: error.response?.data?.error || error.message,
    });
  }
});

// Upload route
app.post("/upload", ensureAuthenticated, upload.any(), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded." });
    }

    // Get the drive client for this user
    const userDrive = getUserDriveClient(req);

    // Get or create the folder using the user's drive client
    const folderId = await getOrCreatePaiChatbotFolder(userDrive);
    if (!folderId) {
      return res.status(500).json({
        success: false,
        message: "Could not create or find Drive folder.",
      });
    }

    const results = [];
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt =
      "Extract a one-word document name in lowercase and JSON format";

    for (const file of req.files) {
      try {
        const imagePart = fileToGenerativePart(file.path, file.mimetype);
        const generatedContent = await model.generateContent([
          prompt,
          imagePart,
        ]);
        const aiGeneratedName = generatedContent.response
          .text()
          .replace(/["{}]/g, "")
          .trim(); // Clean JSON output

        console.log(
          `Generated filename for ${file.originalname}: ${aiGeneratedName}`
        );

        // Upload file to Google Drive
        const fileMetadata = {
          name: `${aiGeneratedName}${path.extname(file.originalname)}`,
          parents: [folderId],
        };

        const media = {
          mimeType: file.mimetype,
          body: fs.createReadStream(file.path),
        };

        const driveResponse = await userDrive.files.create({
          resource: fileMetadata,
          media: media,
          fields: "id, webViewLink, name",
        });

        results.push({
          originalFileName: file.originalname,
          aiGeneratedName: aiGeneratedName,
          driveFileId: driveResponse.data.id,
          driveLink: driveResponse.data.webViewLink,
        });

        // Remove file from local storage after upload
        fs.unlinkSync(file.path);
      } catch (fileError) {
        console.error(`Error processing file ${file.originalname}:`, fileError);
        results.push({
          originalFileName: file.originalname,
          error: fileError.message,
        });
      }
    }

    console.log("Final response to frontend:", results);
    res.status(200).json({ success: true, results });
  } catch (error) {
    console.error("Error processing files:", error);
    res
      .status(500)
      .json({ success: false, message: "File processing failed." });
  }
});

// Route to retrieve files by AI-generated name
app.get("/retrieve/:name", ensureAuthenticated, async (req, res) => {
  try {
    // Get the drive client for this user
    const userDrive = getUserDriveClient(req);

    const folderId = await getOrCreatePaiChatbotFolder(userDrive);
    if (!folderId) {
      return res
        .status(500)
        .json({ success: false, message: "Could not find Drive folder." });
    }

    const aiGeneratedName = req.params.name;

    const response = await userDrive.files.list({
      q: `'${folderId}' in parents and name contains '${aiGeneratedName}' and trashed=false`,
      fields: "files(id, name, webViewLink)",
    });

    if (response.data.files.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "File not found." });
    }

    const file = response.data.files[0]; // Get first match
    res.status(200).json({
      success: true,
      fileName: file.name,
      fileId: file.id,
      driveLink: file.webViewLink,
    });
  } catch (error) {
    console.error("Error retrieving file:", error);
    res.status(500).json({ success: false, message: "File retrieval failed." });
  }
});

// Health check endpoint
app.get("/health", (_, res) => {
  res.status(200).json({ status: "ok" });
});

// Logout route
app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

// Handle undefined routes
app.use((_, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler
app.use((err, _, res, next) => {
  console.error("Unhandled error:", err);
  res
    .status(500)
    .json({ error: "Internal server error", message: err.message });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully");
  process.exit(0);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
