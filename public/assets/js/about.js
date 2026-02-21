// about.js

document.addEventListener("DOMContentLoaded", () => {
  renderAboutContent();
});

async function renderAboutContent() {
  try {
    const res = await fetch("/api/site-content");
    const data = await res.json();

    const titleEl = document.getElementById("about_title");
    const textEl = document.getElementById("about_text");
    const imageEl = document.getElementById("about_image");

    const fTitle1 = document.getElementById("feature_title1");
    const fTitle2 = document.getElementById("feature_title2");
    const fTitle3 = document.getElementById("feature_title3");

    const fDesc1 = document.getElementById("feature_desc1");
    const fDesc2 = document.getElementById("feature_desc2");
    const fDesc3 = document.getElementById("feature_desc3");

    const f1 = document.getElementById("feature1");
    const f2 = document.getElementById("feature2");
    const f3 = document.getElementById("feature3");
    const f4 = document.getElementById("feature4");

    const isHomePage = window.location.pathname.endsWith("index.html") || window.location.pathname === "/";

    if (titleEl) titleEl.textContent = data.about_title || "";
    
    // Ana sayfada metni kısaltalım
    if (textEl) {
      if (isHomePage && data.about_text && data.about_text.length > 500) {
        textEl.textContent = data.about_text.substring(0, 500) + "...";
      } else {
        textEl.textContent = data.about_text || "";
      }
    }

    if (imageEl && data.about_image) {
      imageEl.src = data.about_image;
    }

    if (fTitle1) fTitle1.textContent = data.feature_title1 || "";
    if (fTitle2) fTitle2.textContent = data.feature_title2 || "";
    if (fTitle3) fTitle3.textContent = data.feature_title3 || "";

    if (fDesc1) fDesc1.textContent = data.feature_desc1 || "";
    if (fDesc2) fDesc2.textContent = data.feature_desc2 || "";
    if (fDesc3) fDesc3.textContent = data.feature_desc3 || "";

    if (f1) f1.textContent = data.feature1 || "";
    if (f2) f2.textContent = data.feature2 || "";
    if (f3) f3.textContent = data.feature3 || "";
    if (f4) f4.textContent = data.feature4 || "";

    // Tab mantığını yönet (Sadece aboutus.html sayfasında varsa ve ana sayfa değilse)
    const tabList = document.querySelector(".tab-list");
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabText = document.querySelector(".tab-text");

    if (isHomePage) {
      // Ana sayfada tabları ve detay açıklamayı gizleyelim
      if (tabList) tabList.style.display = "none";
      if (tabText) tabText.style.display = "none";
    } else {
      if (tabBtns.length > 0 && tabText) {
        tabBtns.forEach((btn, index) => {
          btn.addEventListener("click", () => {
            // Aktif sınıfını güncelle
            tabBtns.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            // Metni güncelle
            if (index === 0) tabText.textContent = data.feature_desc1;
            if (index === 1) tabText.textContent = data.feature_desc2;
            if (index === 2) tabText.textContent = data.feature_desc3;
          });
        });
      }
    }

  } catch (err) {
    console.error("Hakkımızda içeriği yüklenemedi:", err);
  }
}
