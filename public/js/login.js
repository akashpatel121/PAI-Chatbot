
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

    var t1 = gsap.timeline()
gsap.to(".container h1",{
  x:-60,
  opacity:0,
  delay:0.4,
})
gsap.to(".container p",{
  x:-60,
  opacity:0,
  delay:0.4,
})
gsap.to(".container .input-group",{
  x:-60,
  opacity:0,
  delay:0.4,
})
gsap.to(".container .social-login",{
  x:-60,
  opacity:0,
  delay:0.4,
})
gsap.to(".container .separator",{
  x:-60,
  opacity:0,
  delay:0.4,
})
gsap.to(".container .img-container img",{
  x: 80,
  opacity:0,
  delay:0.4,
  duration:0.6,
})
var t2 = gsap.timeline()
t2.to(".container .user",{
  x:-60,
  opacity:0,
  delay:0.4,
}) 

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

var t1 = gsap.timeline()
t1.from(".container h1",{
  x:-60,
  opacity:0,
  delay:0.4,
})
t1.from(".container p",{
  x:-60,
  opacity:0,
  delay:-0.2,
})
t1.from(".container .input-group",{
  x:-60,
  opacity:0,
  delay:-0.3,
})
t1.from(".container .social-login",{
  x:-60,
  opacity:0,
  delay:-0.3,
})
t1.from(".container .separator",{
  x:-60,
  opacity:0,
  delay:-0.4 ,
})
gsap.from(".container .img-container img",{
  x: 80,
  opacity:0,
  delay:0.4,
  duration:0.6,
})
//-----delay-----
function delayedRedirect(url, delay) {
  setTimeout(function() {
      window.location.href = url;
  }, delay);
}

var t2 = gsap.timeline()
t2.from(".container .user",{
  x:-60,
  opacity:0,
  delay:0.4,
}) 