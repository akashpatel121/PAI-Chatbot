document.getElementById("signin-btn").addEventListener("click", () => {
  window.location.href = "/html/login.html";
});

//* Typing Animation
const text = "Welcome to your Personal Assistant ! Please login to continue.";
let index = 0;

function typeLetter() {
  if (index < text.length) {
    document.getElementById("typing-text").innerHTML += text.charAt(index);
    index++;
  } else {
    clearInterval(typingInterval);
  }
}
const typingInterval = setInterval(typeLetter, 80);

//Redirect to loign
document.getElementById("search").addEventListener("click", () => {
  const searchInput = document.getElementById("search-input");
  searchInput.placeholder = "Please log in first to continue";
  searchInput.focus();
  setTimeout(() => {
    window.location.href = "/html/login.html";
  }, 1000);
});
