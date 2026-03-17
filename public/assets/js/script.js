'use strict';





/**
 * add event listener on multiple elements
 */

const addEventOnElements = function (elements, eventType, callback) {
  for (let i = 0, len = elements.length; i < len; i++) {
    elements[i].addEventListener(eventType, callback);
  }
}



/**
 * PRELOADER
 * 
 * preloader will be visible until document load
 */

const preloader = document.querySelector("[data-preloader]");

window.addEventListener("load", function () {
  if (preloader) {
    preloader.classList.add("loaded");
  }
  document.body.classList.add("loaded");
});



/**
 * MOBILE NAVBAR
 * 
 * show the mobile navbar when click menu button
 * and hidden after click menu close button or overlay
 */

const navbar = document.querySelector("[data-navbar]");
const navTogglers = document.querySelectorAll("[data-nav-toggler]");
const overlay = document.querySelector("[data-overlay]");

const toggleNav = function () {
  navbar.classList.toggle("active");
  overlay.classList.toggle("active");
  document.body.classList.toggle("nav-active");
}

addEventOnElements(navTogglers, "click", toggleNav);



/**
 * HEADER & BACK TOP BTN
 * 
 * active header & back top btn when window scroll down to 100px
 */

const header = document.querySelector("[data-header]");
const backTopBtn = document.querySelector("[data-back-top-btn]");

const activeElementOnScroll = function () {
  if (window.scrollY > 100) {
    header.classList.add("active");
    backTopBtn.classList.add("active");
  } else {
    header.classList.remove("active");
    backTopBtn.classList.remove("active");
  }
}

window.addEventListener("scroll", activeElementOnScroll);



/**
 * SCROLL REVEAL
 */

window.revealElementOnScroll = function () {
  const revealElements = document.querySelectorAll("[data-reveal]");
  for (let i = 0, len = revealElements.length; i < len; i++) {
    if (revealElements[i].getBoundingClientRect().top < window.innerHeight / 1.15) {
      revealElements[i].classList.add("revealed");
    } else {
      revealElements[i].classList.remove("revealed");
    }
  }
}

window.addEventListener("scroll", window.revealElementOnScroll);

window.addEventListener("load", window.revealElementOnScroll);

/**
 * AUTH UI & DROPDOWN
 */

window.initAuthUI = function () {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  const userName = localStorage.getItem("name") || "Kullanıcı";

  const loginItem = document.getElementById("loginItem");
  const userMenu = document.getElementById("userMenu");
  const userNameEl = document.getElementById("userName");
  const adminLink = document.getElementById("adminLink");
  const logoutBtn = document.getElementById("logoutBtn");

  if (token) {
    if (loginItem) loginItem.style.display = "none";
    if (userMenu) userMenu.style.display = "block";
    if (userNameEl) userNameEl.textContent = userName;
    
    // Show/Hide admin link based on role
    if (role === "admin") {
      if (adminLink) adminLink.style.display = "flex";
    } else {
      if (adminLink) adminLink.style.display = "none";
    }
  } else {
    if (loginItem) loginItem.style.display = "block";
    if (userMenu) userMenu.style.display = "none";
  }

  // Logout Logic
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("userId");
      localStorage.removeItem("name");
      window.location.href = "login.html";
    });
  }

  // Mobile Dropdown Toggle
  const userTrigger = document.querySelector(".user-trigger");
  if (userTrigger && window.innerWidth < 1200) {
    userTrigger.addEventListener("click", function() {
      const parent = this.closest(".user-dropdown");
      parent.classList.toggle("active");
    });
  }
}


