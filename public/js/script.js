document.querySelector(".send").addEventListener("click", async (event) => {
  event.preventDefault();

  let inputField = document.querySelector("#text-input");
  let message = inputField.value.trim();

  if (message === "") {
    alert("Please enter a message.");
    return;
  }

  appendMessage("user", message); // Show user message in chatbox
  inputField.value = ""; // Clear input field

  try {
    let response = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    let data = await response.json();
    console.log("Bot response received:", data); // Debugging log
    appendMessage("bot", data.reply); // Show bot response
  } catch (error) {
    console.error("Chat error:", error);
    appendMessage("bot", "⚠️ Error: Could not get a response.");
  }
});

// Function to show messages in chatbox
function appendMessage(sender, text) {
  let chatbox = document.getElementById("chatbox");
  let messageElement = document.createElement("div");
  messageElement.className = sender === "user" ? "user-message" : "bot-message";
  messageElement.textContent = text;
  chatbox.appendChild(messageElement);
}

