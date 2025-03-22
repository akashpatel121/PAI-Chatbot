const express = require("express");
const passport = require("passport");
const session = require("express-session");
const path = require("path");
const mongoose = require("mongoose");
const multer = require("multer");
const fs = require("fs");
const { google } = require("googleapis");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

// MongoDB Schema and Model
const fileSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  driveFileId: { type: String, required: true },
});
const File = mongoose.model("File", fileSchema);

// OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_CALLBACK_URL
);
const drive = google.drive({ version: "v3", auth: oauth2Client });

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Multer Configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync("upload/")) fs.mkdirSync("upload/");
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

// Passport Configuration
passport.use(
  new (require("passport-google-oauth20").Strategy)(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ["profile", "email", "https://www.googleapis.com/auth/drive.file"],
    },
    (accessToken, refreshToken, profile, done) => {
      profile.accessToken = accessToken;
      profile.refreshToken = refreshToken;
      done(null, profile);
    }
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Middleware for Authentication
const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.redirect("/");
};

// Helper Functions
function getUserDriveClient(req) {
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

async function getOrCreatePaiChatbotFolder(driveClient) {
  const response = await driveClient.files.list({
    q: "name='PAI Chatbot' and mimeType='application/vnd.google-apps.folder'",
    fields: "files(id)",
  });

  if (response.data.files.length > 0) return response.data.files[0].id;

  const folder = await driveClient.files.create({
    resource: {
      name: "PAI Chatbot",
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });

  return folder.data.id;
}

// Routes
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "public/html/root.html"))
);

app.get("/auth/google", passport.authenticate("google"));

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => res.redirect("/home")
);

app.get("/home", ensureAuthenticated, (req, res) => {
  res.render("home", { user: req.user });
});

app.post("/upload", ensureAuthenticated, upload.any(), async (req, res) => {
  const userDrive = getUserDriveClient(req);
  const folderId = await getOrCreatePaiChatbotFolder(userDrive);

  if (!folderId) {
    return res
      .status(500)
      .json({ success: false, message: "Drive folder error" });
  }

  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }

    const driveUploads = await Promise.all(
      req.files.map(async (file) => {
        try {
          const fileMetadata = {
            name: file.originalname,
            parents: [folderId],
          };

          const media = {
            mimeType: file.mimetype,
            body: fs.createReadStream(file.path),
          };

          // Upload file to Google Drive
          const driveResponse = await userDrive.files.create({
            resource: fileMetadata,
            media,
            fields: "id, name, webViewLink",
          });

          return {
            originalFileName: file.originalname,
            driveFileId: driveResponse.data.id,
            driveLink: driveResponse.data.webViewLink,
            filePath: file.path,
            mimeType: file.mimetype,
          };
        } catch (uploadError) {
          console.error(
            `Error uploading file ${file.originalname}:`,
            uploadError
          );
          return { error: uploadError.message };
        }
      })
    );

    // Process files with Gemini to generate filenames
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const prompt =
      "Extract a one-word document name in lowercase and JSON format";

    await Promise.all(
      driveUploads.map(async (upload) => {
        if (upload.error) {
          return upload; // Skip files with upload errors
        }

        try {
          // Read file and convert to Gemini input
          const imagePart = {
            inlineData: {
              data: Buffer.from(fs.readFileSync(upload.filePath)).toString(
                "base64"
              ),
              mimeType: upload.mimeType,
            },
          };

          // Generate filename using Gemini
          const generatedContent = await model.generateContent([
            prompt,
            imagePart,
          ]);
          // Parse the response to extract the document name
          // Parse the response to extract the document name
          let aiGeneratedName;
          try {
            let responseText = generatedContent.response.text();

            // Clean up the response text (remove backticks and surrounding `json` formatting)
            responseText = responseText.replace(/```json|```/g, "").trim();

            // Parse the cleaned response as JSON
            const parsedResponse = JSON.parse(responseText); // Parse as JSON
            aiGeneratedName = parsedResponse.document_name; // Extract document_name

            if (!aiGeneratedName) {
              throw new Error("document_name not found in response");
            }
          } catch (parseError) {
            console.error("Error parsing AI response:", parseError);
            aiGeneratedName = "default_name"; // Fallback name if parsing fails
          }

          // Rename the file on Google Drive
          await userDrive.files.update({
            fileId: upload.driveFileId,
            resource: {
              name: `${aiGeneratedName}${path.extname(
                upload.originalFileName
              )}`,
            },
          });

          // Store filename and Drive file ID in MongoDB
          const newFile = new File({
            filename: aiGeneratedName, // Generated by Gemini
            driveFileId: upload.driveFileId, // ID from Google Drive
          });
          await newFile.save();

          console.log("Saved to DB:", {
            aiGeneratedName,
            driveFileId: upload.driveFileId,
          });

          // Clean up local file
          fs.unlinkSync(upload.filePath);
        } catch (error) {
          console.error(
            `Error processing file ${upload.originalFileName}:`,
            error
          );
          fs.unlinkSync(upload.filePath); // Ensure local files are deleted
        }
      })
    );

    res.status(200).json({
      success: true,
      message: "Files uploaded and processed successfully",
    });
  } catch (error) {
    console.error("Error processing files:", error);
    res.status(500).json({ success: false, message: "File processing failed" });
  }
});

// Add this route to server.js
app.post("/prompt", ensureAuthenticated, async (req, res) => {
  const { text } = req.body;
  console.log("User input text:", text);

  if (!text) {
    return res
      .status(400)
      .json({ success: false, message: "No text provided" });
  }

  try {
    // Process the text with Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // Ask Gemini what the user wants
    const prompt = `What does user want in oneword lowercase no special character ${text}`;
    const result = await model.generateContent(prompt);

    // Extract the generated text using the `text()` function
    const generatedText = result.response.text().trim().toLowerCase();
    console.log("Gemini's response:", generatedText);

    // Retrieve file ID from MongoDB using the generated filename
    const file = await File.findOne({ filename: generatedText });

    if (file) {
      console.log("Found file in database:", {
        filename: file.filename,
        driveFileId: file.driveFileId,
      });
    } else {
      console.log("No file found with filename:", generatedText);
    }

    // Send the response back to the client
    res.status(200).json({
      success: true,
      message: "Text processed successfully",
      result: generatedText,
      fileFound: !!file,
      fileId: file ? file.driveFileId : null,
    });
  } catch (error) {
    console.error("Error processing text:", error);
    res.status(500).json({ success: false, message: "Text processing failed" });
  }
});

// Add this route to get file content from Google Drive
app.get("/file/:fileId", ensureAuthenticated, async (req, res) => {
  const { fileId } = req.params;

  if (!fileId) {
    return res
      .status(400)
      .json({ success: false, message: "No file ID provided" });
  }

  try {
    const userDrive = getUserDriveClient(req);

    // Get file metadata to check the mimeType
    const fileMetadata = await userDrive.files.get({
      fileId: fileId,
      fields: "id, name, mimeType",
    });

    // Get the file content
    const response = await userDrive.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      {
        responseType: "stream",
      }
    );

    // Set appropriate content type
    res.setHeader("Content-Type", fileMetadata.data.mimeType);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${fileMetadata.data.name}"`
    );

    // Pipe the file stream directly to the response
    response.data.pipe(res);
  } catch (error) {
    console.error("Error retrieving file from Drive:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to retrieve file" });
  }
});

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect("/");
  });
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
