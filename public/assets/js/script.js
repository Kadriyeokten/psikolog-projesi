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

/**
 * LOAD SITE SETTINGS (Title & Logo)
 */

window.loadSiteSettings = async function () {
  try {
    // Check if we are on a subdomain
    const host = window.location.hostname;
    let isSubdomain = false;
    if (host.includes('.localhost')) {
      const parts = host.split('.localhost');
      if (parts[0] !== 'localhost' && parts[0] !== '') isSubdomain = true;
    } else {
      const parts = host.split('.');
      if (parts.length >= 3 && parts[0] !== 'www') isSubdomain = true;
    }

    if (isSubdomain) {
      // Hide Doctors link in navigation on subdomains
      const doctorsLinks = document.querySelectorAll('a[href="doctors.html"]');
      doctorsLinks.forEach(link => {
        const parentLi = link.closest('li');
        if (parentLi) parentLi.style.display = 'none';
      });
    }

    const res = await fetch("/api/site-content");
    const data = await res.json();
    if (data) {
      // Update Title
      if (data.site_title) {
        document.title = data.site_title;
        window.dynamicClinicName = data.site_title;
        if (typeof window.applyTranslations === 'function') {
          window.applyTranslations();
        }
      }
      
      // Update Logos
      if (data.site_logo_url) {
        const logos = document.querySelectorAll(".logo img, .footer-brand .logo img");
        logos.forEach(img => {
          img.src = data.site_logo_url;
          if (data.site_title) img.alt = data.site_title;
        });
        const favicon = document.querySelector("link[rel*='icon']");
        if (favicon) favicon.href = data.site_logo_url;
      }

      // Update WhatsApp FAB
      const waFab = document.getElementById("whatsappLink");
      if (waFab && data.whatsapp_number) {
        const lang = localStorage.getItem("preferredLanguage") || "tr";
        const text = lang === "en" ? "Hello, I would like to book an appointment." : "Merhaba, randevu oluşturmak istiyorum.";
        waFab.href = `https://wa.me/${data.whatsapp_number}?text=${encodeURIComponent(text)}`;
        waFab.style.display = "flex";
      } else if (waFab) {
        waFab.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Site settings load error:", err);
  }
}

window.addEventListener("load", function () {
  if (preloader) {
    preloader.classList.add("loaded");
  }
  document.body.classList.add("loaded");
  window.loadSiteSettings(); // Load title and logo on page load
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
    
    // Admin Link Gösterimi
    if (adminLink) {
      if (role === "admin") { // Sadece normal adminler görsün
        adminLink.style.display = "block";
      } else {
        adminLink.style.display = "none";
      }
    }

    // Süper Admin Link Gösterimi (Sadece Superadmin ise)
    const superAdminLink = document.getElementById("superAdminLink");
    if (superAdminLink) {
      if (role === "superadmin") {
        superAdminLink.style.display = "block";
      } else {
        superAdminLink.style.display = "none";
      }
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

  // Dropdown Toggle (Desktop & Mobile)
  const userDropdown = document.querySelector(".user-dropdown");
  const userTrigger = document.querySelector(".user-trigger");
  
  if (userTrigger && userDropdown) {
    userTrigger.addEventListener("click", function(e) {
      e.stopPropagation();
      userDropdown.classList.toggle("active");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", function(e) {
      if (!userDropdown.contains(e.target)) {
        userDropdown.classList.remove("active");
      }
    });
  }
}


