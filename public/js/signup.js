
const loginLink = document.getElementById('loginLink');
const signupLink = document.getElementById('signupLink');
const imageContainer = document.getElementById('imageContainer');

if (loginLink) {
  loginLink.addEventListener('click', (e) => {
    e.preventDefault();
    imageContainer.classList.add('slide-out-left');
    setTimeout(() => {
      window.location.href = loginLink.href;
    }, 500);
  });
}

if (signupLink) {
  signupLink.addEventListener('click', (e) => {

    e.preventDefault();
    imageContainer.classList.add('slide-out-right');
    setTimeout(() => {
      window.location.href = signupLink.href;
    }, 500);
  });
}

//Loign call
document.getElementById('google').addEventListener('click', () => {
  window.location.href = 'http://localhost:3000/auth/google';
});

var t2 = gsap.timeline()
t2.from(".container button",{
  x:-60,
  opacity:0,
  delay:0.4,
}) 