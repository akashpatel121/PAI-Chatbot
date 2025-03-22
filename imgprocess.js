const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
require("dotenv").config();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Converts local file information to base64
function fileToGenerativePart(path, mimeType) {
  return {
    inlineData: {
      data: Buffer.from(fs.readFileSync(path)).toString("base64"),
      mimeType,
    },
  };
}

async function run() {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const prompt = "Extract a one-word document name in lowecase and JSON format";

  const imageParts = [
    fileToGenerativePart(__dirname + "/images/1.jpg", "image/jpg"),
    fileToGenerativePart(__dirname + "/images/2.jpeg", "image/jpeg"),
    fileToGenerativePart(__dirname + "/images/3.jpeg", "image/jpeg"),
  ];

  const generatedContent = await model.generateContent([prompt, ...imageParts]);

  console.log(generatedContent.response.text());
}

run();


//---------------------------------------------------------------//
//const fs = require("fs");
// Mock function to simulate API response
// function getDocumentNamesMock() {
//   return [
//     { document_name: "marksheet", file: "1.jpg" },
//     { document_name: "voterid", file: "2.jpeg" },
//     { document_name: "drivinglicence", file: "3.jpeg" },
//   ];
// }

// // Converts local file information to base64
// function fileToGenerativePart(path, mimeType) {
//   if (!fs.existsSync(path)) {
//     console.error(`❌ File not found: ${path}`);
//     process.exit(1);
//   }
//   return {
//     inlineData: {
//       data: Buffer.from(fs.readFileSync(path)).toString("base64"),
//       mimeType,
//     },
//   };
// }

// // Main function (mocked for free-tier users)
// async function run() {
//   const response = getDocumentNamesMock();
//   console.log(JSON.stringify(response, null, 2));
// }

// run();
